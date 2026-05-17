class ProjectionAccuracyService
  BACKTEST_SEASONS = [2023, 2024, 2025].freeze
  SAMPLE_SIZE      = 100

  # Minimum qualified sample to include a player-season in accuracy computation
  MIN_PITCHER_IP_FOR_ACCURACY = 30.0
  MIN_BATTER_PA_FOR_ACCURACY  = 100

  @@cache    = {}
  @@cache_ts = {}
  CACHE_TTL  = 24 * 3600

  class << self
    def league_accuracy(player_type:)
      key = "league_#{player_type}"
      return @@cache[key] if @@cache[key] && @@cache_ts[key].to_i > Time.now.to_i - CACHE_TTL

      result = compute_league(player_type.to_s)
      unless result[:error]
        @@cache[key] = result
        @@cache_ts[key] = Time.now.to_i
      end
      result
    rescue => e
      { error: e.message }
    end

    private

    def compute_league(player_type)
      player_ids = sample_player_ids(player_type)
      return { player_type:, aggregate: {}, seasons_range: BACKTEST_SEASONS, sample_size: 0 } if player_ids.empty?

      mlb   = MlbApiService.new
      group = player_type == "pitcher" ? "pitching" : "hitting"

      all_deltas = { steamer: [], zips: [], ours: [] }

      player_ids.each do |player_id|
        BACKTEST_SEASONS.each do |season|
          actuals = fetch_actuals(mlb, player_id, season, player_type)
          next unless actuals

          st = mlb.player_projection(player_id, season, group: group, source: "steamer")
          zp = mlb.player_projection(player_id, season, group: group, source: "zips")
          br = ProjectionService.backtest_player(player_id, target_season: season)

          accumulate(all_deltas[:steamer], st[:projections], actuals, player_type) unless st[:error]
          accumulate(all_deltas[:zips],    zp[:projections], actuals, player_type) unless zp[:error]
          accumulate(all_deltas[:ours],    br&.dig(:stats),  actuals, player_type, symbol_keys: true) if br
        end
      end

      {
        player_type:   player_type,
        aggregate:     aggregate(all_deltas, player_type),
        seasons_range: BACKTEST_SEASONS,
        sample_size:   player_ids.size,
      }
    end

    # Use players the user has already projected — accurate sample for their workflow.
    def sample_player_ids(player_type)
      PlayerProjection
        .where(player_type: player_type)
        .select(:player_id)
        .distinct
        .pluck(:player_id)
        .first(SAMPLE_SIZE)
    rescue
      []
    end

    def fetch_actuals(mlb, player_id, season, player_type)
      stats = mlb.player_season_stats(player_id, season)
      return nil if stats[:error]

      if player_type == "pitcher"
        p  = stats[:pitching] || {}
        ip = ip_to_f(p["inningsPitched"])
        return nil if ip < MIN_PITCHER_IP_FOR_ACCURACY
        {
          era:  p["era"]&.to_f,
          whip: p["whip"]&.to_f,
          k9:   ip > 0 ? (p["strikeOuts"].to_f * 9.0 / ip).round(3) : nil,
          bb9:  ip > 0 ? (p["baseOnBalls"].to_f * 9.0 / ip).round(3) : nil,
        }
      else
        h  = stats[:hitting] || {}
        pa = h["plateAppearances"].to_i
        pa = h["atBats"].to_i + h["baseOnBalls"].to_i + h["hitByPitch"].to_i if pa.zero?
        return nil if pa < MIN_BATTER_PA_FOR_ACCURACY
        {
          avg: h["avg"]&.to_f,
          obp: h["obp"]&.to_f,
          slg: h["slg"]&.to_f,
          hr:  h["homeRuns"]&.to_i,
          rbi: h["rbi"]&.to_i,
        }
      end
    rescue
      nil
    end

    # Accumulate per-stat deltas from a projection hash into the bucket array.
    # external projections use string/camelCase keys; our backtest uses symbol keys.
    def accumulate(bucket, projected, actuals, player_type, symbol_keys: false)
      return unless projected && actuals

      if player_type == "pitcher"
        ip_raw   = symbol_keys ? projected[:ip] : projected["inningsPitched"]
        ip       = ip_to_f(ip_raw)
        k_raw    = symbol_keys ? projected[:ks]  : projected["strikeOuts"]
        bb_raw   = symbol_keys ? projected[:bbs] : projected["baseOnBalls"]
        era_raw  = symbol_keys ? projected[:era] : projected["era"]
        whip_raw = symbol_keys ? projected[:whip]: projected["whip"]

        delta_if_present(bucket, :era,  era_raw,  actuals[:era])
        delta_if_present(bucket, :whip, whip_raw, actuals[:whip])

        if ip > 0
          proj_k9  = k_raw.to_f  * 9.0 / ip
          proj_bb9 = bb_raw.to_f * 9.0 / ip
          delta_if_present(bucket, :k9,  proj_k9,  actuals[:k9])
          delta_if_present(bucket, :bb9, proj_bb9, actuals[:bb9])
        elsif symbol_keys
          delta_if_present(bucket, :k9,  projected[:k9],  actuals[:k9])
          delta_if_present(bucket, :bb9, projected[:bb9], actuals[:bb9])
        end
      else
        avg_p  = symbol_keys ? projected[:avg] : projected["avg"]
        obp_p  = symbol_keys ? projected[:obp] : projected["obp"]
        slg_p  = symbol_keys ? projected[:slg] : projected["slg"]
        hr_p   = symbol_keys ? projected[:hr]  : projected["homeRuns"]
        rbi_p  = symbol_keys ? projected[:rbi] : projected["rbi"]

        delta_if_present(bucket, :avg, avg_p, actuals[:avg])
        delta_if_present(bucket, :obp, obp_p, actuals[:obp])
        delta_if_present(bucket, :slg, slg_p, actuals[:slg])
        delta_if_present(bucket, :hr,  hr_p,  actuals[:hr])
        delta_if_present(bucket, :rbi, rbi_p, actuals[:rbi])
      end
    end

    def delta_if_present(bucket, stat, proj_val, actual_val)
      return if proj_val.nil? || actual_val.nil?
      # Skip zero float actuals (likely missing data); integer zero (HR=0) is valid
      return if actual_val.zero? && !actual_val.is_a?(Integer)
      bucket << { stat: stat, delta: (proj_val.to_f - actual_val.to_f) }
    end

    def aggregate(all_deltas, player_type)
      stat_keys = player_type == "pitcher" ? %i[era whip k9 bb9] : %i[avg obp slg hr rbi]

      all_deltas.each_with_object({}) do |(system, entries), agg|
        next if entries.empty?
        agg[system] = stat_keys.each_with_object({}) do |stat, h|
          vals = entries.select { |e| e[:stat] == stat }.map { |e| e[:delta] }
          next if vals.empty?
          h[stat] = {
            mean: (vals.sum / vals.size).round(4),
            mae:  (vals.map(&:abs).sum / vals.size).round(4),
            n:    vals.size,
          }
        end
      end
    end

    def ip_to_f(ip_str)
      return 0.0 if ip_str.nil? || ip_str.to_s.empty?
      parts = ip_str.to_s.split(".")
      parts[0].to_i + parts[1].to_i / 3.0
    end
  end
end
