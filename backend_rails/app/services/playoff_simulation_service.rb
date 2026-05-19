class PlayoffSimulationService
  ROUND_ORDER  = %w[wc ds cs ws].freeze
  ROUND_LABELS = { "wc" => "Wild Card", "ds" => "Division Series", "cs" => "Championship Series", "ws" => "World Series" }.freeze
  SERIES_LEN   = { "wc" => 3, "ds" => 5, "cs" => 7, "ws" => 7 }.freeze

  class << self
    # -----------------------------------------------------------------------
    # Seed the playoff bracket from final regular-season standings.
    # Creates SimulationPlayoffSeries records for the Wild Card round.
    # -----------------------------------------------------------------------
    def seed_playoffs(league)
      existing = league.simulation_playoff_series.exists?
      return { error: "Playoffs already seeded" } if existing

      standings = SimulationService.compute_standings(league, filter: :all)
      bracket   = {}

      %w[AL NL].each do |lg|
        div_data = standings[lg] || {}
        seeds    = playoff_seeds(div_data)
        return { error: "Not enough teams qualified in #{lg}" } if seeds.size < 6

        bracket[lg] = seeds
      end

      # Create Wild Card series (3–6, 4–5 for each league)
      %w[AL NL].each_with_index do |lg, _|
        seeds = bracket[lg]

        # 3 vs 6
        create_series(league, "wc", lg, 0, seeds[2], seeds[5])
        # 4 vs 5
        create_series(league, "wc", lg, 1, seeds[3], seeds[4])
      end

      { seeded: true, bracket: bracket_state(league) }
    rescue => e
      { error: e.message }
    end

    # -----------------------------------------------------------------------
    # Simulate all incomplete series for the given round.
    # If round is nil, simulates the current (earliest incomplete) round.
    # -----------------------------------------------------------------------
    def simulate_round(league, round = nil)
      round ||= current_round(league)
      return { error: "No round to simulate" } unless round

      series_list = league.simulation_playoff_series.where(round: round, status: %w[pending in_progress])
      return { error: "No incomplete series in round #{round}" } if series_list.empty?

      series_list.each { |s| simulate_series(s, league) }

      advance_bracket(league)

      { round: round, bracket: bracket_state(league) }
    rescue => e
      { error: e.message }
    end

    # -----------------------------------------------------------------------
    # Serialize full bracket state for the frontend.
    # -----------------------------------------------------------------------
    def bracket_state(league)
      series = league.simulation_playoff_series.order(:round, :league, :series_index)
      grouped = series.group_by(&:round)
      {
        rounds: ROUND_ORDER.map do |r|
          {
            round: r,
            label: ROUND_LABELS[r],
            series: (grouped[r] || []).map { |s| serialize_series(s) },
          }
        end.select { |r| r[:series].any? },
      }
    rescue => e
      { error: e.message }
    end

    private

    # -----------------------------------------------------------------------
    # Pick 3 division winners + 3 wild card teams from a league's standings.
    # Returns an array of team hashes sorted by seed order:
    # [div_winner_1, div_winner_2, div_winner_3, wc1, wc2, wc3]
    # -----------------------------------------------------------------------
    def playoff_seeds(div_data)
      div_winners = []
      wild_cards  = []

      div_data.each_value do |teams|
        sorted = teams.sort_by { |t| [-t[:pct].to_f, -t[:run_diff].to_i] }
        div_winners << sorted.first if sorted.any?
        wild_cards.concat(sorted[1..])
      end

      div_winners.sort_by! { |t| [-t[:pct].to_f, -t[:run_diff].to_i] }
      wild_cards.sort_by!  { |t| [-t[:pct].to_f, -t[:run_diff].to_i] }

      (div_winners + wild_cards.first(3)).first(6)
    end

    def create_series(league, round, lg, series_index, home_team, away_team)
      league.simulation_playoff_series.create!(
        season:          league.season,
        round:           round,
        league:          lg,
        series_index:    series_index,
        home_team_id:    home_team[:team_id],
        away_team_id:    away_team[:team_id],
        home_team_abbr:  home_team[:abbr],
        away_team_abbr:  away_team[:abbr],
        home_team_color: home_team[:color],
        away_team_color: away_team[:color],
        series_length:   SERIES_LEN[round],
        games_json:      [].to_json,
        status:          "pending"
      )
    end

    def simulate_series(series, league)
      series.update!(status: "in_progress")
      wins_needed = series.wins_needed
      games       = series.games
      home_wins   = series.home_wins
      away_wins   = series.away_wins
      rate_cache  = {}

      home_r = SimulationRoster.find_by(simulation_league: league, team_id: series.home_team_id)
      away_r = SimulationRoster.find_by(simulation_league: league, team_id: series.away_team_id)
      return series.update!(status: "complete", winner_team_id: series.home_team_id) unless home_r && away_r

      reset_pitcher_rest(home_r)
      reset_pitcher_rest(away_r)

      player_info     = build_player_info(home_r, series.home_team_id, away_r, series.away_team_id)
      all_bat_stats   = {}
      all_pitch_stats = {}

      while home_wins < wins_needed && away_wins < wins_needed
        result = run_single_game(league, home_r, away_r, rate_cache)
        next if result[:error]

        accumulate_series_stats(result[:batter_stats],  all_bat_stats,   type: :batter)
        accumulate_series_stats(result[:pitcher_stats], all_pitch_stats,  type: :pitcher)

        if result[:home_score] > result[:away_score]
          home_wins += 1
        else
          away_wins += 1
        end
        games << { home_score: result[:home_score], away_score: result[:away_score],
                   home_wins: home_wins, away_wins: away_wins }
      end

      winner_id = home_wins >= wins_needed ? series.home_team_id : series.away_team_id
      series.update!(
        home_wins:      home_wins,
        away_wins:      away_wins,
        winner_team_id: winner_id,
        games_json:     games.to_json,
        status:         "complete"
      )

      persist_series_player_stats(series, all_bat_stats, all_pitch_stats, player_info)
    end

    def run_single_game(league, home_r, away_r, rate_cache)
      # Playoffs use a fresh manager per game — no cross-game rest tracking within a series.
      today    = Date.today
      home_mgr = BullpenManager.new(home_r, today)
      away_mgr = BullpenManager.new(away_r, today)

      home_pitcher_ids = home_mgr.game_pitcher_list
      away_pitcher_ids = away_mgr.game_pitcher_list

      build = ->(ids, type) { SimulationService.send(:build_player_list, ids, rate_cache, league, type) }

      home_lineup   = build.(home_r.lineup_order,  :batter).presence  || SimulationService.send(:fallback_lineup, home_r)
      away_lineup   = build.(away_r.lineup_order,  :batter).presence  || SimulationService.send(:fallback_lineup, away_r)
      home_pitchers = build.(home_pitcher_ids, :pitcher).presence || [SimulationService.send(:fallback_pitcher_struct)]
      away_pitchers = build.(away_pitcher_ids, :pitcher).presence || [SimulationService.send(:fallback_pitcher_struct)]

      result = GameSimulationEngine.simulate_game(
        home_lineup:   home_lineup,
        away_lineup:   away_lineup,
        home_pitchers: home_pitchers,
        away_pitchers: away_pitchers,
        blend:         league.batter_pitcher_blend
      )
      result.merge(batter_stats: result[:batter_stats], pitcher_stats: result[:pitcher_stats])
    rescue => e
      { error: e.message }
    end

    # -----------------------------------------------------------------------
    # After a round completes, wire up the next round's series.
    # -----------------------------------------------------------------------
    def advance_bracket(league)
      %w[AL NL].each do |lg|
        wc_series   = league.simulation_playoff_series.where(round: "wc",   league: lg).order(:series_index)
        ds_series   = league.simulation_playoff_series.where(round: "ds",   league: lg)
        cs_series   = league.simulation_playoff_series.where(round: "cs",   league: lg)
        ws_series   = league.simulation_playoff_series.where(round: "ws",   league: "MLB")

        standings = playoff_seeds_for_league(league, lg)

        if wc_series.any? && wc_series.all?(&:complete?) && ds_series.empty?
          create_ds_round(league, lg, standings, wc_series)
        end

        if ds_series.any? && ds_series.all?(&:complete?) && cs_series.empty?
          create_cs_round(league, lg, ds_series)
        end
      end

      al_cs = league.simulation_playoff_series.find_by(round: "cs", league: "AL")
      nl_cs = league.simulation_playoff_series.find_by(round: "cs", league: "NL")
      ws    = league.simulation_playoff_series.where(round: "ws")

      if al_cs&.complete? && nl_cs&.complete? && ws.empty?
        al_champ = team_hash_from_series(al_cs)
        nl_champ = team_hash_from_series(nl_cs)
        create_series(league, "ws", "MLB", 0, al_champ, nl_champ)
      end
    end

    def create_ds_round(league, lg, seeds, wc_series)
      wc_winners = wc_series.map { |s| winner_team_hash(s) }
      return unless seeds.size >= 2 && wc_winners.size == 2

      create_series(league, "ds", lg, 0, seeds[0], wc_winners[1])
      create_series(league, "ds", lg, 1, seeds[1], wc_winners[0])
    end

    def create_cs_round(league, lg, ds_series)
      winners = ds_series.sort_by(&:series_index).map { |s| winner_team_hash(s) }
      return unless winners.size == 2
      create_series(league, "cs", lg, 0, winners[0], winners[1])
    end

    def playoff_seeds_for_league(league, lg)
      standings = SimulationService.compute_standings(league, filter: :all)
      playoff_seeds(standings[lg] || {})
    end

    def winner_team_hash(series)
      if series.winner_team_id == series.home_team_id
        { team_id: series.home_team_id, abbr: series.home_team_abbr, color: series.home_team_color }
      else
        { team_id: series.away_team_id, abbr: series.away_team_abbr, color: series.away_team_color }
      end
    end

    def team_hash_from_series(series)
      winner_team_hash(series)
    end

    # Clear last_pitched and consecutive_days so every pitcher is fresh at the
    # start of each playoff series, matching real baseball's between-round rest.
    def reset_pitcher_rest(roster)
      state = roster.pitcher_state
      return unless state["pitchers"].is_a?(Hash)
      state["pitchers"].each_value do |p|
        p["last_pitched"]     = nil
        p["consecutive_days"] = 0
        p["season_outs"]      = 0
      end
      json = state.to_json
      roster.update_columns(pitcher_state_json: json)
      roster.pitcher_state_json = json  # keep in-memory object in sync
    rescue => e
      Rails.logger.warn("[PlayoffSimulationService] reset_pitcher_rest: #{e.message}")
    end

    def build_player_info(home_r, home_team_id, away_r, away_team_id)
      info = {}
      [[home_r, home_team_id], [away_r, away_team_id]].each do |roster, team_id|
        JSON.parse(roster.roster_json || "[]").each do |p|
          info[p["id"].to_i] = { name: p["name"], team_id: team_id }
        end
      rescue JSON::ParserError
        next
      end
      info
    end

    def accumulate_series_stats(game_stats, accumulated, type:)
      return unless game_stats.is_a?(Hash)

      game_stats.each do |pid, s|
        next unless pid.is_a?(Integer)

        if type == :batter
          accumulated[pid] ||= { g: 0, ab: 0, h: 0, hr: 0, rbi: 0, bb: 0, k: 0, r: 0,
                                  double: 0, triple: 0, hbp: 0, sf: 0 }
          accumulated[pid][:g]      += 1 if s[:ab].to_i > 0
          %i[ab h hr rbi bb k r].each { |key| accumulated[pid][key] += s[key].to_i }
          accumulated[pid][:double] += s[:double].to_i
          accumulated[pid][:triple] += s[:triple].to_i
          accumulated[pid][:hbp]    += s[:hbp].to_i
          accumulated[pid][:sf]     += s[:sf].to_i
        else
          accumulated[pid] ||= { g_pitched: 0, gs: 0, outs: 0, h: 0, er: 0, bb: 0, k: 0,
                                  hr: 0, bf: 0, w: 0, l: 0, sv: 0 }
          accumulated[pid][:g_pitched] += 1
          %i[outs h er bb k hr bf].each { |key| accumulated[pid][key] += s[key].to_i }
          case s[:decision]
          when "W" then accumulated[pid][:w]  += 1
          when "L" then accumulated[pid][:l]  += 1
          when "S" then accumulated[pid][:sv] += 1
          end
        end
      end
    end

    def persist_series_player_stats(series, all_bat_stats, all_pitch_stats, player_info)
      now  = Time.current
      rows = []

      all_bat_stats.each do |pid, s|
        info = player_info[pid] || {}
        rows << {
          simulation_league_id:         series.simulation_league_id,
          simulation_playoff_series_id: series.id,
          round:       series.round,
          player_id:   pid,
          player_name: info[:name],
          player_type: "batter",
          team_id:     info[:team_id] || 0,
          g: s[:g], ab: s[:ab], h: s[:h], hr: s[:hr], rbi: s[:rbi], bb: s[:bb],
          k: s[:k], r: s[:r], doubles: s[:double], triples: s[:triple],
          hbp: s[:hbp], sf: s[:sf],
          g_pitched: 0, gs: 0, outs_pitched: 0, h_allowed: 0, er: 0,
          bb_allowed: 0, k_pitched: 0, bf: 0, hr_allowed: 0, w: 0, l: 0, sv: 0,
          created_at: now, updated_at: now,
        }
      end

      all_pitch_stats.each do |pid, s|
        info = player_info[pid] || {}
        rows << {
          simulation_league_id:         series.simulation_league_id,
          simulation_playoff_series_id: series.id,
          round:       series.round,
          player_id:   pid,
          player_name: info[:name],
          player_type: "pitcher",
          team_id:     info[:team_id] || 0,
          g: 0, ab: 0, h: 0, hr: 0, rbi: 0, bb: 0, k: 0, r: 0,
          doubles: 0, triples: 0, hbp: 0, sf: 0,
          g_pitched: s[:g_pitched], gs: s[:gs], outs_pitched: s[:outs],
          h_allowed: s[:h], er: s[:er], bb_allowed: s[:bb], k_pitched: s[:k],
          bf: s[:bf], hr_allowed: s[:hr], w: s[:w], l: s[:l], sv: s[:sv],
          created_at: now, updated_at: now,
        }
      end

      return if rows.empty?

      SimulationPlayoffPlayerStat.upsert_all(
        rows,
        unique_by: %i[simulation_playoff_series_id player_id],
        on_duplicate: Arel.sql(<<~SQL.squish)
          player_name  = excluded.player_name,
          player_type  = excluded.player_type,
          g            = excluded.g,
          ab           = excluded.ab,
          h            = excluded.h,
          hr           = excluded.hr,
          rbi          = excluded.rbi,
          bb           = excluded.bb,
          k            = excluded.k,
          r            = excluded.r,
          doubles      = excluded.doubles,
          triples      = excluded.triples,
          hbp          = excluded.hbp,
          sf           = excluded.sf,
          g_pitched    = excluded.g_pitched,
          gs           = excluded.gs,
          outs_pitched = excluded.outs_pitched,
          h_allowed    = excluded.h_allowed,
          er           = excluded.er,
          bb_allowed   = excluded.bb_allowed,
          k_pitched    = excluded.k_pitched,
          bf           = excluded.bf,
          hr_allowed   = excluded.hr_allowed,
          w            = excluded.w,
          l            = excluded.l,
          sv           = excluded.sv,
          updated_at   = excluded.updated_at
        SQL
      )
    rescue => e
      Rails.logger.warn "[PlayoffSimulationService] persist_series_player_stats: #{e.message}"
    end

    def current_round(league)
      ROUND_ORDER.find do |r|
        league.simulation_playoff_series.where(round: r, status: %w[pending in_progress]).exists?
      end
    end

    def serialize_series(series)
      {
        id:              series.id,
        round:           series.round,
        league:          series.league,
        series_index:    series.series_index,
        series_length:   series.series_length,
        home_team_id:    series.home_team_id,
        away_team_id:    series.away_team_id,
        home_team_abbr:  series.home_team_abbr,
        away_team_abbr:  series.away_team_abbr,
        home_team_color: series.home_team_color,
        away_team_color: series.away_team_color,
        home_wins:       series.home_wins,
        away_wins:       series.away_wins,
        winner_team_id:  series.winner_team_id,
        status:          series.status,
        games:           series.games,
      }
    end
  end
end
