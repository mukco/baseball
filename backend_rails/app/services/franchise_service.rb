class FranchiseService
  class << self
    # -----------------------------------------------------------------------
    # Create a new franchise + its first season league
    # -----------------------------------------------------------------------
    def create(name:, season:, scenario_id: nil, batter_pitcher_blend: 0.45)
      ActiveRecord::Base.transaction do
        franchise = SimulationFranchise.create!(name: name, start_season: season)

        result = SimulationService.setup_league(
          name:                 "#{name} — #{season}",
          season:               season,
          scenario_id:          scenario_id,
          batter_pitcher_blend: batter_pitcher_blend,
          mode:                 :full
        )
        raise result[:error] if result[:error]

        league = SimulationLeague.find(result[:id])
        league.update!(simulation_franchise_id: franchise.id)

        serialize(franchise.reload)
      end
    rescue => e
      { error: e.message }
    end

    # -----------------------------------------------------------------------
    # Advance a completed franchise season → create the next season
    # -----------------------------------------------------------------------
    def advance_season(franchise)
      current = franchise.current_league
      return { error: "No current season to advance from" } unless current
      return { error: "Current season is not complete — simulate all games first" } unless season_complete?(current)
      return { error: "Playoffs must conclude before advancing — simulate the World Series first" } unless playoffs_concluded?(current)

      next_season = current.season + 1

      ActiveRecord::Base.transaction do
        new_league = SimulationLeague.create!(
          name:                 "#{franchise.name} — #{next_season}",
          season:               next_season,
          simulation_franchise_id: franchise.id,
          scenario_id:          current.scenario_id,
          batter_pitcher_blend: current.batter_pitcher_blend,
          current_sim_date:     Date.new(next_season, 3, 28),
          status:               "active"
        )

        clone_rosters(from: current, to: new_league)
        import_or_clone_schedule(new_league, current)

        first_game = new_league.simulation_games.minimum(:game_date)
        new_league.update!(current_sim_date: first_game) if first_game

        serialize(franchise.reload)
      end
    rescue => e
      { error: e.message }
    end

    # -----------------------------------------------------------------------
    # Serialization
    # -----------------------------------------------------------------------
    def serialize(franchise)
      seasons = franchise.simulation_leagues.map { |l| serialize_season(l) }
      {
        id:             franchise.id,
        name:           franchise.name,
        start_season:   franchise.start_season,
        seasons_count:  franchise.simulation_leagues.size,
        current_season: franchise.current_league&.season,
        can_advance:    can_advance?(franchise),
        seasons:        seasons,
      }
    end

    def serialize_season(league)
      total  = league.simulation_games.count
      played = league.simulation_games.where.not(simulated_at: nil).count
      complete = total > 0 && played == total

      champion = playoff_champion(league)

      {
        id:               league.id,
        season:           league.season,
        games_total:      total,
        games_played:     played,
        complete:         complete,
        pct_complete:     total > 0 ? (played.to_f / total * 100).round(1) : 0,
        current_sim_date: league.current_sim_date&.to_s,
        champion:         champion,
        awards:           compact_awards(league),
        stat_leaders:     season_stat_leaders(league),
        playoff_results:  playoff_series_results(league),
      }
    end

    # -----------------------------------------------------------------------
    # Index serialization (lightweight — no per-season game counts)
    # -----------------------------------------------------------------------
    def serialize_index(franchise)
      {
        id:            franchise.id,
        name:          franchise.name,
        start_season:  franchise.start_season,
        seasons_count: franchise.simulation_leagues.size,
        current_season: franchise.current_league&.season,
        can_advance:   can_advance?(franchise),
      }
    end

    private

    # All award winners across regular season + playoffs, pulled from cached data only.
    def compact_awards(league)
      regular = AwardService.awards_data(league)
      playoff = PlayoffAwardService.playoff_awards_data(league)
      return nil unless regular || playoff

      rows = []

      # Postseason MVPs (most prominent — shown first)
      if playoff
        [
          ["ws_mvp",   "WS MVP",   "postseason"],
          ["alcs_mvp", "ALCS MVP", "postseason"],
          ["nlcs_mvp", "NLCS MVP", "postseason"],
        ].each do |key, label, cat|
          w = playoff.dig(key, "winner")
          next unless w
          rows << award_row(w, label, cat)
        end
      end

      # Core league awards
      if regular
        [
          [:mvp,           "al", "AL MVP",        "league"],
          [:mvp,           "nl", "NL MVP",        "league"],
          [:cy_young,      "al", "AL Cy Young",   "league"],
          [:cy_young,      "nl", "NL Cy Young",   "league"],
          [:batting_title, "al", "AL Bat Title",  "stats"],
          [:batting_title, "nl", "NL Bat Title",  "stats"],
          [:hr_leader,     "al", "AL HR Leader",  "stats"],
          [:hr_leader,     "nl", "NL HR Leader",  "stats"],
          [:rbi_leader,    "al", "AL RBI Leader", "stats"],
          [:rbi_leader,    "nl", "NL RBI Leader", "stats"],
          [:era_title,     "al", "AL ERA Title",  "stats"],
          [:era_title,     "nl", "NL ERA Title",  "stats"],
          [:k_leader,      "overall", "K Leader",     "stats"],
          [:saves_leader,  "overall", "Saves Leader", "stats"],
        ].each do |key, lg, label, cat|
          w = regular.dig(key.to_s, lg, "winner") || regular.dig(key.to_s, lg.upcase, "winner")
          next unless w
          rows << award_row(w, label, cat)
        end
      end

      rows.presence
    end

    def award_row(winner, label, category)
      {
        label:       label,
        category:    category,
        player_name: winner["player_name"] || winner["name"],
        player_id:   winner["player_id"],
        team_abbr:   winner["team_abbr"],
      }
    end

    # Lightweight stat leaders from raw DB counts — one query per stat, no full scan.
    def season_stat_leaders(league)
      leaders = {}

      hr_row = league.simulation_player_stats
                     .where(player_type: "batter").where("ab >= 50")
                     .order(hr: :desc).select(:player_id, :player_name, :hr).first
      leaders[:hr] = { player_id: hr_row.player_id, player_name: hr_row.player_name, value: hr_row.hr } if hr_row&.hr.to_i > 0

      avg_row = league.simulation_player_stats
                      .where(player_type: "batter").where("ab >= 100")
                      .order(Arel.sql("CAST(h AS FLOAT) / ab DESC"))
                      .select(:player_id, :player_name, :h, :ab).first
      if avg_row && avg_row.ab > 0
        leaders[:avg] = { player_id: avg_row.player_id, player_name: avg_row.player_name,
                          value: (avg_row.h.to_f / avg_row.ab).round(3) }
      end

      k_row = league.simulation_player_stats
                    .where(player_type: "pitcher").where("outs_pitched >= 30")
                    .order(k_pitched: :desc).select(:player_id, :player_name, :k_pitched).first
      leaders[:k] = { player_id: k_row.player_id, player_name: k_row.player_name, value: k_row.k_pitched } if k_row

      era_row = league.simulation_player_stats
                      .where(player_type: "pitcher").where("outs_pitched >= 45")
                      .order(Arel.sql("CAST(er AS FLOAT) * 27 / outs_pitched ASC"))
                      .select(:player_id, :player_name, :er, :outs_pitched).first
      if era_row && era_row.outs_pitched > 0
        leaders[:era] = { player_id: era_row.player_id, player_name: era_row.player_name,
                          value: (era_row.er.to_f * 27 / era_row.outs_pitched).round(2) }
      end

      leaders.presence || {}
    end

    # Completed playoff series, ordered by round progression.
    ROUND_ORDER_IDX = { "wc" => 0, "ds" => 1, "cs" => 2, "ws" => 3 }.freeze
    ROUND_LABEL_MAP = { "wc" => "Wild Card", "ds" => "Division Series",
                        "cs" => "Champ Series", "ws" => "World Series" }.freeze

    def playoff_series_results(league)
      series = SimulationPlayoffSeries
        .where(simulation_league_id: league.id)
        .where.not(winner_team_id: nil)
        .to_a
        .sort_by { |s| [ROUND_ORDER_IDX[s.round] || 9, s.league, s.series_index] }

      series.map do |s|
        winner_home = s.winner_team_id == s.home_team_id
        winner_abbr = winner_home ? s.home_team_abbr : s.away_team_abbr
        loser_abbr  = winner_home ? s.away_team_abbr : s.home_team_abbr
        winner_wins = winner_home ? s.home_wins : s.away_wins
        loser_wins  = winner_home ? s.away_wins : s.home_wins
        {
          round:       s.round,
          round_label: ROUND_LABEL_MAP[s.round] || s.round.upcase,
          league:      s.league,
          winner:      winner_abbr,
          loser:       loser_abbr,
          wins:        winner_wins,
          losses:      loser_wins,
        }
      end
    end

    def season_complete?(league)
      total = league.simulation_games.count
      return false if total == 0
      league.simulation_games
            .where(simulated_at: nil)
            .where.not(home_team_id: nil)
            .none?
    end

    def can_advance?(franchise)
      current = franchise.current_league
      return false unless current.present? && season_complete?(current)
      playoffs_concluded?(current)
    end

    def playoffs_concluded?(league)
      SimulationPlayoffSeries.where(simulation_league_id: league.id, round: "ws")
                             .where.not(winner_team_id: nil)
                             .exists?
    end

    def playoff_champion(league)
      series = SimulationPlayoffSeries.where(simulation_league_id: league.id, round: "ws")
                                      .where.not(winner_team_id: nil)
                                      .pick(:winner_team_id, :home_team_id, :home_team_abbr, :away_team_abbr)
      return nil unless series
      winner_id, home_id, home_abbr, away_abbr = series
      abbr = winner_id == home_id ? home_abbr : away_abbr
      { team_abbr: abbr, team_id: winner_id }
    rescue
      nil
    end

    # Clone all 30 simulation_rosters from the previous season as-is
    def clone_rosters(from:, to:)
      now = Time.now
      rows = from.simulation_rosters.map do |r|
        {
          simulation_league_id: to.id,
          team_id:              r.team_id,
          team_name:            r.team_name,
          team_abbr:            r.team_abbr,
          team_color:           r.team_color,
          roster_json:          r.roster_json,
          lineup_order_json:    r.lineup_order_json,
          rotation_json:        r.rotation_json,
          bullpen_roles_json:   r.bullpen_roles_json,
          pitcher_state_json:   r.pitcher_state_json,
          created_at:           now,
          updated_at:           now,
        }
      end
      SimulationRoster.insert_all!(rows) if rows.any?
    end

    # Try MLB API schedule; fall back to cloning the previous season's schedule
    # with all dates bumped by one year.
    def import_or_clone_schedule(new_league, prev_league)
      result = SimulationService.import_schedule(new_league)
      return if result[:imported].to_i > 0

      Rails.logger.info("FranchiseService: MLB API schedule unavailable for #{new_league.season}, cloning from #{prev_league.season}")
      clone_schedule(from: prev_league, to: new_league)
    end

    def clone_schedule(from:, to:)
      year_diff = to.season - from.season
      now       = Time.now

      rows = from.simulation_games.map do |g|
        new_date = g.game_date ? g.game_date >> (year_diff * 12) : nil

        {
          simulation_league_id: to.id,
          game_pk:              nil,
          game_date:            new_date,
          home_team_id:         g.home_team_id,
          away_team_id:         g.away_team_id,
          home_team_abbr:       g.home_team_abbr,
          away_team_abbr:       g.away_team_abbr,
          home_team_name:       g.home_team_name,
          away_team_name:       g.away_team_name,
          home_team_color:      g.home_team_color,
          away_team_color:      g.away_team_color,
          home_score:           nil,
          away_score:           nil,
          is_real:              false,
          simulated_at:         nil,
          created_at:           now,
          updated_at:           now,
        }
      end
      SimulationGame.insert_all!(rows) if rows.any?
    end
  end
end
