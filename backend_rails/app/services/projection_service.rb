class ProjectionService
  # Earliest season that can be used as a backtest target (data quality threshold)
  MIN_BACKTEST_SEASON = 2020

  # Statcast-to-projection adjustment parameters
  BARREL_TO_HR_FB_MULTIPLIER    = 2.2   # barrel% converts to implied HR/FB at ~2.2x rate
  LEAGUE_AVG_HARD_HIT_RATE      = 0.33  # ~2024 MLB league-average hard-hit rate
  HARD_HIT_HR_SENSITIVITY       = 1.5   # how much above/below league-average hard-hit shifts HR/FB
  STATCAST_HR_FB_WEIGHT_FRACTION = 0.5  # Statcast HR/FB estimate blended at half the scenario statcast_weight

  # Minimum qualified sample for pace-based projections and actuals
  MIN_PA_FOR_SEASON_PACE  = 30
  MIN_IP_FOR_SEASON_PACE  = 5.0
  MIN_PA_FOR_ACTUAL_STATS = 30
  MIN_IP_FOR_ACTUAL_STATS = 5.0

  class << self
    # -----------------------------------------------------------------------
    # Create a projection run: compute stats for each player, persist, return.
    # This is the primary entry point for batch projections (leaderboard).
    # -----------------------------------------------------------------------
    def create_run(scenario_id:, player_ids:, projection_type:, seasons: nil, name: nil)
      scenario     = load_scenario(scenario_id)
      current_year = Date.today.year

      target_seasons = Array(seasons).map(&:to_i).select { |s| s >= MIN_BACKTEST_SEASON && s <= current_year }
      target_seasons = [current_year] if target_seasons.empty?

      run = ProjectionRun.create!(
        projection_scenario:  scenario,
        scenario_params_json: snapshot_params(scenario).to_json,
        projection_type:      projection_type,
        season:               target_seasons.max,
        seasons_json:         target_seasons.to_json,
        ran_at:               Time.now,
        name:                 name.presence,
        player_count:         0
      )

      projections     = []
      player_names_seen = {}  # player_id => name, for auto-naming the run

      Array(player_ids).each do |raw_id|
        player_id = raw_id.to_i
        next unless player_id > 0

        player_name_val = ProjectionDataService.player_name(player_id)
        player_names_seen[player_id] ||= player_name_val

        target_seasons.each do |season|
          is_backtest = season < current_year

          result = if is_backtest
            backtest_player(player_id, target_season: season, scenario_id: scenario.id)
          else
            compute_player(player_id, scenario, projection_type, season)
          end

          if result.nil? || result[:error]
            Rails.logger.warn "Projection skipped for #{player_id}/#{season}: #{result&.dig(:error) || 'nil'}"
            next
          end

          proj_stats = is_backtest ? result[:stats]          : result[:projected_stats]
          comp_stats = is_backtest ? nil                     : result[:component_stats]
          p_type     = is_backtest ? result[:player_type].to_s : result[:player_type]

          actual_hash   = is_backtest ? fetch_actual_stats(player_id, season, p_type) : nil
          delta_hash    = actual_hash ? compute_accuracy_delta(proj_stats, actual_hash) : nil

          PlayerProjection.upsert(
            {
              projection_run_id: run.id,
              player_id:         player_id,
              player_name:       player_name_val,
              player_type:       p_type,
              projection_type:   is_backtest ? "full_season" : projection_type,
              season:            season,
              projected_pa:      proj_stats[:pa],
              projected_ip:      proj_stats[:ip],
              projected_stats:   proj_stats.to_json,
              component_stats:   comp_stats&.to_json,
              actual_stats:      actual_hash&.to_json,
              accuracy_delta:    delta_hash&.to_json,
              computed_at:       Time.now,
              created_at:        Time.now,
              updated_at:        Time.now,
            },
            unique_by: %i[player_id projection_run_id season]
          )

          projections << {
            player_id:       player_id,
            player_name:     player_name_val,
            player_type:     p_type,
            season:          season,
            run_id:          run.id,
            is_backtest:     is_backtest,
            projected_stats: proj_stats,
            component_stats: comp_stats,
            actual_stats:    actual_hash,
            accuracy_delta:  delta_hash,
          }
        end
      rescue => e
        Rails.logger.error "Projection error for #{player_id}: #{e.message}"
      end

      total_players = Array(player_ids).map(&:to_i).count { |id| id > 0 }
      run.update!(player_count: total_players)

      if name.blank?
        unique_names = player_names_seen.values.compact
        display      = unique_names.first(5)
        extra        = total_players - display.size
        auto_name    = extra > 0 ? "#{display.join(', ')} +#{extra} more" : display.join(', ')
        run.update_column(:name, auto_name) if auto_name.present?
      end

      { run: serialize_run(run), projections: projections, count: projections.size }
    rescue => e
      { error: e.message }
    end

    # -----------------------------------------------------------------------
    # Single-player projection (player profile tab).
    # Returns the most recent stored projection, or computes + stores one.
    # -----------------------------------------------------------------------
    def project_player(player_id, scenario_id: nil, type: "rest_of_season", refresh: false)
      scenario = load_scenario(scenario_id)
      season   = Date.today.year

      unless refresh
        cached = PlayerProjection
          .joins(:projection_run)
          .where(
            player_id:      player_id,
            projection_type: type,
            season:         season,
            projection_runs: { projection_scenario_id: scenario.id }
          )
          .order("projection_runs.ran_at DESC")
          .first
        return serialize(cached) if cached
      end

      result = create_run(
        scenario_id:     scenario.id,
        player_ids:      [player_id],
        projection_type: type,
        name:            nil
      )
      return result if result[:error]

      result[:projections].first || { error: "Projection computation produced no result" }
    rescue => e
      { error: e.message }
    end

    # -----------------------------------------------------------------------
    # Backtest: run the engine for a past season using only pre-season data.
    # Used by ProjectionAccuracyService to compute historical accuracy.
    # -----------------------------------------------------------------------
    def backtest_player(player_id, target_season:, scenario_id: nil)
      scenario    = load_scenario(scenario_id)
      player_type = ProjectionDataService.detect_player_type(player_id)
      age         = ProjectionDataService.player_age(player_id, season: target_season)

      result = if player_type == :pitcher
        project_pitcher_for(player_id, age, scenario, "full_season", before_season: target_season)
      else
        project_batter_for(player_id, age, scenario, "full_season", before_season: target_season)
      end

      return nil if result[:error]
      { stats: result[:projected_stats], player_type: player_type }
    rescue => e
      Rails.logger.warn "backtest_player #{player_id}/#{target_season}: #{e.message}"
      nil
    end

    # -----------------------------------------------------------------------
    # Leaderboard: all projections in a given run, filtered by player type.
    # -----------------------------------------------------------------------
    def leaderboard(run_id:, player_type: "batter", season: nil)
      run = ProjectionRun.find(run_id)
      scope = run.player_projections.where(player_type: player_type)
      scope = scope.where(season: season) if season
      scope.map { |r| serialize(r) }
    rescue ActiveRecord::RecordNotFound
      []
    rescue => e
      Rails.logger.error "Leaderboard error: #{e.message}"
      []
    end

    # -----------------------------------------------------------------------
    # List runs for the run selector, most recent first.
    # -----------------------------------------------------------------------
    def list_runs(scenario_id: nil, season: nil)
      scope = ProjectionRun.includes(:projection_scenario).recent
      scope = scope.where(projection_scenario_id: scenario_id) if scenario_id
      scope = scope.where(season: season || Date.today.year)
      scope.limit(100).map { |r| serialize_run(r) }
    rescue => e
      Rails.logger.error "list_runs error: #{e.message}"
      []
    end

    private

    # Dispatch to batter or pitcher computation
    def compute_player(player_id, scenario, type, season)
      player_type = ProjectionDataService.detect_player_type(player_id)
      age         = ProjectionDataService.player_age(player_id, season: season)

      result = if player_type == :pitcher
        project_pitcher_for(player_id, age, scenario, type)
      else
        project_batter_for(player_id, age, scenario, type)
      end

      result.merge(player_type: player_type.to_s)
    end

    def project_batter_for(player_id, age, scenario, type, before_season: nil)
      history = ProjectionDataService.batter_history(
        player_id,
        years:  scenario.history_years,
        min_pa: scenario.min_pa_for_history,
        before_season: before_season
      )
      return { error: "No historical batting data found" } if history.empty?

      league  = ProjectionDataService.league_means(player_type: :batter)
      weights = scenario.year_weights

      components = {}

      [:bb_pct, :k_pct, :babip, :iso, :hbp_pct].each do |stat|
        weighted_rate = ProjectionEngine.weighted_average(history, weights, stat)
        components[stat] = weighted_rate || league[stat]
      end

      components[:fb_pct]    = league[:fb_pct]
      components[:hr_fb_pct] = estimate_hr_fb_pct(history, league)

      if scenario.statcast_weight > 0
        recent_season = history.first
        if recent_season&.dig(:x_ba)
          components[:babip] = blend(components[:babip], recent_season[:x_ba], scenario.statcast_weight)
        end
        if recent_season&.dig(:barrel_pct)
          statcast_hr_fb_estimate = estimate_hr_fb_from_barrel(recent_season[:barrel_pct])
          components[:hr_fb_pct] = blend(components[:hr_fb_pct], statcast_hr_fb_estimate, scenario.statcast_weight * STATCAST_HR_FB_WEIGHT_FRACTION)
        end
      end

      # Total PA across all historical seasons is the correct regression sample size.
      # Year weights affect the weighted average but shouldn't inflate reliability.
      total_historical_pa = history.sum { |s| s[:pa].to_f }
      [:bb_pct, :k_pct, :babip, :iso, :hr_fb_pct].each do |stat|
        stabilization_key = stabilization_key_for(stat, :batter)
        components[stat] = ProjectionEngine.regress_to_mean(
          components[stat],
          total_historical_pa,
          league[stat] || components[stat],
          stabilization_key,
          regression_factor: scenario.regression_factor
        )
      end

      if scenario.age_curve_enabled
        components = ProjectionEngine.apply_batter_age_curve(
          components, age, age_curve_factor: scenario.age_curve_factor
        )
      end

      pa = projected_pa(player_id, type, scenario, history: history)
      components[:pa] = pa

      stats = ProjectionEngine.derive_batter_stats(components)

      {
        projected_stats: stats,
        component_stats: components.transform_values { |v| v.is_a?(Float) ? v.round(4) : v },
        projection_type: type,
        season:          Date.today.year,
      }
    end

    def project_pitcher_for(player_id, age, scenario, type, before_season: nil)
      history = ProjectionDataService.pitcher_history(
        player_id,
        years:  scenario.history_years,
        min_ip: scenario.min_ip_for_history,
        before_season: before_season
      )
      return { error: "No historical pitching data found" } if history.empty?

      league  = ProjectionDataService.league_means(player_type: :pitcher)
      weights = scenario.year_weights

      components = {}

      [:k_pct, :bb_pct, :babip].each do |stat|
        weighted_rate = ProjectionEngine.weighted_average(history, weights, stat)
        components[stat] = weighted_rate || league[stat]
      end
      components[:gb_pct]    = league[:gb_pct]
      components[:hr_fb_pct] = estimate_pitcher_hr_fb(history, league, scenario)

      total_historical_bf = history.sum { |s| s[:bf].to_f }
      [:k_pct, :bb_pct, :babip, :hr_fb_pct].each do |stat|
        stabilization_key = stabilization_key_for(stat, :pitcher)
        components[stat] = ProjectionEngine.regress_to_mean(
          components[stat],
          total_historical_bf,
          league[stat] || components[stat],
          stabilization_key,
          regression_factor: scenario.regression_factor
        )
      end

      if scenario.age_curve_enabled
        components = ProjectionEngine.apply_pitcher_age_curve(
          components, age, age_curve_factor: scenario.age_curve_factor
        )
      end

      ip = projected_ip(player_id, type, scenario, history: history)
      components[:ip] = ip

      stats = ProjectionEngine.derive_pitcher_stats(components, era_fip_blend: scenario.era_fip_blend)

      {
        projected_stats: stats,
        component_stats: components.transform_values { |v| v.is_a?(Float) ? v.round(4) : v },
        projection_type: type,
        season:          Date.today.year,
      }
    end

    def load_scenario(scenario_id)
      if scenario_id
        ProjectionScenario.find(scenario_id)
      else
        ProjectionScenario.ensure_default!
        ProjectionScenario.default_scenario
      end
    end

    def snapshot_params(scenario)
      {
        name:                 scenario.name,
        year1_weight:         scenario.year1_weight,
        year2_weight:         scenario.year2_weight,
        year3_weight:         scenario.year3_weight,
        regression_factor:    scenario.regression_factor,
        age_curve_enabled:    scenario.age_curve_enabled,
        age_curve_factor:     scenario.age_curve_factor,
        statcast_weight:      scenario.statcast_weight,
        park_factors_enabled: scenario.park_factors_enabled,
        default_pa:           scenario.default_pa,
        default_ip:           scenario.default_ip,
        era_fip_blend:        scenario.era_fip_blend,
        history_years:        scenario.history_years,
        min_pa_for_history:   scenario.min_pa_for_history,
        min_ip_for_history:   scenario.min_ip_for_history,
      }
    end

    def serialize(record)
      run = record.projection_run
      {
        id:              record.id,
        player_id:       record.player_id,
        player_name:     record.player_name,
        player_type:     record.player_type,
        projection_type: record.projection_type,
        season:          record.season,
        run_id:          run.id,
        ran_at:          run.ran_at,
        scenario_id:     run.projection_scenario_id,
        scenario_name:   run.projection_scenario&.name,
        scenario_params: run.scenario_params,
        projected_stats: record.projected_stats_hash,
        component_stats: record.component_stats_hash,
        actual_stats:    record.actual_stats_hash,
        accuracy_delta:  record.accuracy_delta_hash,
        computed_at:     record.computed_at,
      }
    end

    def serialize_run(run)
      {
        id:               run.id,
        name:             run.name,
        label:            run.label,
        scenario_id:      run.projection_scenario_id,
        scenario_name:    run.projection_scenario&.name,
        scenario_params:  run.scenario_params,
        projection_type:  run.projection_type,
        season:           run.season,
        seasons:          run.seasons,
        is_multi_season:  run.multi_season?,
        player_count:     run.player_count,
        ran_at:           run.ran_at,
      }
    end

    def projected_pa(player_id, type, scenario, history: [])
      season_context = ProjectionDataService.remaining_season_context(player_id, player_type: :batter)
      if type == "rest_of_season"
        season_context[:pa_remaining].clamp(50, 700)
      else
        # Full season: current-season pace (to_date + remaining) when we have enough data;
        # fall back to historical weighted average early in the season.
        if season_context[:pa_to_date] > MIN_PA_FOR_SEASON_PACE
          (season_context[:pa_to_date] + season_context[:pa_remaining]).clamp(200, 700)
        elsif history.any?
          year_weights = scenario.year_weights
          total_weight = 0.0; weighted_sum = 0.0
          history.each_with_index do |season_data, i|
            year_weight   = year_weights.fetch(i, 1).to_f
            weighted_sum += season_data[:pa].to_f * year_weight
            total_weight += year_weight
          end
          (weighted_sum / total_weight).round.clamp(200, 700)
        else
          scenario.default_pa
        end
      end
    rescue
      type == "rest_of_season" ? 300 : scenario.default_pa
    end

    def projected_ip(player_id, type, scenario, history: [])
      season_context = ProjectionDataService.remaining_season_context(player_id, player_type: :pitcher)
      if type == "rest_of_season"
        season_context[:ip_remaining].clamp(5.0, 220.0)
      else
        if season_context[:ip_to_date] > MIN_IP_FOR_SEASON_PACE
          (season_context[:ip_to_date] + season_context[:ip_remaining]).clamp(10.0, 220.0)
        elsif history.any?
          year_weights = scenario.year_weights
          total_weight = 0.0; weighted_sum = 0.0
          history.each_with_index do |season_data, i|
            year_weight   = year_weights.fetch(i, 1).to_f
            weighted_sum += season_data[:ip].to_f * year_weight
            total_weight += year_weight
          end
          (weighted_sum / total_weight).round(1).clamp(10.0, 220.0)
        else
          scenario.default_ip
        end
      end
    rescue
      type == "rest_of_season" ? 80.0 : scenario.default_ip
    end

    def weighted_pa(history, weights)
      history.each_with_index.sum { |s, i| s[:pa].to_f * weights.fetch(i, 0).to_f }
    end

    def weighted_bf(history, weights)
      history.each_with_index.sum { |s, i| s[:bf].to_f * weights.fetch(i, 0).to_f }
    end

    def stabilization_key_for(stat, player_type)
      map = {
        k_pct:     player_type == :batter ? :k_pct_batter  : :k_pct_pitcher,
        bb_pct:    player_type == :batter ? :bb_pct_batter : :bb_pct_pitcher,
        babip:     player_type == :batter ? :babip_batter  : :babip_pitcher,
        iso:       :iso,
        hr_fb_pct: player_type == :batter ? :hr_fb_pct     : :hr_fb_pct_pitcher,
        fb_pct:    :fb_pct,
        gb_pct:    :gb_pct,
      }
      map[stat] || :babip_batter
    end

    def estimate_hr_fb_pct(history, league)
      samples = history.first(2).filter_map { |s| s[:hr_fb_pct] }
      samples.any? ? samples.sum / samples.size : league[:hr_fb_pct]
    end

    def estimate_hr_fb_from_barrel(barrel_pct)
      (barrel_pct * BARREL_TO_HR_FB_MULTIPLIER).clamp(0.03, 0.40)
    end

    def estimate_pitcher_hr_fb(history, league, scenario)
      if scenario.statcast_weight > 0
        recent_season = history.first
        if recent_season&.dig(:hard_hit_pct)
          deviation_from_league = recent_season[:hard_hit_pct] - LEAGUE_AVG_HARD_HIT_RATE
          adjusted = league[:hr_fb_pct] * (1 + deviation_from_league * HARD_HIT_HR_SENSITIVITY)
          return blend(league[:hr_fb_pct], adjusted, scenario.statcast_weight)
        end
      end
      league[:hr_fb_pct]
    end

    def blend(base, statcast_val, weight)
      return base if statcast_val.nil?
      base * (1 - weight) + statcast_val * weight
    end

    # Fetch end-of-season actual stats for a completed season.
    def fetch_actual_stats(player_id, season, player_type)
      mlb   = MlbApiService.new
      stats = mlb.player_season_stats(player_id, season)
      return nil if stats[:error]

      if player_type.to_s == "pitcher"
        p  = stats[:pitching] || {}
        ip = ip_str_to_f(p["inningsPitched"])
        return nil if ip < MIN_IP_FOR_ACTUAL_STATS
        {
          era:  p["era"]&.to_f,
          whip: p["whip"]&.to_f,
          k9:   ip > 0 ? (p["strikeOuts"].to_f * 9.0 / ip).round(3) : nil,
          bb9:  ip > 0 ? (p["baseOnBalls"].to_f * 9.0 / ip).round(3) : nil,
          ip:   ip,
        }.compact
      else
        h  = stats[:hitting] || {}
        pa = h["plateAppearances"].to_i
        pa = h["atBats"].to_i + h["baseOnBalls"].to_i + h["hitByPitch"].to_i if pa.zero?
        return nil if pa < MIN_PA_FOR_ACTUAL_STATS
        {
          avg: h["avg"]&.to_f,
          obp: h["obp"]&.to_f,
          slg: h["slg"]&.to_f,
          ops: h["ops"]&.to_f,
          hr:  h["homeRuns"]&.to_i,
          rbi: h["rbi"]&.to_i,
          pa:  pa,
        }.compact
      end
    rescue
      nil
    end

    # Compute stat-by-stat delta (projected − actual) for overlapping keys.
    # PA and IP are qualifiers, not accuracy metrics — exclude them.
    DELTA_EXCLUDED = %i[pa ip].freeze

    def compute_accuracy_delta(projected, actual)
      return {} unless projected && actual
      overlapping = (projected.keys.map(&:to_sym) & actual.keys.map(&:to_sym)) - DELTA_EXCLUDED
      overlapping.each_with_object({}) do |k, h|
        p_val = projected[k] || projected[k.to_s]
        a_val = actual[k]    || actual[k.to_s]
        next unless p_val && a_val
        h[k] = (p_val.to_f - a_val.to_f).round(4)
      end
    end

    def ip_str_to_f(ip_str)
      return 0.0 if ip_str.blank?
      parts = ip_str.to_s.split(".")
      parts[0].to_i + parts[1].to_i / 3.0
    end
  end
end
