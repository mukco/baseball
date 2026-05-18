require "csv"
require "fileutils"

module Warehouse
  class SimulationIngester
    class << self
      def ingest!
        FileUtils.mkdir_p(base_dir)
        counts = {
          player_stats:   ingest_player_stats,
          team_standings: ingest_team_standings,
          season_log:     ingest_season_log,
        }
        Rails.logger.info("Warehouse::SimulationIngester: #{counts.inspect}")
        counts
      end

      def player_stats_csv_path  = base_dir.join("sim_player_stats.csv")
      def team_standings_csv_path = base_dir.join("sim_team_standings.csv")
      def season_log_csv_path    = base_dir.join("sim_season_log.csv")

      private

      def base_dir = Rails.root.join("tmp", "warehouse")

      # -----------------------------------------------------------------------
      # sim_player_stats — one row per player per season per league
      # Columns match real batters/pitchers tables where possible for easy JOIN
      # -----------------------------------------------------------------------
      def ingest_player_stats
        rows = SimulationPlayerStat
          .joins("LEFT JOIN simulation_leagues sl ON sl.id = simulation_player_stats.simulation_league_id")
          .select(
            "simulation_player_stats.*",
            "sl.season",
            "sl.name AS league_name",
            "sl.simulation_franchise_id AS franchise_id"
          )
          .order("sl.season, simulation_player_stats.simulation_league_id, simulation_player_stats.player_id")

        CSV.open(player_stats_csv_path, "w") do |csv|
          csv << %w[
            player_id player_name player_type team_id
            league_id league_name season franchise_id
            g ab h hr r rbi bb k doubles triples hbp sf
            avg obp slg ops
            g_pitched gs outs_pitched ip
            h_allowed er bb_allowed k_pitched bf hr_allowed w l sv
            era whip
          ]

          rows.each do |s|
            ab  = s.ab.to_f
            bb  = s.bb.to_f
            h   = s.h.to_f
            hr  = s.hr.to_f
            obp = (ab + bb) > 0 ? ((h + bb) / (ab + bb)).round(3) : nil
            slg = ab > 0 ? ((h + hr) / ab).round(3) : nil
            avg = ab > 0 ? (h / ab).round(3) : nil
            ops = obp && slg ? (obp + slg).round(3) : nil

            op  = s.outs_pitched.to_i
            era = op > 0 ? (s.er.to_f * 27 / op).round(2) : nil
            whip = op > 0 ? ((s.h_allowed + s.bb_allowed).to_f / (op / 3.0)).round(3) : nil
            ip  = "#{op / 3}.#{op % 3}"

            csv << [
              s.player_id, s.player_name, s.player_type, s.team_id,
              s.simulation_league_id, s.league_name, s.season, s.franchise_id,
              s.g, s.ab, s.h, s.hr, s.r, s.rbi, s.bb, s.k,
              s.doubles, s.triples, s.hbp, s.sf,
              avg, obp, slg, ops,
              s.g_pitched, s.gs, op, ip,
              s.h_allowed, s.er, s.bb_allowed, s.k_pitched, s.bf, s.hr_allowed,
              s.w, s.l, s.sv,
              era, whip,
            ]
          end
        end

        rows.size
      end

      # -----------------------------------------------------------------------
      # sim_team_standings — one row per team per season per league
      # standings is { "AL" => { "East" => [team, ...], ... }, "NL" => { ... } }
      # team keys: :team_id, :abbr, :name, :w, :l, :pct, :gb, :rs, :ra, :run_diff
      # -----------------------------------------------------------------------
      def ingest_team_standings
        leagues = SimulationLeague.all.to_a
        rows    = []

        leagues.each do |league|
          standings = SimulationService.compute_standings(league)
          standings.each do |league_name, divisions|
            divisions.each do |division_name, teams|
              teams.each do |team|
                rows << [
                  league.id, league.name, league.season, league.simulation_franchise_id,
                  team[:team_id], team[:abbr], team[:name],
                  "#{league_name} #{division_name}",
                  team[:w], team[:l], team[:pct], team[:gb],
                  team[:rs], team[:ra], team[:run_diff],
                ]
              end
            end
          end
        rescue => e
          Rails.logger.warn("SimulationIngester standings error for league #{league.id}: #{e.message}")
        end

        CSV.open(team_standings_csv_path, "w") do |csv|
          csv << %w[
            league_id league_name season franchise_id
            team_id team_abbr team_name division
            w l pct gb rs ra run_diff
          ]
          rows.each { |r| csv << r }
        end

        rows.size
      end

      # -----------------------------------------------------------------------
      # sim_season_log — one row per league/season (summary)
      # -----------------------------------------------------------------------
      def ingest_season_log
        rows = []

        SimulationLeague.includes(:simulation_franchise).each do |league|
          total  = league.simulation_games.count
          played = league.simulation_games.where.not(simulated_at: nil).count

          ws = SimulationPlayoffSeries
            .where(simulation_league_id: league.id, round: "WS")
            .where.not(winner_team_id: nil)
            .pick(:winner_team_id, :home_team_id, :home_team_abbr, :away_team_abbr)
          champion_abbr = if ws
            winner_id, home_id, home_abbr, away_abbr = ws
            winner_id == home_id ? home_abbr : away_abbr
          end

          rows << [
            league.id, league.name, league.season,
            league.simulation_franchise_id,
            league.simulation_franchise&.name,
            total, played,
            total > 0 ? (played.to_f / total * 100).round(1) : 0,
            total > 0 && played == total ? 1 : 0,
            champion_abbr,
            league.batter_pitcher_blend,
            league.created_at&.strftime("%Y-%m-%d"),
          ]
        rescue => e
          Rails.logger.warn("SimulationIngester season_log error for league #{league.id}: #{e.message}")
        end

        CSV.open(season_log_csv_path, "w") do |csv|
          csv << %w[
            league_id league_name season franchise_id franchise_name
            games_total games_played pct_complete complete
            champion_abbr batter_pitcher_blend created_at
          ]
          rows.each { |r| csv << r }
        end

        rows.size
      end
    end
  end
end
