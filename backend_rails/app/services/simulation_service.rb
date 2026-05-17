class SimulationService
  TEAM_DIVISIONS = {
    108 => { league: "AL", division: "West"    },
    109 => { league: "NL", division: "West"    },
    110 => { league: "AL", division: "East"    },
    111 => { league: "AL", division: "East"    },
    112 => { league: "NL", division: "Central" },
    113 => { league: "NL", division: "Central" },
    114 => { league: "AL", division: "Central" },
    115 => { league: "NL", division: "Central" },
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
    def setup_league(name:, season:, scenario_id: nil, batter_pitcher_blend: 0.45)
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

      imported = 0
      teams.each do |team|
        tid    = team[:id]
        roster = mlb.send(:team_roster, tid) rescue []
        next if roster.blank?

        batters  = roster.reject { |p| pitcher?(p[:position]) }
        sps      = roster.select { |p| p[:position] == "SP" }
        rps      = roster.select { |p| p[:position] == "RP" }
        rotation = (sps + rps).first(10).map { |p| p[:id] }
        lineup   = batters.first(9).map { |p| p[:id] }

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
          game_date:       g[:game_date],
          home_team_id:    g[:home_team_id],
          away_team_id:    g[:away_team_id],
          home_team_abbr:  g[:home_team_abbr],
          away_team_abbr:  g[:away_team_abbr],
          home_team_name:  g[:home_team_name],
          away_team_name:  g[:away_team_name],
          home_team_color: MlbApiService::TEAM_META.dig(g[:home_team_id], :color),
          away_team_color: MlbApiService::TEAM_META.dig(g[:away_team_id], :color),
          home_score:      g[:home_score].to_i,
          away_score:      g[:away_score].to_i,
          is_real:         true,
          simulated_at:    Time.now
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
    def simulate_day(league, date)
      games   = league.simulation_games.for_date(date).upcoming
      results = []
      cache   = {}

      games.each do |g|
        result = simulate_game(league, g, rate_cache: cache)
        results << result unless result[:error]
      end

      league.update!(current_sim_date: date)
      { simulated: results.size, date: date.to_s, games: results }
    rescue => e
      { error: e.message }
    end

    # -----------------------------------------------------------------------
    # Simulate a single game. rate_cache is populated in-memory across calls.
    # -----------------------------------------------------------------------
    def simulate_game(league, sim_game, rate_cache: {})
      home_r = SimulationRoster.find_by(simulation_league: league, team_id: sim_game.home_team_id)
      away_r = SimulationRoster.find_by(simulation_league: league, team_id: sim_game.away_team_id)
      return { error: "Rosters not found for this game" } unless home_r && away_r

      home_sp_id = rotation_starter(league, sim_game.home_team_id, home_r.rotation)
      away_sp_id = rotation_starter(league, sim_game.away_team_id, away_r.rotation)

      home_pitcher_ids = ([home_sp_id] + home_r.rotation.reject { |id| id == home_sp_id }).compact
      away_pitcher_ids = ([away_sp_id] + away_r.rotation.reject { |id| id == away_sp_id }).compact

      home_lineup   = build_player_list(home_r.lineup_order, rate_cache, league, :batter)
      away_lineup   = build_player_list(away_r.lineup_order, rate_cache, league, :batter)
      home_pitchers = build_player_list(home_pitcher_ids,    rate_cache, league, :pitcher)
      away_pitchers = build_player_list(away_pitcher_ids,    rate_cache, league, :pitcher)

      result = GameSimulationEngine.simulate_game(
        home_lineup:   home_lineup.presence || fallback_lineup(home_r),
        away_lineup:   away_lineup.presence || fallback_lineup(away_r),
        home_pitchers: home_pitchers.presence || [fallback_pitcher_struct],
        away_pitchers: away_pitchers.presence || [fallback_pitcher_struct],
        blend:         league.batter_pitcher_blend
      )

      box = build_box_score(
        result,
        home_lineup, away_lineup,
        home_pitchers, away_pitchers,
        home_sp_id, away_sp_id
      )

      home_sp_name = player_name_from_list(home_pitchers, home_sp_id)
      away_sp_name = player_name_from_list(away_pitchers, away_sp_id)

      sim_game.update!(
        home_score:         result[:home_score],
        away_score:         result[:away_score],
        home_pitcher_id:    home_sp_id&.to_i,
        away_pitcher_id:    away_sp_id&.to_i,
        home_pitcher_name:  home_sp_name,
        away_pitcher_name:  away_sp_name,
        is_real:            false,
        box_score_json:     box.to_json,
        simulated_at:       Time.now
      )

      { game: serialize_game(sim_game), box_score: box }
    rescue => e
      Rails.logger.error "simulate_game #{sim_game.id}: #{e.message}\n#{e.backtrace.first(5).join("\n")}"
      { error: e.message }
    end

    # -----------------------------------------------------------------------
    # Full league state — standings + today's schedule + league meta.
    # -----------------------------------------------------------------------
    def league_state(league)
      {
        league:     serialize_league(league),
        standings:  compute_standings(league),
        today:      {
          date:  league.current_sim_date&.to_s || Date.today.to_s,
          games: league.simulation_games
                       .for_date(league.current_sim_date || Date.today)
                       .order(:id)
                       .map { |g| serialize_game(g) }
        }
      }
    rescue => e
      { error: e.message }
    end

    def update_roster(league, team_id, data)
      roster = SimulationRoster.find_by!(simulation_league: league, team_id: team_id)
      attrs  = {}
      attrs[:lineup_order_json] = data[:lineup_order].to_json   if data[:lineup_order]
      attrs[:rotation_json]     = data[:rotation].to_json        if data[:rotation]
      roster.update!(attrs)
      { ok: true }
    rescue => e
      { error: e.message }
    end

    def schedule_for_date(league, date)
      games = league.simulation_games.for_date(date).order(:id)
      { date: date.to_s, games: games.map { |g| serialize_game(g) } }
    end

    # -----------------------------------------------------------------------
    # Serializers
    # -----------------------------------------------------------------------
    def serialize_league(league)
      played = league.simulation_games.completed.count
      total  = league.simulation_games.count
      {
        id:                   league.id,
        name:                 league.name,
        season:               league.season,
        scenario_id:          league.scenario_id,
        scenario_name:        league.projection_scenario&.name,
        batter_pitcher_blend: league.batter_pitcher_blend,
        current_sim_date:     league.current_sim_date&.to_s,
        status:               league.status,
        games_played:         played,
        games_total:          total,
        created_at:           league.created_at,
      }
    end

    def serialize_game(game)
      {
        id:                game.id,
        game_pk:           game.game_pk,
        game_date:         game.game_date&.to_s,
        home_team_id:      game.home_team_id,
        away_team_id:      game.away_team_id,
        home_team_abbr:    game.home_team_abbr,
        away_team_abbr:    game.away_team_abbr,
        home_team_name:    game.home_team_name,
        away_team_name:    game.away_team_name,
        home_team_color:   game.home_team_color,
        away_team_color:   game.away_team_color,
        home_score:        game.home_score,
        away_score:        game.away_score,
        home_pitcher_name: game.home_pitcher_name,
        away_pitcher_name: game.away_pitcher_name,
        is_real:           game.is_real,
        status:            game.final? ? "final" : "upcoming",
      }
    end

    private

    # -----------------------------------------------------------------------
    # Standings computation
    # -----------------------------------------------------------------------
    def compute_standings(league)
      games    = league.simulation_games.completed.to_a
      team_map = {}

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

      # Ensure every known team appears (even with 0-0 record)
      MlbApiService::TEAM_META.each_key do |tid|
        team_map[tid] ||= blank_team_record(
          tid,
          MlbApiService::TEAM_META.dig(tid, :abbr),
          nil,
          MlbApiService::TEAM_META.dig(tid, :color)
        )
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
      lineup.map do |p|
        s = stats[p[:player_id]] || {}
        {
          player_id: p[:player_id],
          name:      p[:name],
          ab: s[:ab].to_i, h: s[:h].to_i, hr: s[:hr].to_i,
          rbi: s[:rbi].to_i, bb: s[:bb].to_i, k: s[:k].to_i, r: s[:r].to_i,
        }
      end
    end

    def pitching_lines(pitchers, stats)
      pitchers.filter_map do |p|
        s = stats[p[:player_id]]
        next unless s && s[:bf].to_i > 0
        outs  = s[:outs].to_i
        ip    = "#{outs / 3}.#{outs % 3}"
        {
          player_id: p[:player_id],
          name:      p[:name],
          ip: ip, h: s[:h].to_i, er: s[:er].to_i,
          bb: s[:bb].to_i, k: s[:k].to_i,
          decision: s[:decision],
        }
      end
    end

    # -----------------------------------------------------------------------
    # Rotation helpers
    # -----------------------------------------------------------------------
    def rotation_starter(league, team_id, rotation)
      return nil if rotation.empty?
      games_played = SimulationGame.where(simulation_league: league)
                                   .where("(home_team_id = ? OR away_team_id = ?) AND simulated_at IS NOT NULL", team_id, team_id)
                                   .count
      rotation[games_played % rotation.size]&.to_i
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
  end
end
