class SimulationService
  OUTS_PER_GAME        = 27    # used for ERA: (er * 27 / outs_pitched)
  MIN_QUALIFYING_AB    = 50    # minimum at-bats to appear in rate-stat leaderboards
  MIN_QUALIFYING_IP    = 10    # minimum innings pitched to appear in ERA/WHIP leaderboards
  MONTE_CARLO_MAX_RUNS = 500   # upper bound on win-probability simulation count

  # Columns needed for standings — excludes the heavy box_score_json blob
  STANDINGS_COLS = %w[
    id home_team_id away_team_id home_score away_score is_real
    home_team_abbr away_team_abbr home_team_name away_team_name home_team_color away_team_color
  ].freeze

  # Columns needed for serialize_game — excludes box_score_json and lineup JSON blobs
  SCHEDULE_COLS = %w[
    id game_pk game_date simulation_league_id
    home_team_id away_team_id home_team_abbr away_team_abbr home_team_name away_team_name
    home_team_color away_team_color home_score away_score
    home_pitcher_id away_pitcher_id home_pitcher_name away_pitcher_name
    is_real simulated_at actual_away_score actual_home_score actual_home_lineup_json
  ].freeze

  TEAM_DIVISIONS = {
    108 => { league: "AL", division: "West"    },
    109 => { league: "NL", division: "West"    },
    110 => { league: "AL", division: "East"    },
    111 => { league: "AL", division: "East"    },
    112 => { league: "NL", division: "Central" },
    113 => { league: "NL", division: "Central" },
    114 => { league: "AL", division: "Central" },
    115 => { league: "NL", division: "West"    },
    116 => { league: "AL", division: "Central" },
    117 => { league: "AL", division: "West"    },
    118 => { league: "AL", division: "Central" },
    119 => { league: "NL", division: "West"    },
    120 => { league: "NL", division: "East"    },
    121 => { league: "NL", division: "East"    },
    133 => { league: "AL", division: "West"    },
    134 => { league: "NL", division: "Central" },
    135 => { league: "NL", division: "West"    },
    136 => { league: "AL", division: "West"    },
    137 => { league: "NL", division: "West"    },
    138 => { league: "NL", division: "Central" },
    139 => { league: "AL", division: "East"    },
    140 => { league: "AL", division: "West"    },
    141 => { league: "AL", division: "East"    },
    142 => { league: "AL", division: "Central" },
    143 => { league: "NL", division: "East"    },
    144 => { league: "NL", division: "East"    },
    145 => { league: "AL", division: "Central" },
    146 => { league: "NL", division: "East"    },
    147 => { league: "AL", division: "East"    },
    158 => { league: "NL", division: "Central" },
  }.freeze

  class << self
    # -----------------------------------------------------------------------
    # Create league + import schedule + rosters in one operation.
    # -----------------------------------------------------------------------
    # mode: :live   → sync real results through yesterday, start from today
    # mode: :full   → start from Opening Day with no results synced
    def setup_league(name:, season:, scenario_id: nil, batter_pitcher_blend: 0.45, mode: :live)
      start_date = mode.to_sym == :live ? Date.today : nil  # resolved after schedule import

      league = SimulationLeague.create!(
        name:                 name,
        season:               season,
        scenario_id:          scenario_id,
        batter_pitcher_blend: batter_pitcher_blend,
        current_sim_date:     Date.today,
        status:               "active"
      )

      import_rosters(league)
      import_schedule(league)

      if mode.to_sym == :live
        sync_real_results(league, through_date: Date.yesterday)
        league.update!(current_sim_date: Date.today)
      else
        # Set current_sim_date to the first game date of the imported schedule
        first_game = league.simulation_games.minimum(:game_date)
        league.update!(current_sim_date: first_game || Date.new(season.to_i, 3, 28))
      end

      serialize_league(league)
    rescue => e
      { error: e.message }
    end

    # -----------------------------------------------------------------------
    # Pull all 30 current-season rosters from the MLB API.
    # -----------------------------------------------------------------------
    def import_rosters(league)
      mlb   = MlbApiService.new
      teams = mlb.all_teams
      return { error: "Could not fetch teams" } if teams.blank?

      # Bulk-fetch projected IP for all pitchers in one query for role classification
      season        = Date.today.year
      all_pitcher_ids = []
      team_data       = {}

      teams.each do |team|
        tid    = team[:id]
        roster = mlb.team_roster(tid)
        next if roster.blank?

        pitchers = roster.select { |p| pitcher?(p[:position]) }
        batters  = roster.reject { |p| pitcher?(p[:position]) }
        all_pitcher_ids.concat(pitchers.map { |p| p[:id] })
        team_data[tid] = { team: team, roster: roster, pitchers: pitchers, batters: batters }
      end

      ip_map = fetch_projected_ip(all_pitcher_ids, season, league.scenario_id)

      imported = 0
      team_data.each do |tid, data|
        team     = data[:team]
        roster   = data[:roster]
        pitchers = data[:pitchers]
        batters  = data[:batters]
        rotation = pitchers.first(5).map { |p| p[:id] }
        lineup   = build_default_lineup(batters)

        pitchers_with_ip = pitchers.map { |p| { id: p[:id], projected_ip: ip_map[p[:id].to_i].to_f } }
        pitcher_state    = BullpenManager.build_initial_state(pitchers_with_ip)

        SimulationRoster.upsert(
          {
            simulation_league_id: league.id,
            team_id:              tid,
            team_name:            team[:name],
            team_abbr:            team[:abbreviation],
            team_color:           team[:color],
            roster_json:          roster.to_json,
            lineup_order_json:    lineup.to_json,
            rotation_json:        rotation.to_json,
            pitcher_state_json:   pitcher_state.to_json,
            created_at:           Time.now,
            updated_at:           Time.now,
          },
          unique_by: %i[simulation_league_id team_id]
        )
        imported += 1
      end

      { imported: imported }
    rescue => e
      { error: e.message }
    end

    # -----------------------------------------------------------------------
    # Import the full season schedule from the MLB API (one-time per league).
    # Uses insert_all so it is idempotent — skips already-imported game_pks.
    # -----------------------------------------------------------------------
    def import_schedule(league)
      mlb      = MlbApiService.new
      schedule = mlb.season_schedule(league.season)
      return { error: schedule[:error] } if schedule.is_a?(Hash) && schedule[:error]

      existing_pks = SimulationGame.where(simulation_league: league).pluck(:game_pk).to_set
      new_games    = schedule.reject { |g| existing_pks.include?(g[:game_pk]) }
      return { imported: 0 } if new_games.empty?

      team_colors = MlbApiService::TEAM_META.transform_values { |v| v[:color] }
      team_abbrs  = MlbApiService::TEAM_META.transform_values { |v| v[:abbr] }

      records = new_games.map do |g|
        {
          simulation_league_id: league.id,
          game_pk:              g[:game_pk],
          game_date:            g[:game_date],
          home_team_id:         g[:home_team_id],
          away_team_id:         g[:away_team_id],
          home_team_abbr:       g[:home_team_abbr] || team_abbrs[g[:home_team_id]],
          away_team_abbr:       g[:away_team_abbr] || team_abbrs[g[:away_team_id]],
          home_team_name:       g[:home_team_name],
          away_team_name:       g[:away_team_name],
          home_team_color:      team_colors[g[:home_team_id]],
          away_team_color:      team_colors[g[:away_team_id]],
          is_real:              false,
          created_at:           Time.now,
          updated_at:           Time.now,
        }
      end

      SimulationGame.insert_all(records)
      { imported: records.size }
    rescue => e
      { error: e.message }
    end

    # -----------------------------------------------------------------------
    # Sync real game results from the MLB API through a given date.
    # Only fetches games not already stored. DB is the cache.
    # -----------------------------------------------------------------------
    def sync_real_results(league, through_date: Date.today)
      mlb      = MlbApiService.new
      schedule = mlb.season_schedule(league.season)
      return { error: schedule[:error] } if schedule.is_a?(Hash) && schedule[:error]

      synced = 0
      schedule.each do |g|
        next if g[:game_date].to_s > through_date.to_s
        next unless g[:status] == "Final"
        next unless g[:home_score] && g[:away_score]

        sim_game = SimulationGame.find_or_initialize_by(
          simulation_league: league,
          game_pk:           g[:game_pk]
        )
        next if sim_game.persisted? && sim_game.final?

        sim_game.assign_attributes(
          game_date:         g[:game_date],
          home_team_id:      g[:home_team_id],
          away_team_id:      g[:away_team_id],
          home_team_abbr:    g[:home_team_abbr],
          away_team_abbr:    g[:away_team_abbr],
          home_team_name:    g[:home_team_name],
          away_team_name:    g[:away_team_name],
          home_team_color:   MlbApiService::TEAM_META.dig(g[:home_team_id], :color),
          away_team_color:   MlbApiService::TEAM_META.dig(g[:away_team_id], :color),
          home_score:        g[:home_score].to_i,
          away_score:        g[:away_score].to_i,
          actual_home_score: g[:home_score].to_i,
          actual_away_score: g[:away_score].to_i,
          is_real:           true,
          simulated_at:      Time.now
        )
        sim_game.save!
        synced += 1
      end

      league.update!(current_sim_date: through_date)
      { synced: synced }
    rescue => e
      { error: e.message }
    end

    # -----------------------------------------------------------------------
    # Simulate every unplayed game on a given date.
    # -----------------------------------------------------------------------
    def simulate_day(league, date, skip_order_check: false)
      # Enforce sequential simulation in non-live leagues. simulate_through
      # passes skip_order_check: true because it always starts from the earliest
      # unplayed date, so the check is redundant and expensive there.
      unless live_mode?(league) || skip_order_check
        earliest = league.simulation_games
                         .where(simulated_at: nil)
                         .where.not(home_team_id: nil)
                         .minimum(:game_date)
        if earliest && earliest < date
          return { error: "Cannot simulate #{date} — there are unplayed games on #{earliest}. Sim those first." }
        end
      end

      cfg      = league_config(league)
      strategy = build_strategy(cfg)

      # ── Injury system: pre-game rolls and IL returns ───────────────────────
      if cfg["injury_rate"].to_f > 0
        process_il_returns(league, date)
        roll_new_injuries(league, date, strategy, cfg)
      end

      games = league.simulation_games.for_date(date).upcoming
      cache    = {}
      managers = {}

      # Pre-instantiate BullpenManagers and batch-prefetch projections for all today's games.
      if games.any?
        team_ids = games.flat_map { |g| [g.home_team_id, g.away_team_id] }.uniq
        rosters  = SimulationRoster.where(simulation_league: league, team_id: team_ids).to_a

        rosters.each { |r| managers[r.team_id] = BullpenManager.new(r, date) }

        all_ids = rosters.flat_map do |r|
          if r.has_pitcher_state?
            [*r.lineup_order, *r.pitcher_state.fetch("pitchers", {}).keys.map(&:to_i)]
          else
            [*r.lineup_order, *r.rotation, *bullpen_ids(r)]
          end
        end
        prefetch_into_cache(league, cache, all_ids)
      end

      results = []
      games.each do |g|
        result = simulate_game(league, g, rate_cache: cache, config: cfg, managers: managers)
        results << result unless result[:error]
      end

      league.update!(current_sim_date: date)
      { simulated: results.size, date: date.to_s, games: results }
    rescue => e
      { error: e.message }
    end

    # -----------------------------------------------------------------------
    # Simulate all unplayed games up through a specific date.
    # Always starts from the first unplayed date in the league, so there are
    # no gaps. Raises if any date fails so the caller surfaces the error.
    # -----------------------------------------------------------------------
    def simulate_through(league, through_date, job_run: nil)
      dates = league.simulation_games
                    .where(simulated_at: nil)
                    .where.not(home_team_id: nil)
                    .where('game_date <= ?', through_date)
                    .order(:game_date)
                    .pluck(:game_date)
                    .uniq

      total  = dates.size
      done   = 0
      total_simulated = 0

      dates.each do |date|
        result = simulate_day(league, date, skip_order_check: true)
        raise "Failed to simulate #{date}: #{result[:error]}" if result[:error]
        total_simulated += result[:simulated].to_i
        done += 1
        job_run&.update_columns(
          result_json: { total: total, done: done, current_date: date.to_s }.to_json
        )
      end

      { simulated: total_simulated, through_date: through_date.to_s, dates: total }
    rescue => e
      { error: e.message }
    end

    # -----------------------------------------------------------------------
    # Simulate every remaining game in the season, date by date.
    # job_run is updated with progress after each date so the frontend can poll.
    # -----------------------------------------------------------------------
    def simulate_season(league, job_run: nil)
      dates = league.simulation_games
                    .where(simulated_at: nil)
                    .where.not(home_team_id: nil)
                    .order(:game_date)
                    .pluck(:game_date)
                    .uniq

      total = dates.size
      done  = 0

      dates.each do |date|
        simulate_day(league, date, skip_order_check: true)
        done += 1
        job_run&.update_columns(
          result_json: { total: total, done: done, current_date: date.to_s }.to_json
        )
      end

      { simulated_dates: total, season: league.season }
    rescue => e
      { error: e.message }
    end

    # -----------------------------------------------------------------------
    # Simulate a single game. rate_cache is populated in-memory across calls.
    # managers: Hash of team_id => BullpenManager, pre-built in simulate_day.
    # -----------------------------------------------------------------------
    def simulate_game(league, sim_game, rate_cache: {}, config: nil, managers: {})
      home_r = SimulationRoster.find_by(simulation_league: league, team_id: sim_game.home_team_id)
      away_r = SimulationRoster.find_by(simulation_league: league, team_id: sim_game.away_team_id)
      return { error: "Rosters not found for this game" } unless home_r && away_r

      game_date  = sim_game.game_date || Date.today
      home_mgr   = managers[sim_game.home_team_id] || BullpenManager.new(home_r, game_date)
      away_mgr   = managers[sim_game.away_team_id] || BullpenManager.new(away_r, game_date)

      # Prefetch projections for this game's players in one batch.
      # When called from simulate_day the cache is already populated — this is a no-op.
      home_pitcher_pool = home_r.has_pitcher_state? ? home_r.pitcher_state.fetch("pitchers", {}).keys.map(&:to_i) : bullpen_ids(home_r)
      away_pitcher_pool = away_r.has_pitcher_state? ? away_r.pitcher_state.fetch("pitchers", {}).keys.map(&:to_i) : bullpen_ids(away_r)
      prefetch_into_cache(league, rate_cache,
        [*home_r.lineup_order, *home_pitcher_pool, *away_r.lineup_order, *away_pitcher_pool])

      # Preserve real result for comparison before overwriting
      real_away = sim_game.is_real? && sim_game.final? ? sim_game.away_score : nil
      real_home = sim_game.is_real? && sim_game.final? ? sim_game.home_score : nil
      real_away ||= sim_game.actual_away_score
      real_home ||= sim_game.actual_home_score

      # Resolve lineups: real games use the actual MLB lineup; sim games use the editable roster
      home_batter_ids, away_batter_ids, home_pitcher_ids, away_pitcher_ids =
        if sim_game.is_real? && sim_game.game_pk && game_date < Date.today
          resolve_real_lineup(sim_game, home_r, away_r)
        else
          resolve_sim_lineup(sim_game, league, home_r, away_r, game_date: game_date,
                             home_mgr: home_mgr, away_mgr: away_mgr)
        end

      home_sp_id = home_pitcher_ids.first
      away_sp_id = away_pitcher_ids.first

      home_lineup   = build_player_list(home_batter_ids,  rate_cache, league, :batter)
      away_lineup   = build_player_list(away_batter_ids,  rate_cache, league, :batter)
      home_pitchers = build_player_list(home_pitcher_ids, rate_cache, league, :pitcher)
      away_pitchers = build_player_list(away_pitcher_ids, rate_cache, league, :pitcher)

      home_roles = bullpen_roles_for(home_r)
      away_roles = bullpen_roles_for(away_r)

      cfg = config || league_config(league)

      result = GameSimulationEngine.simulate_game(
        home_lineup:   home_lineup.presence || fallback_lineup(home_r),
        away_lineup:   away_lineup.presence || fallback_lineup(away_r),
        home_pitchers: home_pitchers.presence || [fallback_pitcher_struct],
        away_pitchers: away_pitchers.presence || [fallback_pitcher_struct],
        blend:         league.batter_pitcher_blend,
        home_roles:    home_roles,
        away_roles:    away_roles,
        config:        cfg
      )

      box = build_box_score(
        result,
        home_lineup, away_lineup,
        home_pitchers, away_pitchers,
        home_sp_id, away_sp_id
      )
      box[:actual] = { away_score: real_away, home_score: real_home } if real_away

      home_sp_name = player_name_from_list(home_pitchers, home_sp_id)
      away_sp_name = player_name_from_list(away_pitchers, away_sp_id)

      first_sim = sim_game.simulated_at.nil?

      sim_game.update!(
        home_score:          result[:home_score],
        away_score:          result[:away_score],
        actual_home_score:   real_home,
        actual_away_score:   real_away,
        home_pitcher_id:     home_sp_id&.to_i,
        away_pitcher_id:     away_sp_id&.to_i,
        home_pitcher_name:   home_sp_name,
        away_pitcher_name:   away_sp_name,
        is_real:             false,
        box_score_json:      box.to_json,
        simulated_at:        Time.now
      )

      accumulate_game_stats(league, box, sim_game.home_team_id, sim_game.away_team_id, home_sp_id, away_sp_id) if first_sim

      # Record appearances and flush manager state in one write per team
      record_and_flush(home_mgr, home_r, home_sp_id, box.dig(:home, :pitchers), game_date)
      record_and_flush(away_mgr, away_r, away_sp_id, box.dig(:away, :pitchers), game_date)

      { game: serialize_game(sim_game), box_score: box }
    rescue => e
      Rails.logger.error "simulate_game #{sim_game.id}: #{e.message}\n#{e.backtrace.first(5).join("\n")}"
      { error: e.message }
    end

    # -----------------------------------------------------------------------
    # Win-probability via Monte Carlo — run `runs` independent simulations
    # of the same matchup and aggregate outcomes.
    # -----------------------------------------------------------------------
    def game_probabilities(league, sim_game, runs: 100)
      home_r = SimulationRoster.find_by(simulation_league: league, team_id: sim_game.home_team_id)
      away_r = SimulationRoster.find_by(simulation_league: league, team_id: sim_game.away_team_id)
      return { error: "Rosters not found" } unless home_r && away_r

      rate_cache    = {}
      today      = Date.today
      home_mgr   = BullpenManager.new(home_r, today)
      away_mgr   = BullpenManager.new(away_r, today)

      home_pitcher_ids = pitcher_ids_for_game(sim_game.home_pitcher_id, home_r, home_mgr, league,
                                              sim_game.home_team_id, today, Set.new)
      away_pitcher_ids = pitcher_ids_for_game(sim_game.away_pitcher_id, away_r, away_mgr, league,
                                              sim_game.away_team_id, today, Set.new)

      home_sp_id = home_pitcher_ids.first
      away_sp_id = away_pitcher_ids.first

      home_lineup   = build_player_list(home_r.lineup_order,  rate_cache, league, :batter)
      away_lineup   = build_player_list(away_r.lineup_order,  rate_cache, league, :batter)
      home_pitchers = build_player_list(home_pitcher_ids,     rate_cache, league, :pitcher).presence || [fallback_pitcher_struct]
      away_pitchers = build_player_list(away_pitcher_ids,     rate_cache, league, :pitcher).presence || [fallback_pitcher_struct]

      home_lineup = home_lineup.presence || fallback_lineup(home_r)
      away_lineup = away_lineup.presence || fallback_lineup(away_r)

      home_wins = 0
      score_sum = { home: 0, away: 0 }
      run_log   = []

      num_simulations = runs.clamp(10, MONTE_CARLO_MAX_RUNS)
      num_simulations.times do
        game_result = GameSimulationEngine.simulate_game(
          home_lineup:   home_lineup,
          away_lineup:   away_lineup,
          home_pitchers: home_pitchers,
          away_pitchers: away_pitchers,
          blend:         league.batter_pitcher_blend
        )
        home_wins        += 1 if game_result[:home_score] > game_result[:away_score]
        score_sum[:home] += game_result[:home_score]
        score_sum[:away] += game_result[:away_score]
        run_log          << { h: game_result[:home_score], a: game_result[:away_score] }
      end

      {
        runs:              num_simulations,
        home_win_pct:      (home_wins.to_f / num_simulations * 100).round(1),
        away_win_pct:      ((num_simulations - home_wins).to_f / num_simulations * 100).round(1),
        avg_home_score:    (score_sum[:home].to_f / num_simulations).round(2),
        avg_away_score:    (score_sum[:away].to_f / num_simulations).round(2),
        home_team_abbr:    sim_game.home_team_abbr,
        away_team_abbr:    sim_game.away_team_abbr,
        home_team_color:   sim_game.home_team_color,
        away_team_color:   sim_game.away_team_color,
        distribution:      run_log,
      }
    rescue => e
      { error: e.message }
    end

    # -----------------------------------------------------------------------
    # Season accuracy — compare all replayed (was-real) games vs actual.
    # Uses dedicated score columns instead of parsing box_score_json.
    # -----------------------------------------------------------------------
    def season_accuracy(league)
      games = league.simulation_games
                    .where(is_real: false)
                    .where.not(actual_home_score: nil)
                    .select(:id, :game_date, :away_team_abbr, :home_team_abbr,
                            :away_team_color, :home_team_color,
                            :home_score, :away_score,
                            :actual_home_score, :actual_away_score)
                    .order(:game_date)
                    .to_a

      compared = games.filter_map do |g|
        next unless g.actual_away_score && g.actual_home_score

        sim_winner = g.away_score > g.home_score ? :away : :home
        act_winner = g.actual_away_score > g.actual_home_score ? :away : :home
        run_error  = (g.away_score - g.actual_away_score).abs + (g.home_score - g.actual_home_score).abs

        {
          id:              g.id,
          game_date:       g.game_date&.to_s,
          away_team_abbr:  g.away_team_abbr,
          home_team_abbr:  g.home_team_abbr,
          away_team_color: g.away_team_color,
          home_team_color: g.home_team_color,
          sim_away:        g.away_score,
          sim_home:        g.home_score,
          act_away:        g.actual_away_score,
          act_home:        g.actual_home_score,
          correct_winner:  sim_winner == act_winner,
          run_error:       run_error,
        }
      end

      total_compared = compared.size
      correct        = compared.count { |game| game[:correct_winner] }
      avg_err        = total_compared > 0 ?
                         (compared.sum { |game| game[:run_error] }.to_f / total_compared).round(2) :
                         nil

      {
        total:           total_compared,
        correct_winners: correct,
        win_accuracy:    total_compared > 0 ? (correct.to_f / total_compared * 100).round(1) : nil,
        avg_run_error:   avg_err,
        games:           compared,
      }
    rescue => e
      { error: e.message }
    end

    # -----------------------------------------------------------------------
    # Full league state — standings + today's schedule + league meta.
    # -----------------------------------------------------------------------
    def league_state(league)
      # Single aggregate query for counts — avoids a separate COUNT(*) later
      total, played, has_real_int = league.simulation_games.pick(
        Arel.sql("COUNT(*)"),
        Arel.sql("SUM(CASE WHEN simulated_at IS NOT NULL THEN 1 ELSE 0 END)"),
        Arel.sql("MAX(CASE WHEN is_real = 1 THEN 1 ELSE 0 END)")
      )
      has_real = has_real_int.to_i == 1

      # Lightweight select — never loads box_score_json for standings
      completed = league.simulation_games.completed.select(STANDINGS_COLS).to_a
      today_games = league.simulation_games
                          .for_date(league.current_sim_date || Date.today)
                          .select(SCHEDULE_COLS)
                          .order(:id)
                          .to_a

      first_unplayed = league.simulation_games.upcoming.minimum(:game_date)

      roster_seeds = league.simulation_rosters.pluck(:team_id, :team_abbr, :team_name, :team_color)
                           .map { |id, abbr, name, color| { team_id: id, team_abbr: abbr, team_name: name, team_color: color } }

      league_hash = build_league_hash(league, played.to_i, total.to_i, has_real)
      league_hash[:first_unplayed_date] = first_unplayed&.to_s

      result = {
        league:    league_hash,
        standings: compute_standings_from(completed, seed_teams: roster_seeds),
        today:     {
          date:  league.current_sim_date&.to_s || Date.today.to_s,
          games: today_games.map { |g| serialize_game(g) }
        }
      }

      if has_real
        result[:real_standings] = compute_standings_from(completed.select(&:is_real), seed_teams: roster_seeds)
        result[:sim_standings]  = compute_standings_from(completed.reject(&:is_real), seed_teams: roster_seeds)
      end

      result
    rescue => e
      { error: e.message }
    end

    def update_roster(league, team_id, data)
      roster = SimulationRoster.find_by!(simulation_league: league, team_id: team_id)
      attrs  = {}
      attrs[:lineup_order_json]  = data[:lineup_order].to_json  if data[:lineup_order]
      attrs[:rotation_json]      = data[:rotation].to_json      if data[:rotation]

      if data[:bullpen_roles]
        attrs[:bullpen_roles_json] = data[:bullpen_roles].to_json
        if roster.has_pitcher_state?
          synced = BullpenManager.sync_roles(roster.pitcher_state, data[:bullpen_roles])
          attrs[:pitcher_state_json] = synced.to_json
        end
      end

      if data[:rotation] && roster.has_pitcher_state?
        # Re-derive SP slots from the new rotation order
        new_rotation_ids = data[:rotation].map(&:to_i).to_set
        state    = roster.pitcher_state
        pitchers = state["pitchers"] || {}
        slot     = 0
        pitchers.each do |id_str, p|
          if new_rotation_ids.include?(id_str.to_i)
            p["role"] = "sp"
            p["slot"] = slot
            slot += 1
          elsif p["role"] == "sp"
            p["role"] = "mr"
            p.delete("slot")
          end
        end
        attrs[:pitcher_state_json] = state.to_json
      end

      roster.update!(attrs)
      { ok: true }
    rescue => e
      { error: e.message }
    end

    # Public facade used by PlayoffSimulationService.
    # filter: :all → all completed games; :sim → sim only; :real → real only
    def compute_standings(league, filter: :all)
      games = league.simulation_games.completed.select(STANDINGS_COLS).to_a
      games = games.reject(&:is_real) if filter == :sim
      games = games.select(&:is_real) if filter == :real
      roster_seeds = league.simulation_rosters.pluck(:team_id, :team_abbr, :team_name, :team_color)
                           .map { |id, abbr, name, color| { team_id: id, team_abbr: abbr, team_name: name, team_color: color } }
      compute_standings_from(games, seed_teams: roster_seeds)
    end

    # -----------------------------------------------------------------------
    # IL list + transaction log for the league.
    # -----------------------------------------------------------------------
    def injuries_and_transactions(league, team_id: nil)
      roster_map = league.simulation_rosters.index_by(&:team_id)

      inj_scope = league.simulation_injuries.order(il_start_date: :desc)
      inj_scope = inj_scope.for_team(team_id.to_i) if team_id.present?

      active_il = inj_scope.active.map { |i| serialize_injury(i, roster_map) }
      il_history = inj_scope.where(returned: true).limit(50).map { |i| serialize_injury(i, roster_map) }

      tx_scope = league.simulation_transactions.recent.limit(100)
      tx_scope = tx_scope.where(team_id: team_id.to_i) if team_id.present?

      {
        active_il:    active_il,
        il_history:   il_history,
        transactions: tx_scope.map { |t| serialize_transaction(t, roster_map) },
        summary:      { total_on_il: active_il.size },
      }
    rescue => e
      { error: e.message }
    end

    # Season stats — leaderboards and team summaries from accumulated table.
    # -----------------------------------------------------------------------
    def season_stats(league)
      stats = league.simulation_player_stats.to_a

      batters  = stats.select { |s| s.player_type == "batter" && s.ab > 0 }
      pitchers = stats.select { |s| s.player_type == "pitcher" && s.outs_pitched > 0 }

      roster_map  = league.simulation_rosters.index_by(&:team_id)
      ratings_map = PlayerRatingService.ratings_for_league(league)

      batting_leaders = {
        hr:      top_batters(batters, roster_map, :hr, 20, ratings_map),
        avg:     top_batters(batters, roster_map, :avg_val, 20, ratings_map),
        rbi:     top_batters(batters, roster_map, :rbi, 20, ratings_map),
        ops:     top_batters(batters, roster_map, :ops_val, 20, ratings_map),
        obp:     top_batters(batters, roster_map, :obp_val, 20, ratings_map),
        slg:     top_batters(batters, roster_map, :slg_val, 20, ratings_map),
        woba:    top_batters(batters, roster_map, :woba_val, 20, ratings_map),
        doubles: top_batters(batters, roster_map, :doubles, 20, ratings_map),
      }
      pitching_leaders = {
        era:  top_pitchers(pitchers, roster_map, :era_val,    20, ratings_map, asc: true),
        k:    top_pitchers(pitchers, roster_map, :k_pitched,  20, ratings_map),
        w:    top_pitchers(pitchers, roster_map, :w,          20, ratings_map),
        whip: top_pitchers(pitchers, roster_map, :whip_val,   20, ratings_map, asc: true),
        k9:   top_pitchers(pitchers, roster_map, :k9_val,     20, ratings_map),
        bb9:  top_pitchers(pitchers, roster_map, :bb9_val,    20, ratings_map, asc: true),
      }

      team_stats = league.simulation_rosters.map do |r|
        team_b  = batters.select  { |s| s.team_id == r.team_id }
        team_p  = pitchers.select { |s| s.team_id == r.team_id }
        rs      = team_b.sum(&:r)
        total_outs = team_p.sum(&:outs_pitched)
        total_er   = team_p.sum(&:er)
        {
          team_id:   r.team_id,
          abbr:      r.team_abbr,
          name:      r.team_name,
          color:     r.team_color,
          rs:        rs,
          ops:       team_b.empty? ? nil : avg_ops(team_b).round(3),
          era:       total_outs > 0 ? (total_er * OUTS_PER_GAME.to_f / total_outs).round(2) : nil,
        }
      end

      { batting_leaders: batting_leaders, pitching_leaders: pitching_leaders, team_stats: team_stats }
    rescue => e
      { error: e.message }
    end

    # All batting + pitching stats for every player on one team.
    # No minimum AB/IP filters — shows every player who appeared.
    def team_player_stats(league, team_id)
      stats       = league.simulation_player_stats.where(team_id: team_id).to_a
      roster_map  = league.simulation_rosters.index_by(&:team_id)
      ratings_map = PlayerRatingService.ratings_for_league(league)

      batters  = stats.select { |s| s.player_type == "batter"  && s.ab > 0 }
                      .sort_by { |s| -s.ab }
      pitchers = stats.select { |s| s.player_type == "pitcher" && s.outs_pitched > 0 }
                      .sort_by { |s| [-(s.gs || 0), -s.outs_pitched] }

      {
        batters:  batters.map  { |s| stat_row(s, roster_map, ratings_map) },
        pitchers: pitchers.map { |s| stat_row(s, roster_map, ratings_map) },
      }
    rescue => e
      { error: e.message }
    end

    # Single player season line + per-game log (last 30 games from box_score_json).
    def player_season_stats(league, player_id)
      stat = league.simulation_player_stats.find_by(player_id: player_id)
      return { error: "Player not found in this league" } unless stat

      games = league.simulation_games
                    .where("box_score_json IS NOT NULL AND simulated_at IS NOT NULL")
                    .order(game_date: :desc)
                    .limit(120)
                    .to_a

      game_log = games.filter_map do |g|
        bs   = g.box_score
        side = nil
        side = :home if g.home_team_id == stat.team_id
        side = :away if g.away_team_id == stat.team_id
        next unless side

        if stat.player_type == "batter"
          line = bs.dig(side, :batters)&.find { |b| b[:player_id].to_i == player_id.to_i }
        else
          line = bs.dig(side, :pitchers)&.find { |p| p[:player_id].to_i == player_id.to_i }
        end
        next unless line

        opp_side  = side == :home ? :away : :home
        opp_abbr  = g.send(:"#{opp_side}_team_abbr")
        { date: g.game_date&.to_s, opp: opp_abbr }.merge(line.except(:player_id, :name))
      end.first(30)

      mlb_line = live_mode?(league) ? fetch_mlb_season_line(player_id, league.season, stat.player_type) : nil

      team_meta = MlbApiService::TEAM_META[stat.team_id] || {}

      roster_entry = league.simulation_rosters
                           .find_by(team_id: stat.team_id)
                           &.roster
                           &.find { |p| p[:id].to_i == player_id.to_i }
      position = roster_entry&.dig(:position)

      ratings = PlayerRatingService.ratings_for_league(league)[player_id] || {}

      injury = league.simulation_injuries
                     .where(player_id: player_id)
                     .order(il_start_date: :desc)
                     .first

      injury_status = if injury
        {
          on_il:          !injury.returned?,
          severity:       injury.severity,
          il_start_date:  injury.il_start_date.to_s,
          il_end_date:    injury.il_end_date.to_s,
          days_remaining: injury.days_remaining(Date.today),
        }
      end

      rates = fetch_rates(player_id, league)
      spray = if stat.player_type == "batter"
        { pull_pct: rates[:pull_pct], cent_pct: rates[:cent_pct], oppo_pct: rates[:oppo_pct] }.compact
      end

      {
        player_id:    player_id,
        player_name:  stat.player_name,
        player_type:  stat.player_type,
        team_id:      stat.team_id,
        team_abbr:    team_meta[:abbr],
        team_color:   team_meta[:color],
        position:     position,
        age:          ProjectionDataService.player_age(player_id, season: league.season),
        ratings:      ratings,
        season_line:  serialize_player_stat(stat),
        mlb_season_line: mlb_line,
        game_log:     game_log,
        injury_status: injury_status,
        spray:         spray,
        franchise_id:  league.simulation_franchise_id,
      }
    rescue => e
      { error: e.message }
    end

    def fetch_mlb_season_line(player_id, season, player_type)
      mlb   = MlbApiService.new
      group = player_type == "batter" ? "hitting" : "pitching"
      raw   = mlb.season_stat_line(player_id, season, group)
      return nil if raw.blank?

      if player_type == "batter"
        { g:   raw["gamesPlayed"].to_i,
          ab:  raw["atBats"].to_i,
          h:   raw["hits"].to_i,
          hr:  raw["homeRuns"].to_i,
          rbi: raw["rbi"].to_i,
          bb:  raw["baseOnBalls"].to_i,
          k:   raw["strikeOuts"].to_i,
          r:   raw["runs"].to_i,
          avg: raw["avg"].to_f,
          ops: raw["ops"].to_f }
      else
        ip_raw = raw["inningsPitched"].to_f
        er     = raw["earnedRuns"].to_i
        h_all  = raw["hits"].to_i
        bb_all = raw["baseOnBalls"].to_i
        ip_outs = (ip_raw.floor * 3) + ((ip_raw * 10).to_i % 10)
        { gs:   raw["gamesStarted"].to_i,
          g:    raw["gamesPlayed"].to_i,
          w:    raw["wins"].to_i,
          l:    raw["losses"].to_i,
          sv:   raw["saves"].to_i,
          ip:   raw["inningsPitched"].to_f,
          h:    h_all,
          er:   er,
          bb:   bb_all,
          k:    raw["strikeOuts"].to_i,
          era:  raw["era"].to_f,
          whip: raw["whip"].to_f }
      end
    rescue => e
      Rails.logger.warn "fetch_mlb_season_line: #{e.message}"
      nil
    end

    def schedule_for_date(league, date)
      games = league.simulation_games.for_date(date).select(SCHEDULE_COLS).order(:id)

      completed_through = league.simulation_games
                                .where.not(simulated_at: nil)
                                .where('game_date <= ?', date)
                                .select(STANDINGS_COLS)
                                .to_a
      has_real = completed_through.any?(&:is_real)

      roster_seeds = league.simulation_rosters.pluck(:team_id, :team_abbr, :team_name, :team_color)
                           .map { |id, abbr, name, color| { team_id: id, team_abbr: abbr, team_name: name, team_color: color } }

      result = {
        date:      date.to_s,
        games:     games.map { |g| serialize_game(g) },
        standings: compute_standings_from(completed_through, seed_teams: roster_seeds),
      }
      if has_real
        result[:real_standings] = compute_standings_from(completed_through.select(&:is_real), seed_teams: roster_seeds)
        result[:sim_standings]  = compute_standings_from(completed_through.reject(&:is_real), seed_teams: roster_seeds)
      end
      result
    end

    # -----------------------------------------------------------------------
    # Serializers
    # -----------------------------------------------------------------------
    def live_mode?(league)
      league.simulation_games.where(is_real: true).exists?
    end

    def serialize_league(league)
      # Single query: group by is_real and simulated_at presence
      counts = league.simulation_games
                     .group(:is_real)
                     .pluck(:is_real, Arel.sql("COUNT(*) AS total, SUM(CASE WHEN simulated_at IS NOT NULL THEN 1 ELSE 0 END) AS played"))
                     .each_with_object({ total: 0, played: 0, has_real: false }) do |(is_real, total, played), h|
                       h[:total]    += total.to_i
                       h[:played]   += played.to_i
                       h[:has_real]  = true if is_real == true || is_real == 1
                     end

      build_league_hash(league, counts[:played], counts[:total], counts[:has_real])
    end

    def serialize_league_with(league, completed_games)
      total    = league.simulation_games.count
      played   = completed_games.size
      has_real = completed_games.any?(&:is_real)
      build_league_hash(league, played, total, has_real)
    end

    def serialize_game(game)
      {
        id:                  game.id,
        game_pk:             game.game_pk,
        game_date:           game.game_date&.to_s,
        home_team_id:        game.home_team_id,
        away_team_id:        game.away_team_id,
        home_team_abbr:      game.home_team_abbr,
        away_team_abbr:      game.away_team_abbr,
        home_team_name:      game.home_team_name,
        away_team_name:      game.away_team_name,
        home_team_color:     game.home_team_color,
        away_team_color:     game.away_team_color,
        home_score:          game.home_score,
        away_score:          game.away_score,
        home_pitcher_id:     game.home_pitcher_id,
        away_pitcher_id:     game.away_pitcher_id,
        home_pitcher_name:   game.home_pitcher_name,
        away_pitcher_name:   game.away_pitcher_name,
        is_real:             game.is_real,
        status:              game.final? ? "final" : "upcoming",
        actual_away_score:    game.actual_away_score,
        actual_home_score:    game.actual_home_score,
        has_actual_lineup:    game.actual_home_lineup_json.present?,
      }
    end

    private

    # For real games: fetch the actual batting order + pitching staff from the MLB boxscore.
    # Persists the result into the game record so subsequent re-sims skip the API call.
    def resolve_real_lineup(sim_game, home_r, away_r)
      # Use cached columns when available
      if sim_game.actual_home_lineup_json.present?
        return [
          sim_game.actual_home_lineup,
          sim_game.actual_away_lineup,
          sim_game.actual_home_pitchers,
          sim_game.actual_away_pitchers,
        ]
      end

      mlb    = MlbApiService.new
      lineup = mlb.game_lineup(sim_game.game_pk)

      if lineup[:error]
        # API failed — fall back to roster order so the sim still runs
        Rails.logger.warn "game_lineup #{sim_game.game_pk}: #{lineup[:error]}"
        return resolve_sim_lineup(sim_game, sim_game.simulation_league, home_r, away_r)
      end

      home_batters  = lineup.dig(:home, :batting_order) || []
      away_batters  = lineup.dig(:away, :batting_order) || []
      home_pitchers = lineup.dig(:home, :pitcher_ids)   || []
      away_pitchers = lineup.dig(:away, :pitcher_ids)   || []

      sim_game.update_columns(
        actual_home_lineup_json:   home_batters.to_json,
        actual_away_lineup_json:   away_batters.to_json,
        actual_home_pitchers_json: home_pitchers.to_json,
        actual_away_pitchers_json: away_pitchers.to_json,
      )

      [home_batters, away_batters, home_pitchers, away_pitchers]
    rescue => e
      Rails.logger.warn "resolve_real_lineup #{sim_game.id}: #{e.message}"
      resolve_sim_lineup(sim_game, sim_game.simulation_league, home_r, away_r)
    end

    # For sim / future games: use the roster's editable lineup order.
    def resolve_sim_lineup(sim_game, league, home_r, away_r, game_date: Date.today, home_mgr: nil, away_mgr: nil)
      injured_ids = league.simulation_injuries.active.on_date(game_date).pluck(:player_id).to_set

      home_lineup = home_r.lineup_order.reject { |id| injured_ids.include?(id) }
      away_lineup = away_r.lineup_order.reject { |id| injured_ids.include?(id) }

      home_pitcher_ids = pitcher_ids_for_game(sim_game.home_pitcher_id, home_r, home_mgr, league,
                                              sim_game.home_team_id, game_date, injured_ids)
      away_pitcher_ids = pitcher_ids_for_game(sim_game.away_pitcher_id, away_r, away_mgr, league,
                                              sim_game.away_team_id, game_date, injured_ids)

      [home_lineup, away_lineup, home_pitcher_ids, away_pitcher_ids]
    end

    def build_league_hash(league, played, total, has_real)
      {
        id:                   league.id,
        name:                 league.name,
        season:               league.season,
        scenario_id:          league.scenario_id,
        scenario_name:        league.projection_scenario&.name,
        batter_pitcher_blend: league.batter_pitcher_blend,
        current_sim_date:     league.current_sim_date&.to_s,
        status:               league.status,
        mode:                 has_real ? "live" : "full",
        live_mode:            has_real,
        games_played:         played,
        games_total:          total,
        created_at:           league.created_at,
        active_il_count:         league.simulation_injuries.active.count,
        news_story_count:        league.simulation_news_stories.count,
        simulation_franchise_id: league.simulation_franchise_id,
        franchise_can_advance:   franchise_can_advance?(league),
      }
    end

    def franchise_can_advance?(league)
      return false unless league.simulation_franchise_id.present?
      total = league.simulation_games.count
      return false if total == 0
      return false if league.simulation_games.where(simulated_at: nil).where.not(home_team_id: nil).exists?
      SimulationPlayoffSeries.where(simulation_league_id: league.id, round: "ws").where.not(winner_team_id: nil).exists?
    end

    # -----------------------------------------------------------------------
    # Standings computation
    # -----------------------------------------------------------------------
    def compute_standings_from(games, seed_teams: [])
      team_map = {}

      # Pre-seed with all known teams so 0-0 clubs still appear in standings
      seed_teams.each do |t|
        team_map[t[:team_id]] ||= blank_team_record(t[:team_id], t[:team_abbr], t[:team_name], t[:team_color])
      end

      games.each do |g|
        home_id = g.home_team_id
        away_id = g.away_team_id

        team_map[home_id] ||= blank_team_record(home_id, g.home_team_abbr, g.home_team_name, g.home_team_color)
        team_map[away_id] ||= blank_team_record(away_id, g.away_team_abbr, g.away_team_name, g.away_team_color)

        if g.home_score > g.away_score
          team_map[home_id][:w]  += 1
          team_map[away_id][:l]  += 1
          team_map[home_id][:streak_type] = "W"
          team_map[away_id][:streak_type] = "L"
        else
          team_map[home_id][:l]  += 1
          team_map[away_id][:w]  += 1
          team_map[home_id][:streak_type] = "L"
          team_map[away_id][:streak_type] = "W"
        end
        team_map[home_id][:rs] += g.home_score
        team_map[home_id][:ra] += g.away_score
        team_map[away_id][:rs] += g.away_score
        team_map[away_id][:ra] += g.home_score
      end

      teams = team_map.values.map do |t|
        gp  = t[:w] + t[:l]
        pct = gp > 0 ? (t[:w].to_f / gp).round(3) : 0.000
        t.merge(pct: pct, run_diff: t[:rs] - t[:ra], gp: gp)
      end

      grouped = Hash.new { |h, k| h[k] = Hash.new { |h2, k2| h2[k2] = [] } }
      teams.each do |t|
        div = TEAM_DIVISIONS[t[:team_id]]
        next unless div
        grouped[div[:league]][div[:division]] << t
      end

      # Sort each division and compute GB
      grouped.each_value do |divs|
        divs.each_value do |div_teams|
          div_teams.sort_by! { |t| [-t[:pct], -t[:run_diff]] }
          leader_w = div_teams.first[:w].to_f
          leader_l = div_teams.first[:l].to_f
          div_teams.each_with_index do |t, i|
            t[:gb] = i == 0 ? "—" : format("%.1f", ((leader_w - t[:w]) + (t[:l] - leader_l)) / 2.0)
          end
        end
      end

      grouped
    end

    def blank_team_record(id, abbr, name, color)
      {
        team_id:      id,
        abbr:         abbr,
        name:         name,
        color:        color || "#333333",
        w:            0,
        l:            0,
        rs:           0,
        ra:           0,
        streak_type:  nil,
      }
    end

    # -----------------------------------------------------------------------
    # Projection rate fetching
    # -----------------------------------------------------------------------

    # Bulk-populate rate_cache for a set of player IDs.
    # Fires ONE batch query for existing projections and at most ONE create_run
    # for players with no stored projection — instead of N per-player calls.
    def prefetch_into_cache(league, cache, player_ids)
      ids = Array(player_ids).map(&:to_i).select { |id| id > 0 && !cache.key?(id) }.uniq
      return if ids.empty?

      season   = Date.today.year
      scenario = league.scenario_id ? ProjectionScenario.find(league.scenario_id)
                                    : (ProjectionScenario.ensure_default!; ProjectionScenario.default_scenario)
      return unless scenario

      # One query for all players that already have a stored projection
      existing = PlayerProjection
        .joins(:projection_run)
        .where(
          player_id:       ids,
          projection_type: "full_season",
          season:          season,
          projection_runs: { projection_scenario_id: scenario.id }
        )
        .order("projection_runs.ran_at DESC")
        .to_a
        .each_with_object({}) { |p, h| h[p.player_id] ||= p }

      existing.each do |pid, proj|
        comps = proj.component_stats_hash || proj.projected_stats_hash
        cache[pid] = comps
      end

      # One create_run for all players with no projection yet
      missing = ids - existing.keys
      if missing.any?
        result = ProjectionService.create_run(
          scenario_id:     scenario.id,
          player_ids:      missing,
          projection_type: "full_season"
        )
        Array(result[:projections]).each do |proj|
          pid   = proj[:player_id].to_i
          comps = (proj[:component_stats] || proj[:projected_stats] || {}).transform_keys(&:to_sym)
          cache[pid] = comps
        end
      end
    rescue => e
      Rails.logger.warn "prefetch_into_cache: #{e.message}"
    end

    def build_player_list(player_ids, rate_cache, league, _type)
      Array(player_ids).filter_map do |pid|
        pid = pid.to_i
        next unless pid > 0

        rates = rate_cache[pid] ||= fetch_rates(pid, league)
        name  = ProjectionDataService.player_name(pid) rescue "Player ##{pid}"
        { player_id: pid, name: name, rates: rates }
      end
    end

    def fetch_rates(player_id, league)
      result = ProjectionService.project_player(
        player_id,
        scenario_id: league.scenario_id,
        type:        "full_season"
      )
      return {} if result[:error]

      comps = result[:component_stats] || result[:projected_stats] || {}
      comps.transform_keys(&:to_sym)
    rescue
      {}
    end

    # -----------------------------------------------------------------------
    # Box score builder
    # -----------------------------------------------------------------------
    def build_box_score(result, home_lineup, away_lineup, home_pitchers, away_pitchers, home_sp_id, away_sp_id)
      bs  = result[:batter_stats]
      ps  = result[:pitcher_stats]

      {
        home: {
          batters:  batting_lines(home_lineup, bs),
          pitchers: pitching_lines(home_pitchers, ps),
        },
        away: {
          batters:  batting_lines(away_lineup, bs),
          pitchers: pitching_lines(away_pitchers, ps),
        },
        linescore: result[:linescore],
      }
    end

    def batting_lines(lineup, stats)
      lineup.map do |player|
        stat_line = stats[player[:player_id]] || {}
        {
          player_id: player[:player_id],
          name:      player[:name],
          ab: stat_line[:ab].to_i, h: stat_line[:h].to_i, hr: stat_line[:hr].to_i,
          rbi: stat_line[:rbi].to_i, bb: stat_line[:bb].to_i, k: stat_line[:k].to_i, r: stat_line[:r].to_i,
          double: stat_line[:double].to_i, triple: stat_line[:triple].to_i,
          hbp: stat_line[:hbp].to_i, sf: stat_line[:sf].to_i,
        }
      end
    end

    def pitching_lines(pitchers, stats)
      pitchers.filter_map do |player|
        stat_line = stats[player[:player_id]]
        next unless stat_line && stat_line[:bf].to_i > 0
        outs = stat_line[:outs].to_i
        ip   = "#{outs / 3}.#{outs % 3}"
        {
          player_id: player[:player_id],
          name:      player[:name],
          ip: ip, h: stat_line[:h].to_i, er: stat_line[:er].to_i,
          bb: stat_line[:bb].to_i, k: stat_line[:k].to_i,
          bf: stat_line[:bf].to_i, hr: stat_line[:hr].to_i,
          decision: stat_line[:decision],
        }
      end
    end

    # -----------------------------------------------------------------------
    # Pitcher helpers
    # -----------------------------------------------------------------------

    # Build the ordered pitcher ID list for a sim-game half.
    # Uses BullpenManager when available; falls back to legacy rotation helpers.
    def pitcher_ids_for_game(pinned_sp_id, roster, mgr, league, team_id, game_date, injured_ids)
      if mgr && roster.has_pitcher_state?
        skip = injured_ids
        list = mgr.game_pitcher_list(skip_ids: skip)
        list = [pinned_sp_id] + list.reject { |id| id == pinned_sp_id } if pinned_sp_id
        list.compact
      else
        sp_id = pinned_sp_id ||
                legacy_rotation_starter(league, team_id, roster, game_date: game_date, skip_ids: injured_ids)
        bullpen = available_bullpen(roster, game_date).reject { |id| injured_ids.include?(id) }
        ([sp_id] + bullpen).compact
      end
    end

    # Record pitching appearances via BullpenManager and flush in one DB write.
    # Falls back to legacy update_rotation_state for rosters without pitcher_state_json.
    def record_and_flush(mgr, roster, sp_id, pitcher_lines, game_date)
      if mgr && roster.has_pitcher_state?
        relievers = (pitcher_lines || []).drop(1).filter_map do |p|
          { id: p[:player_id].to_i, outs: ip_to_outs(p[:ip]) } if p[:player_id].to_i > 0
        end
        mgr.record_game(sp_id, relievers: relievers)
        mgr.flush!
      else
        reliever_ids = (pitcher_lines || []).drop(1).map { |p| p[:player_id].to_i }
        legacy_update_rotation_state(roster, sp_id, game_date, reliever_ids: reliever_ids)
      end
    end

    # Extract bullpen_roles hash from roster for passing to the engine's role-based decisions.
    def bullpen_roles_for(roster)
      JSON.parse(roster.bullpen_roles_json || '{}').transform_keys(&:to_sym).tap do |roles|
        roles[:closer_id] = roles[:closer_id]&.to_i
        roles[:setup_ids] = Array(roles[:setup_ids]).map(&:to_i)
        roles[:long_ids]  = Array(roles[:long_ids]).map(&:to_i)
      end
    end

    # Legacy: select next SP from the rotation array using rest-day state.
    def legacy_rotation_starter(league, team_id, roster_or_rotation, game_date: Date.today, skip_ids: Set.new)
      rotation = roster_or_rotation.is_a?(Array) ? roster_or_rotation : roster_or_rotation.rotation
      rotation = rotation.reject { |id| skip_ids.include?(id) }
      return nil if rotation.empty?

      state = roster_or_rotation.respond_to?(:rotation_state_json) ?
              JSON.parse(roster_or_rotation.rotation_state_json || "{}") : {}

      rotation.each do |pid|
        last = state[pid.to_s]
        next if last && (game_date - Date.parse(last)).to_i < 5
        return pid.to_i
      end

      games_played = SimulationGame.where(simulation_league: league)
                                   .where("(home_team_id = ? OR away_team_id = ?) AND simulated_at IS NOT NULL", team_id, team_id)
                                   .count
      rotation[games_played % rotation.size]&.to_i
    end

    # Legacy: persist last-pitched date for starters and relievers.
    def legacy_update_rotation_state(roster, sp_id, game_date, reliever_ids: [])
      return unless roster
      state = JSON.parse(roster.rotation_state_json || "{}")
      state[sp_id.to_s] = game_date.to_s if sp_id
      reliever_ids.each { |id| state[id.to_s] = game_date.to_s if id }
      roster.update_columns(rotation_state_json: state.to_json)
    rescue => e
      Rails.logger.warn "legacy_update_rotation_state: #{e.message}"
    end

    # Legacy: all pitcher IDs not in the rotation array.
    def bullpen_ids(roster)
      rotation_set = Array(roster.rotation).map(&:to_i).to_set
      roster.roster
            .select { |p| pitcher?(p[:position] || p["position"]) }
            .map    { |p| (p[:id] || p["id"]).to_i }
            .reject { |id| rotation_set.include?(id) }
    end

    # Legacy: bullpen pitchers with 1-day rest enforced via rotation_state_json.
    def available_bullpen(roster, game_date)
      state = JSON.parse(roster.rotation_state_json || "{}")
      bullpen_ids(roster).select do |pid|
        last = state[pid.to_s]
        last.nil? || (game_date - Date.parse(last)).to_i >= 1
      end
    end

    # Bulk-fetch projected IP for a set of pitcher IDs.
    def fetch_projected_ip(player_ids, season, scenario_id)
      return {} if player_ids.empty?

      scenario = scenario_id ? ProjectionScenario.find_by(id: scenario_id)
                             : ProjectionScenario.default_scenario
      return {} unless scenario

      PlayerProjection
        .joins(:projection_run)
        .where(
          player_id:       player_ids,
          projection_type: "full_season",
          season:          season,
          projection_runs: { projection_scenario_id: scenario.id }
        )
        .order("projection_runs.ran_at DESC")
        .pluck(:player_id, :projected_stats_json)
        .each_with_object({}) do |(pid, json), h|
          next if h.key?(pid)
          stats = JSON.parse(json || "{}")
          h[pid] = stats["ip"].to_f
        end
    rescue => e
      Rails.logger.warn "fetch_projected_ip: #{e.message}"
      {}
    end

    def fallback_lineup(roster)
      roster.roster.first(9).map do |p|
        { player_id: p[:id], name: p[:name], rates: {} }
      end
    end

    def fallback_pitcher_struct
      { player_id: :league_avg_rp, name: "Bullpen", rates: {} }
    end

    def player_name_from_list(list, id)
      list.find { |p| p[:player_id].to_i == id.to_i }&.dig(:name)
    end

    def pitcher?(position)
      %w[SP RP P TWP].include?(position.to_s)
    end

    # Build a 9-man default lineup ensuring one player per key position before
    # any duplicates, so SS/OF are not crowded out by alphabetical API ordering.
    LINEUP_SLOT_ORDER = %w[C 1B 2B SS 3B LF CF RF DH OF].freeze

    def build_default_lineup(batters)
      by_pos = batters.group_by { |p| p[:position].to_s.upcase }
      used   = Set.new
      lineup = []

      LINEUP_SLOT_ORDER.each do |pos|
        next unless by_pos[pos]
        player = by_pos[pos].find { |p| !used.include?(p[:id]) }
        next unless player
        lineup << player
        used << player[:id]
        break if lineup.size == 9
      end

      # Pad to 9 with any remaining batters not yet in lineup
      remaining = batters.reject { |p| used.include?(p[:id]) }
      (lineup + remaining).first(9).map { |p| p[:id] }
    end

    # -----------------------------------------------------------------------
    # Season stat accumulation — single upsert_all instead of N+1 saves
    # -----------------------------------------------------------------------
    def accumulate_game_stats(league, box_score, home_team_id, away_team_id, home_sp_id, away_sp_id)
      now  = Time.now
      rows = []

      { home: home_team_id, away: away_team_id }.each do |side, team_id|
        box_score[side][:batters].each do |b|
          pid = b[:player_id].to_i
          next if pid == 0
          rows << {
            simulation_league_id: league.id,
            player_id:   pid,
            player_name: b[:name],
            player_type: "batter",
            team_id:     team_id,
            g: 1, ab: b[:ab].to_i, h: b[:h].to_i, hr: b[:hr].to_i,
            rbi: b[:rbi].to_i, bb: b[:bb].to_i, k: b[:k].to_i, r: b[:r].to_i,
            doubles: b[:double].to_i, triples: b[:triple].to_i,
            hbp: b[:hbp].to_i, sf: b[:sf].to_i,
            g_pitched: 0, gs: 0, outs_pitched: 0,
            h_allowed: 0, er: 0, bb_allowed: 0, k_pitched: 0,
            bf: 0, hr_allowed: 0,
            w: 0, l: 0, sv: 0,
            created_at: now, updated_at: now,
          }
        end

        sp_id = side == :home ? home_sp_id : away_sp_id
        box_score[side][:pitchers].each_with_index do |p, i|
          pid = p[:player_id].to_i
          next if pid == 0
          gs = i == 0 && pid == sp_id.to_i
          rows << {
            simulation_league_id: league.id,
            player_id:   pid,
            player_name: p[:name],
            player_type: "pitcher",
            team_id:     team_id,
            g: 0, ab: 0, h: 0, hr: 0, rbi: 0, bb: 0, k: 0, r: 0,
            g_pitched:    1,
            gs:           gs ? 1 : 0,
            outs_pitched: ip_to_outs(p[:ip]),
            h_allowed:    p[:h].to_i,
            er:           p[:er].to_i,
            bb_allowed:   p[:bb].to_i,
            k_pitched:    p[:k].to_i,
            bf:           p[:bf].to_i,
            hr_allowed:   p[:hr].to_i,
            w:  p[:decision] == "W" ? 1 : 0,
            l:  p[:decision] == "L" ? 1 : 0,
            sv: p[:decision] == "S" ? 1 : 0,
            doubles: 0, triples: 0, hbp: 0, sf: 0,
            created_at: now, updated_at: now,
          }
        end
      end

      return if rows.empty?

      SimulationPlayerStat.upsert_all(
        rows,
        unique_by: %i[simulation_league_id player_id],
        on_duplicate: Arel.sql(<<~SQL.squish)
          player_name   = excluded.player_name,
          team_id       = excluded.team_id,
          player_type   = CASE WHEN excluded.g_pitched > 0 THEN 'pitcher' ELSE simulation_player_stats.player_type END,
          g             = simulation_player_stats.g             + excluded.g,
          ab            = simulation_player_stats.ab            + excluded.ab,
          h             = simulation_player_stats.h             + excluded.h,
          hr            = simulation_player_stats.hr            + excluded.hr,
          rbi           = simulation_player_stats.rbi           + excluded.rbi,
          bb            = simulation_player_stats.bb            + excluded.bb,
          k             = simulation_player_stats.k             + excluded.k,
          r             = simulation_player_stats.r             + excluded.r,
          doubles       = simulation_player_stats.doubles       + excluded.doubles,
          triples       = simulation_player_stats.triples       + excluded.triples,
          hbp           = simulation_player_stats.hbp           + excluded.hbp,
          sf            = simulation_player_stats.sf            + excluded.sf,
          g_pitched     = simulation_player_stats.g_pitched     + excluded.g_pitched,
          gs            = simulation_player_stats.gs            + excluded.gs,
          outs_pitched  = simulation_player_stats.outs_pitched  + excluded.outs_pitched,
          h_allowed     = simulation_player_stats.h_allowed     + excluded.h_allowed,
          er            = simulation_player_stats.er            + excluded.er,
          bb_allowed    = simulation_player_stats.bb_allowed    + excluded.bb_allowed,
          k_pitched     = simulation_player_stats.k_pitched     + excluded.k_pitched,
          bf            = simulation_player_stats.bf            + excluded.bf,
          hr_allowed    = simulation_player_stats.hr_allowed    + excluded.hr_allowed,
          w             = simulation_player_stats.w             + excluded.w,
          l             = simulation_player_stats.l             + excluded.l,
          sv            = simulation_player_stats.sv            + excluded.sv,
          updated_at    = excluded.updated_at
        SQL
      )
    rescue => e
      Rails.logger.warn "accumulate_game_stats: #{e.message}"
    end

    def ip_to_outs(ip_string)
      return 0 unless ip_string
      parts = ip_string.to_s.split(".")
      (parts[0].to_i * 3) + parts[1].to_i
    end

    # -----------------------------------------------------------------------
    # Leaderboard helpers
    # -----------------------------------------------------------------------
    def serialize_player_stat(stat)
      if stat.player_type == "batter"
        { g: stat.g, ab: stat.ab, h: stat.h, hr: stat.hr, rbi: stat.rbi,
          bb: stat.bb, k: stat.k, r: stat.r,
          double: stat.doubles, triple: stat.triples, hbp: stat.hbp, sf: stat.sf,
          tb: stat.tb,
          avg: stat.avg, obp: stat.obp, slg: stat.slg, ops: stat.ops, iso: stat.iso, woba: stat.woba }
      else
        { gs: stat.gs, g: stat.g_pitched, w: stat.w, l: stat.l, sv: stat.sv,
          ip: stat.ip_display, h: stat.h_allowed, er: stat.er,
          bb: stat.bb_allowed, k: stat.k_pitched, bf: stat.bf, hr: stat.hr_allowed,
          era: stat.era, whip: stat.whip, k9: stat.k9, bb9: stat.bb9, hr9: stat.hr9, k_bb: stat.k_bb }
      end
    end

    def stat_row(stat, roster_map, ratings_map = {})
      roster  = roster_map[stat.team_id]
      ratings = ratings_map[stat.player_id]
      row = { player_id: stat.player_id, player_name: stat.player_name,
              team_id: stat.team_id, team_abbr: roster&.team_abbr, team_color: roster&.team_color,
              **serialize_player_stat(stat) }
      row[:ratings] = ratings if ratings.present?
      row
    end

    def top_batters(batters, roster_map, sort_key, limit, ratings_map = {})
      qualified = batters.select { |s| s.ab >= MIN_QUALIFYING_AB }
      sorted = case sort_key
               when :avg_val  then qualified.sort_by { |s| -s.avg }
               when :ops_val  then qualified.sort_by { |s| -s.ops }
               when :obp_val  then qualified.sort_by { |s| -s.obp }
               when :slg_val  then qualified.sort_by { |s| -s.slg }
               when :woba_val then qualified.sort_by { |s| -s.woba }
               else batters.sort_by { |s| -s.send(sort_key) }
               end
      sorted.first(limit).map { |s| stat_row(s, roster_map, ratings_map) }
    end

    def top_pitchers(pitchers, roster_map, sort_key, limit, ratings_map = {}, asc: false)
      filtered = pitchers.select { |s| s.outs_pitched >= MIN_QUALIFYING_IP * 3 }
      sorted = case sort_key
               when :era_val  then filtered.sort_by { |s| asc ? s.era  : -s.era  }
               when :whip_val then filtered.sort_by { |s| asc ? s.whip : -s.whip }
               when :k9_val   then filtered.sort_by { |s| asc ? s.k9   : -s.k9   }
               when :bb9_val  then filtered.sort_by { |s| asc ? s.bb9  : -s.bb9  }
               else filtered.sort_by { |s| asc ? s.send(sort_key) : -s.send(sort_key) }
               end
      sorted.first(limit).map { |s| stat_row(s, roster_map, ratings_map) }
    end

    def avg_ops(batters)
      total_ab  = batters.sum(&:ab).to_f
      return 0.0 if total_ab.zero?
      total_h   = batters.sum(&:h)
      total_bb  = batters.sum(&:bb)
      total_hbp = batters.sum { |s| s.respond_to?(:hbp) ? s.hbp.to_i : 0 }
      total_sf  = batters.sum { |s| s.respond_to?(:sf)  ? s.sf.to_i  : 0 }
      total_dbl = batters.sum { |s| s.respond_to?(:doubles) ? s.doubles.to_i : 0 }
      total_trp = batters.sum { |s| s.respond_to?(:triples) ? s.triples.to_i : 0 }
      total_hr  = batters.sum(&:hr)

      pa  = total_ab + total_bb + total_hbp + total_sf
      obp = pa > 0 ? (total_h + total_bb + total_hbp).to_f / pa : 0.0

      singles = (total_h - total_hr - total_dbl - total_trp).clamp(0, Float::INFINITY)
      tb  = singles + 2 * total_dbl + 3 * total_trp + 4 * total_hr
      slg = tb / total_ab

      obp + slg
    end

    # ── Injury / transaction serializers ─────────────────────────────────────

    def serialize_injury(inj, roster_map)
      roster = roster_map[inj.team_id]
      {
        id:             inj.id,
        player_id:      inj.player_id,
        player_name:    inj.player_name,
        team_id:        inj.team_id,
        team_abbr:      roster&.team_abbr,
        team_color:     roster&.team_color,
        severity:       inj.severity,
        il_start_date:  inj.il_start_date.to_s,
        il_end_date:    inj.il_end_date.to_s,
        days_remaining: inj.days_remaining(Date.today),
        returned:       inj.returned,
      }
    end

    def serialize_transaction(tx, roster_map)
      roster = roster_map[tx.team_id]
      {
        id:          tx.id,
        event_type:  tx.event_type,
        game_date:   tx.game_date.to_s,
        player_id:   tx.player_id,
        player_name: tx.player_name,
        team_id:     tx.team_id,
        team_abbr:   roster&.team_abbr,
        team_color:  roster&.team_color,
        metadata:    tx.metadata,
      }
    end

    # ── Config + strategy helpers ─────────────────────────────────────────────

    def league_config(league)
      (league.simulation_config || SimulationConfig.new).effective
    end

    def build_strategy(config)
      ManagerStrategy.new(config: config)
    end

    # ── Injury system ─────────────────────────────────────────────────────────

    # Mark players as returned whose IL stint ended by this date.
    def process_il_returns(league, date)
      returning = league.simulation_injuries.returning_by(date)
      returning.each do |inj|
        inj.update!(returned: true)
        SimulationTransaction.log(
          league:      league,
          event_type:  "injury_return",
          game_date:   date,
          player_id:   inj.player_id,
          team_id:     inj.team_id,
          player_name: inj.player_name,
          severity:    inj.severity
        )
      end
    end

    # Roll for new injuries across all players scheduled to play today.
    def roll_new_injuries(league, date, strategy, config)
      games_today = league.simulation_games.for_date(date)
      team_ids    = games_today.flat_map { |g| [g.home_team_id, g.away_team_id] }.uniq
      return if team_ids.empty?

      # Already injured player IDs — skip them
      active_injured = league.simulation_injuries.active.pluck(:player_id).to_set

      roster_players = SimulationRoster
        .where(simulation_league: league, team_id: team_ids)
        .flat_map do |r|
          name_map = r.roster.each_with_object({}) { |p, h| h[p[:id]] = p[:name] }
          (r.lineup_order + r.rotation).map do |pid|
            next if active_injured.include?(pid)
            { id: pid, name: name_map[pid], team_id: r.team_id }
          end.compact
        end

      injuries = strategy.roll_injuries(roster_players, injury_rate: config["injury_rate"].to_f)

      injuries.each do |inj|
        il_start = date
        il_end   = date + inj[:days]
        record   = SimulationInjury.create!(
          simulation_league: league,
          player_id:         inj[:player_id],
          team_id:           inj[:team_id],
          player_name:       inj[:player_name],
          severity:          inj[:severity],
          il_start_date:     il_start,
          il_end_date:       il_end
        )
        SimulationTransaction.log(
          league:      league,
          event_type:  "injury_start",
          game_date:   date,
          player_id:   inj[:player_id],
          team_id:     inj[:team_id],
          player_name: inj[:player_name],
          severity:    inj[:severity],
          il_end_date: il_end.to_s
        )
      end
    end
  end
end
