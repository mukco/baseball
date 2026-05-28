require "time"

module Sandbox
  class DatasetRegistry
    class << self
      def datasets
        meta = Warehouse::Manager.metadata

        [
          batters_dataset(meta),
          pitchers_dataset(meta),
          fg_projections_batting_dataset(meta),
          fg_projections_pitching_dataset(meta),
          teams_batting_dataset(meta),
          teams_pitching_dataset(meta),
          sim_player_stats_dataset(meta),
          sim_team_standings_dataset(meta),
          sim_season_log_dataset(meta),
        ]
      end

      def tables_for_query
        # Used as a fallback when the DuckDB warehouse file is not yet built
        [
          { name: "batters",                 path: Warehouse::BatterIngester.csv_path.to_s },
          { name: "pitchers",                path: Warehouse::PitcherIngester.csv_path.to_s },
          { name: "fg_projections_batting",  path: Warehouse::FgProjectionIngester.batting_csv_path.to_s },
          { name: "fg_projections_pitching", path: Warehouse::FgProjectionIngester.pitching_csv_path.to_s },
          { name: "teams_batting",           path: Warehouse::TeamIngester.batting_csv_path.to_s },
          { name: "teams_pitching",          path: Warehouse::TeamIngester.pitching_csv_path.to_s },
          { name: "sim_player_stats",   path: Warehouse::SimulationIngester.player_stats_csv_path.to_s },
          { name: "sim_team_standings", path: Warehouse::SimulationIngester.team_standings_csv_path.to_s },
          { name: "sim_season_log",     path: Warehouse::SimulationIngester.season_log_csv_path.to_s },
        ].select { |t| File.exist?(t[:path]) }
      end

      private

      def stale?(meta)
        return true if meta.blank? || meta[:last_refreshed_at].blank?
        return true if Time.parse(meta[:last_refreshed_at].to_s) < 6.hours.ago
        # If ingester column lists changed since the last build, the schema is stale.
        stored = meta[:schema_fingerprint]
        stored.present? && stored != Warehouse::Manager.schema_fingerprint
      rescue ArgumentError
        true
      end

      def batters_dataset(meta)
        {
          id:              "batters",
          label:           "Batters (2010–present)",
          table:           "batters",
          description:     "Season-level batting stats from FanGraphs for all qualified hitters, 2010 through the current season.",
          columns:         batter_columns,
          seasons:         (2010..Date.today.year).to_a,
          lastRefreshedAt: meta[:last_refreshed_at],
          stale:           stale?(meta),
          rowCount:        meta[:batter_rows],
          defaultSql:      <<~SQL.strip
            SELECT season, name, team, position, pa, hr, rbi, sb,
                   avg, obp, slg, ops, wrc_plus, war, woba, k_pct, bb_pct
            FROM batters
            WHERE season = #{Date.today.year - 1} AND pa >= 300
            ORDER BY war DESC
            LIMIT 50
          SQL
        }
      end

      def pitchers_dataset(meta)
        {
          id:              "pitchers",
          label:           "Pitchers (2010–present)",
          table:           "pitchers",
          description:     "Season-level pitching stats from FanGraphs for all pitchers, 2010 through the current season.",
          columns:         pitcher_columns,
          seasons:         (2010..Date.today.year).to_a,
          lastRefreshedAt: meta[:last_refreshed_at],
          stale:           stale?(meta),
          rowCount:        meta[:pitcher_rows],
          defaultSql:      <<~SQL.strip
            SELECT season, name, team, gs, ip, era, fip, xfip,
                   war, k_pct, bb_pct, k_minus_bb_pct, gb_pct
            FROM pitchers
            WHERE season = #{Date.today.year - 1} AND ip >= 100
            ORDER BY war DESC
            LIMIT 50
          SQL
        }
      end

      def fg_projections_batting_dataset(meta)
        {
          id:              "fg_projections_batting",
          label:           "FG Batting Projections (#{Date.today.year})",
          table:           "fg_projections_batting",
          description:     "Steamer batting projections from FanGraphs for the current season.",
          columns:         fg_proj_batter_columns,
          seasons:         [Date.today.year],
          lastRefreshedAt: meta[:last_refreshed_at],
          stale:           stale?(meta),
          rowCount:        meta[:fg_proj_batting],
          defaultSql:      <<~SQL.strip
            SELECT name, team, pa, hr, rbi, sb,
                   avg, obp, slg, ops, wrc_plus, war, woba, k_pct, bb_pct
            FROM fg_projections_batting
            ORDER BY war DESC
            LIMIT 50
          SQL
        }
      end

      def fg_projections_pitching_dataset(meta)
        {
          id:              "fg_projections_pitching",
          label:           "FG Pitching Projections (#{Date.today.year})",
          table:           "fg_projections_pitching",
          description:     "Steamer pitching projections from FanGraphs for the current season.",
          columns:         fg_proj_pitcher_columns,
          seasons:         [Date.today.year],
          lastRefreshedAt: meta[:last_refreshed_at],
          stale:           stale?(meta),
          rowCount:        meta[:fg_proj_pitching],
          defaultSql:      <<~SQL.strip
            SELECT name, team, gs, ip, era, fip, xfip,
                   war, k_pct, bb_pct, k_minus_bb_pct, gb_pct
            FROM fg_projections_pitching
            ORDER BY war DESC
            LIMIT 50
          SQL
        }
      end

      def teams_batting_dataset(meta)
        {
          id:              "teams_batting",
          label:           "Team Batting (2010–present)",
          table:           "teams_batting",
          description:     "Season-level team batting stats from the MLB Stats API for all 30 franchises, 2010 through the current season.",
          columns:         teams_batting_columns,
          seasons:         (2010..Date.today.year).to_a,
          lastRefreshedAt: meta[:last_refreshed_at],
          stale:           stale?(meta),
          rowCount:        meta[:team_batting_rows],
          defaultSql:      <<~SQL.strip
            SELECT season, name, abbr, league, division,
                   avg, obp, slg, ops, hr, r, rbi, sb, woba, k_pct, bb_pct
            FROM teams_batting
            WHERE season = #{Date.today.year - 1}
            ORDER BY ops DESC
          SQL
        }
      end

      def teams_pitching_dataset(meta)
        {
          id:              "teams_pitching",
          label:           "Team Pitching (2010–present)",
          table:           "teams_pitching",
          description:     "Season-level team pitching stats from the MLB Stats API for all 30 franchises, 2010 through the current season.",
          columns:         teams_pitching_columns,
          seasons:         (2010..Date.today.year).to_a,
          lastRefreshedAt: meta[:last_refreshed_at],
          stale:           stale?(meta),
          rowCount:        meta[:team_pitching_rows],
          defaultSql:      <<~SQL.strip
            SELECT season, name, abbr, league, division,
                   era, whip, fip, so, bb, hr, k_per_9, bb_per_9, k_minus_bb_pct
            FROM teams_pitching
            WHERE season = #{Date.today.year - 1}
            ORDER BY era ASC
          SQL
        }
      end

      # ------------------------------------------------------------------ #
      # Column definitions (name + type + description shown in UI glossary)
      # ------------------------------------------------------------------ #

      def batter_columns
        [
          { name: "player_id",   type: "integer", description: "MLB (MLBAM) player identifier." },
          { name: "fg_id",       type: "text",    description: "FanGraphs player identifier." },
          { name: "name",        type: "text",    description: "Player full name." },
          { name: "team",        type: "text",    description: "Team abbreviation." },
          { name: "league",      type: "text",    description: "League (AL or NL)." },
          { name: "position",    type: "text",    description: "Primary position abbreviation (e.g. 2B, RF, DH)." },
          { name: "season",      type: "integer", description: "MLB regular season year." },
          { name: "g",           type: "integer", description: "Games played." },
          { name: "pa",          type: "integer", description: "Plate appearances — total trips to the plate." },
          { name: "ab",          type: "integer", description: "At-bats — plate appearances excluding walks, HBP, sac flies." },
          { name: "h",           type: "integer", description: "Hits." },
          { name: "hr",          type: "integer", description: "Home runs." },
          { name: "r",           type: "integer", description: "Runs scored." },
          { name: "rbi",         type: "integer", description: "Runs batted in." },
          { name: "sb",          type: "integer", description: "Stolen bases." },
          { name: "bb",          type: "integer", description: "Walks (base on balls)." },
          { name: "k",           type: "integer", description: "Strikeouts." },
          { name: "avg",         type: "double",  description: "Batting average — hits per at-bat. .300 = 3 hits per 10 ABs." },
          { name: "obp",         type: "double",  description: "On-base percentage — how often a batter reaches base. .370 is excellent." },
          { name: "slg",         type: "double",  description: "Slugging percentage — total bases per at-bat. Rewards extra-base hits." },
          { name: "ops",         type: "double",  description: "OBP + SLG — a quick all-in-one offensive rating. .800+ is good, .900+ elite." },
          { name: "iso",         type: "double",  description: "Isolated power (SLG - AVG) — measures raw extra-base power. .200+ is elite." },
          { name: "wrc_plus",    type: "integer", description: "Weighted Runs Created Plus — park- and league-adjusted offense. 100 = average, 120 = 20% above average." },
          { name: "war",         type: "double",  description: "Wins Above Replacement — total value vs. a replacement player. 2 = solid starter, 5 = All-Star, 8 = MVP." },
          { name: "woba",        type: "double",  description: "Weighted On-Base Average — values each offensive event by its run contribution. ~.320 is average." },
          { name: "babip",       type: "double",  description: "Batting Average on Balls in Play — hit rate on non-HR batted balls. Extremes often regress." },
          { name: "k_pct",       type: "double",  description: "Strikeout rate (%) — share of PAs ending in a strikeout. Lower is better for hitters." },
          { name: "bb_pct",      type: "double",  description: "Walk rate (%) — share of PAs ending in a walk. Higher is better for hitters." },
          { name: "ld_pct",      type: "double",  description: "Line-drive rate (%) — share of batted balls that are line drives. Correlates with BABIP." },
          { name: "gb_pct",      type: "double",  description: "Ground-ball rate (%) — share of batted balls on the ground." },
          { name: "fb_pct",      type: "double",  description: "Fly-ball rate (%) — share of batted balls in the air. Higher FB% amplifies HR potential." },
          { name: "hr_fb_pct",   type: "double",  description: "HR/FB rate (%) — share of fly balls that become home runs. Captures power efficiency." },
          { name: "o_swing_pct", type: "double",  description: "O-Swing% (chase rate) — share of pitches outside the strike zone that the batter swings at. ~30% is average; lower is better." },
          { name: "z_swing_pct", type: "double",  description: "Z-Swing% (zone swing rate) — share of pitches inside the strike zone that the batter swings at. ~68% is average; higher is better." },
          { name: "bat_speed",            type: "double",  description: "Average bat speed (mph) at contact — Savant tracking, available 2024+. ~71 mph is average; 74+ is elite." },
          { name: "swing_length",         type: "double",  description: "Average swing path length (ft) — Savant tracking, available 2024+. ~7.8 ft is average; shorter is better (under 7.4 ft is elite)." },
          { name: "hard_swing_rate",      type: "double",  description: "Hard swing rate (%) — share of swings classified as maximum-effort by Savant tracking, available 2024+. Higher is better; ~65% is average." },
          { name: "squared_up_per_swing", type: "double",  description: "Squared-up rate per swing (%) — share of swings making well-centered sweet-spot contact, Savant tracking, available 2024+. Higher is better." },
          { name: "blast_per_swing",      type: "double",  description: "Blast rate per swing (%) — share of swings that are both hard AND squared up; the premier bat-tracking quality metric, available 2024+. Higher is better." }
        ]
      end

      def pitcher_columns
        [
          { name: "player_id",      type: "integer", description: "MLB (MLBAM) player identifier." },
          { name: "fg_id",          type: "text",    description: "FanGraphs player identifier." },
          { name: "name",           type: "text",    description: "Player full name." },
          { name: "team",           type: "text",    description: "Team abbreviation." },
          { name: "league",         type: "text",    description: "League (AL or NL)." },
          { name: "season",         type: "integer", description: "MLB regular season year." },
          { name: "g",              type: "integer", description: "Games appeared in." },
          { name: "gs",             type: "integer", description: "Games started — 32+ is a full season for a starter." },
          { name: "w",              type: "integer", description: "Wins — context-heavy; team support strongly affects this." },
          { name: "l",              type: "integer", description: "Losses — context-heavy; lower is better but not fully in pitcher control." },
          { name: "sv",             type: "integer", description: "Saves — closer role stat." },
          { name: "ip",             type: "double",  description: "Innings pitched — 200 IP is a full season for a starter." },
          { name: "tbf",            type: "integer", description: "Total batters faced — pitcher equivalent of plate appearances." },
          { name: "h",              type: "integer", description: "Hits allowed." },
          { name: "er",             type: "integer", description: "Earned runs allowed." },
          { name: "hr",             type: "integer", description: "Home runs allowed." },
          { name: "bb",             type: "integer", description: "Walks issued." },
          { name: "k",              type: "integer", description: "Strikeouts recorded." },
          { name: "era",            type: "double",  description: "Earned Run Average — earned runs per 9 innings. 3.00 ERA means 3 runs over a full game." },
          { name: "fip",            type: "double",  description: "Fielding Independent Pitching — ERA-scale metric based only on K, BB, HBP, and HR. Removes defense noise." },
          { name: "xfip",           type: "double",  description: "Expected FIP — normalises home run luck by using expected HR rate from fly-ball profile." },
          { name: "siera",          type: "double",  description: "Skill-Interactive ERA — park-adjusted ERA estimator that accounts for Ks, walks, and batted-ball mix. More predictive than FIP." },
          { name: "war",            type: "double",  description: "Wins Above Replacement — total pitching value vs. a replacement-level pitcher. 2 = solid, 5 = ace." },
          { name: "whip",           type: "double",  description: "Walks + Hits per Inning Pitched — baserunners allowed per inning. 1.00 is elite." },
          { name: "k_per_9",        type: "double",  description: "Strikeouts per 9 innings — 10 K/9 means 10 Ks over a complete game." },
          { name: "bb_per_9",       type: "double",  description: "Walks per 9 innings — lower is better; 2 BB/9 is excellent control." },
          { name: "k_pct",          type: "double",  description: "Strikeout rate (%) — share of batters faced who strike out. Higher is better for pitchers." },
          { name: "bb_pct",         type: "double",  description: "Walk rate (%) — share of batters faced who walk. Lower is better for pitchers." },
          { name: "k_minus_bb_pct", type: "double",  description: "K-BB% — net dominance: strikeout rate minus walk rate. 15%+ is elite." },
          { name: "babip",          type: "double",  description: "BABIP allowed — hit rate on balls in play. Pitcher BABIP is partly luck; .300 is roughly average." },
          { name: "gb_pct",         type: "double",  description: "Ground-ball rate (%) — share of batted balls on the ground. Higher GB% can limit extra-base damage." },
          { name: "ld_pct",         type: "double",  description: "Line-drive rate (%) allowed — higher LD% correlates with higher BABIP against." },
          { name: "fb_pct",         type: "double",  description: "Fly-ball rate (%) allowed — high FB% increases HR exposure." }
        ]
      end

      def fg_proj_batter_columns
        [
          { name: "player_id",         type: "integer", description: "MLB (MLBAM) player identifier." },
          { name: "fg_id",             type: "text",    description: "FanGraphs player identifier." },
          { name: "name",              type: "text",    description: "Player full name." },
          { name: "team",              type: "text",    description: "Projected team abbreviation." },
          { name: "season",            type: "integer", description: "Projected season year." },
          { name: "projection_system", type: "text",    description: "Projection system used (steamer)." },
          { name: "g",                 type: "integer", description: "Projected games played." },
          { name: "pa",                type: "integer", description: "Projected plate appearances." },
          { name: "hr",                type: "integer", description: "Projected home runs." },
          { name: "r",                 type: "integer", description: "Projected runs scored." },
          { name: "rbi",               type: "integer", description: "Projected runs batted in." },
          { name: "sb",                type: "integer", description: "Projected stolen bases." },
          { name: "bb",                type: "integer", description: "Projected walks." },
          { name: "k",                 type: "integer", description: "Projected strikeouts." },
          { name: "avg",               type: "double",  description: "Projected batting average." },
          { name: "obp",               type: "double",  description: "Projected on-base percentage." },
          { name: "slg",               type: "double",  description: "Projected slugging percentage." },
          { name: "ops",               type: "double",  description: "Projected OPS (OBP + SLG)." },
          { name: "iso",               type: "double",  description: "Projected isolated power (SLG - AVG)." },
          { name: "wrc_plus",          type: "integer", description: "Projected wRC+ — park- and league-adjusted offense. 100 = average." },
          { name: "war",               type: "double",  description: "Projected WAR — total value vs. replacement. 2 = solid, 5 = star." },
          { name: "woba",              type: "double",  description: "Projected wOBA — run-value weighted on-base metric." },
          { name: "babip",             type: "double",  description: "Projected BABIP — hit rate on balls in play." },
          { name: "k_pct",             type: "double",  description: "Projected strikeout rate (%)." },
          { name: "bb_pct",            type: "double",  description: "Projected walk rate (%)." }
        ]
      end

      def fg_proj_pitcher_columns
        [
          { name: "player_id",         type: "integer", description: "MLB (MLBAM) player identifier." },
          { name: "fg_id",             type: "text",    description: "FanGraphs player identifier." },
          { name: "name",              type: "text",    description: "Player full name." },
          { name: "team",              type: "text",    description: "Projected team abbreviation." },
          { name: "season",            type: "integer", description: "Projected season year." },
          { name: "projection_system", type: "text",    description: "Projection system used (steamer)." },
          { name: "g",                 type: "integer", description: "Projected games." },
          { name: "gs",                type: "integer", description: "Projected games started." },
          { name: "w",                 type: "integer", description: "Projected wins." },
          { name: "l",                 type: "integer", description: "Projected losses." },
          { name: "sv",                type: "integer", description: "Projected saves." },
          { name: "ip",                type: "double",  description: "Projected innings pitched." },
          { name: "tbf",               type: "integer", description: "Projected total batters faced." },
          { name: "k",                 type: "integer", description: "Projected strikeouts." },
          { name: "bb",                type: "integer", description: "Projected walks." },
          { name: "hr",                type: "integer", description: "Projected HR allowed." },
          { name: "era",               type: "double",  description: "Projected ERA — earned runs per 9 innings." },
          { name: "fip",               type: "double",  description: "Projected FIP — fielding-independent ERA estimate." },
          { name: "xfip",              type: "double",  description: "Projected xFIP — FIP with normalised HR rate." },
          { name: "siera",             type: "double",  description: "Projected SIERA — skill-interactive ERA; most predictive ERA estimator." },
          { name: "war",               type: "double",  description: "Projected WAR — total pitching value vs. replacement." },
          { name: "whip",              type: "double",  description: "Projected WHIP — baserunners allowed per inning." },
          { name: "k_per_9",           type: "double",  description: "Projected K/9 — strikeouts per 9 innings." },
          { name: "bb_per_9",          type: "double",  description: "Projected BB/9 — walks per 9 innings." },
          { name: "k_pct",             type: "double",  description: "Projected strikeout rate (%)." },
          { name: "bb_pct",            type: "double",  description: "Projected walk rate (%)." },
          { name: "k_minus_bb_pct",    type: "double",  description: "Projected K-BB% — net dominance rate." },
          { name: "babip",             type: "double",  description: "Projected BABIP allowed." },
          { name: "gb_pct",            type: "double",  description: "Projected ground-ball rate (%)." }
        ]
      end

      def teams_batting_columns
        [
          { name: "team_id",  type: "integer", description: "MLB (MLBAM) team identifier." },
          { name: "name",     type: "text",    description: "Full team name (e.g. New York Yankees)." },
          { name: "abbr",     type: "text",    description: "Team abbreviation (e.g. NYY)." },
          { name: "league",   type: "text",    description: "League (AL or NL)." },
          { name: "division", type: "text",    description: "Division name (e.g. AL East)." },
          { name: "season",   type: "integer", description: "MLB regular season year." },
          { name: "g",        type: "integer", description: "Games played." },
          { name: "ab",       type: "integer", description: "At-bats." },
          { name: "h",        type: "integer", description: "Hits." },
          { name: "hr",       type: "integer", description: "Home runs." },
          { name: "r",        type: "integer", description: "Runs scored." },
          { name: "rbi",      type: "integer", description: "Runs batted in." },
          { name: "sb",       type: "integer", description: "Stolen bases." },
          { name: "bb",       type: "integer", description: "Walks (base on balls)." },
          { name: "so",       type: "integer", description: "Strikeouts." },
          { name: "avg",      type: "double",  description: "Batting average — hits per at-bat." },
          { name: "obp",      type: "double",  description: "On-base percentage — how often the team reaches base." },
          { name: "slg",      type: "double",  description: "Slugging percentage — total bases per at-bat." },
          { name: "ops",      type: "double",  description: "OBP + SLG — combined offensive rate." },
          { name: "iso",      type: "double",  description: "Isolated power (SLG - AVG) — raw extra-base power." },
          { name: "babip",    type: "double",  description: "Batting Average on Balls in Play — team hit rate on non-HR batted balls." },
          { name: "k_pct",    type: "double",  description: "Team strikeout rate (%) — share of PAs ending in a K." },
          { name: "bb_pct",   type: "double",  description: "Team walk rate (%) — share of PAs ending in a walk." },
          { name: "woba",     type: "double",  description: "Weighted On-Base Average — values each offensive event by run contribution. ~.320 is league average." }
        ]
      end

      def teams_pitching_columns
        [
          { name: "team_id",          type: "integer", description: "MLB (MLBAM) team identifier." },
          { name: "name",             type: "text",    description: "Full team name." },
          { name: "abbr",             type: "text",    description: "Team abbreviation." },
          { name: "league",           type: "text",    description: "League (AL or NL)." },
          { name: "division",         type: "text",    description: "Division name." },
          { name: "season",           type: "integer", description: "MLB regular season year." },
          { name: "era",              type: "double",  description: "Earned Run Average — earned runs allowed per 9 innings." },
          { name: "whip",             type: "double",  description: "Walks + Hits per Inning Pitched — baserunners allowed per inning." },
          { name: "so",               type: "integer", description: "Strikeouts recorded by the pitching staff." },
          { name: "bb",               type: "integer", description: "Walks issued by the pitching staff." },
          { name: "hr",               type: "integer", description: "Home runs allowed." },
          { name: "h",                type: "integer", description: "Hits allowed." },
          { name: "ip",               type: "double",  description: "Innings pitched — total for the full staff." },
          { name: "sv",               type: "integer", description: "Saves recorded by the bullpen." },
          { name: "fip",              type: "double",  description: "Fielding Independent Pitching — ERA-scale metric based on K, BB, HBP, and HR. Removes defense noise." },
          { name: "k_per_9",          type: "double",  description: "Strikeouts per 9 innings — higher is better." },
          { name: "bb_per_9",         type: "double",  description: "Walks per 9 innings — lower is better." },
          { name: "k_minus_bb_pct",   type: "double",  description: "K-BB% — team strikeout rate minus walk rate. Higher is better." }
        ]
      end

      # ------------------------------------------------------------------ #
      # Simulation datasets
      # ------------------------------------------------------------------ #

      def sim_player_stats_dataset(meta)
        {
          id:              "sim_player_stats",
          label:           "Sim Player Stats",
          table:           "sim_player_stats",
          description:     "Simulated season stats for every player across all simulation leagues. One row per player per league season.",
          columns:         sim_player_stats_columns,
          lastRefreshedAt: meta[:last_refreshed_at],
          stale:           stale?(meta),
          rowCount:        meta[:sim_player_stat_rows],
          defaultSql:      <<~SQL.strip
            SELECT player_name, player_type, team_id, league_name, season,
                   g, ab, h, hr, rbi, avg, obp, slg, ops
            FROM sim_player_stats
            WHERE player_type = 'batter' AND ab >= 200
            ORDER BY ops DESC
            LIMIT 50
          SQL
        }
      end

      def sim_team_standings_dataset(meta)
        {
          id:              "sim_team_standings",
          label:           "Sim Team Standings",
          table:           "sim_team_standings",
          description:     "Simulated final standings for every team across all simulation leagues. One row per team per league season.",
          columns:         sim_team_standings_columns,
          lastRefreshedAt: meta[:last_refreshed_at],
          stale:           stale?(meta),
          rowCount:        meta[:sim_standing_rows],
          defaultSql:      <<~SQL.strip
            SELECT league_name, season, division, team_abbr, team_name,
                   w, l, pct, gb, rs, ra, run_diff
            FROM sim_team_standings
            ORDER BY league_id, division, pct DESC
            LIMIT 60
          SQL
        }
      end

      def sim_season_log_dataset(meta)
        {
          id:              "sim_season_log",
          label:           "Sim Season Log",
          table:           "sim_season_log",
          description:     "One summary row per simulation league season — completion status, champion, and configuration.",
          columns:         sim_season_log_columns,
          lastRefreshedAt: meta[:last_refreshed_at],
          stale:           stale?(meta),
          rowCount:        meta[:sim_season_rows],
          defaultSql:      <<~SQL.strip
            SELECT franchise_name, season, games_total, games_played,
                   pct_complete, complete, champion_abbr, batter_pitcher_blend
            FROM sim_season_log
            ORDER BY franchise_name, season
          SQL
        }
      end

      def sim_player_stats_columns
        [
          { name: "player_id",    type: "integer", description: "Sim player identifier (MLB MLBAM ID where available)." },
          { name: "player_name",  type: "text",    description: "Player full name." },
          { name: "player_type",  type: "text",    description: "Role: 'batter' or 'pitcher'." },
          { name: "team_id",      type: "integer", description: "Sim team identifier (MLB MLBAM team ID)." },
          { name: "league_id",    type: "integer", description: "Simulation league (season) ID." },
          { name: "league_name",  type: "text",    description: "Simulation league name." },
          { name: "season",       type: "integer", description: "Simulated season year." },
          { name: "franchise_id", type: "integer", description: "Parent franchise ID (NULL for standalone leagues)." },
          # Batting
          { name: "g",            type: "integer", description: "Games played as batter." },
          { name: "ab",           type: "integer", description: "At-bats." },
          { name: "h",            type: "integer", description: "Hits." },
          { name: "hr",           type: "integer", description: "Home runs." },
          { name: "r",            type: "integer", description: "Runs scored." },
          { name: "rbi",          type: "integer", description: "Runs batted in." },
          { name: "bb",           type: "integer", description: "Walks." },
          { name: "k",            type: "integer", description: "Strikeouts." },
          { name: "doubles",      type: "integer", description: "Doubles." },
          { name: "triples",      type: "integer", description: "Triples." },
          { name: "hbp",          type: "integer", description: "Hit by pitch." },
          { name: "sf",           type: "integer", description: "Sacrifice flies." },
          { name: "avg",          type: "double",  description: "Batting average (H / AB)." },
          { name: "obp",          type: "double",  description: "On-base percentage ((H + BB) / (AB + BB))." },
          { name: "slg",          type: "double",  description: "Slugging percentage (total bases / AB)." },
          { name: "ops",          type: "double",  description: "OBP + SLG." },
          # Pitching
          { name: "g_pitched",    type: "integer", description: "Games appeared in as pitcher." },
          { name: "gs",           type: "integer", description: "Games started." },
          { name: "outs_pitched", type: "integer", description: "Total outs recorded." },
          { name: "ip",           type: "text",    description: "Innings pitched in X.Y format." },
          { name: "h_allowed",    type: "integer", description: "Hits allowed." },
          { name: "er",           type: "integer", description: "Earned runs allowed." },
          { name: "bb_allowed",   type: "integer", description: "Walks issued." },
          { name: "k_pitched",    type: "integer", description: "Strikeouts recorded." },
          { name: "bf",           type: "integer", description: "Batters faced." },
          { name: "hr_allowed",   type: "integer", description: "Home runs allowed." },
          { name: "w",            type: "integer", description: "Pitcher wins." },
          { name: "l",            type: "integer", description: "Pitcher losses." },
          { name: "sv",           type: "integer", description: "Saves." },
          { name: "era",          type: "double",  description: "Earned Run Average (ER * 27 / outs_pitched)." },
          { name: "whip",         type: "double",  description: "Walks + Hits per Inning Pitched." },
        ]
      end

      def sim_team_standings_columns
        [
          { name: "league_id",    type: "integer", description: "Simulation league ID." },
          { name: "league_name",  type: "text",    description: "Simulation league name." },
          { name: "season",       type: "integer", description: "Simulated season year." },
          { name: "franchise_id", type: "integer", description: "Parent franchise ID (NULL for standalone leagues)." },
          { name: "team_id",      type: "integer", description: "MLB MLBAM team identifier." },
          { name: "team_abbr",    type: "text",    description: "Team abbreviation (e.g. NYY)." },
          { name: "team_name",    type: "text",    description: "Full team name." },
          { name: "division",     type: "text",    description: "Division label (e.g. 'AL East')." },
          { name: "w",            type: "integer", description: "Wins." },
          { name: "l",            type: "integer", description: "Losses." },
          { name: "pct",          type: "double",  description: "Win percentage (W / (W + L))." },
          { name: "gb",           type: "double",  description: "Games behind division leader." },
          { name: "rs",           type: "integer", description: "Runs scored." },
          { name: "ra",           type: "integer", description: "Runs allowed." },
          { name: "run_diff",     type: "integer", description: "Run differential (RS - RA)." },
        ]
      end

      def sim_season_log_columns
        [
          { name: "league_id",           type: "integer", description: "Simulation league ID." },
          { name: "league_name",         type: "text",    description: "Simulation league name." },
          { name: "season",              type: "integer", description: "Simulated season year." },
          { name: "franchise_id",        type: "integer", description: "Parent franchise ID (NULL for standalone leagues)." },
          { name: "franchise_name",      type: "text",    description: "Franchise name." },
          { name: "games_total",         type: "integer", description: "Total games scheduled in the league." },
          { name: "games_played",        type: "integer", description: "Games simulated so far." },
          { name: "pct_complete",        type: "double",  description: "Season completion percentage (0–100)." },
          { name: "complete",            type: "integer", description: "1 if all games have been simulated, 0 otherwise." },
          { name: "champion_abbr",       type: "text",    description: "World Series champion team abbreviation (NULL if playoffs not complete)." },
          { name: "batter_pitcher_blend", type: "double", description: "Projection blend used (0 = all pitcher-based, 1 = all batter-based)." },
          { name: "created_at",          type: "text",    description: "Date the league was created (YYYY-MM-DD)." },
        ]
      end
    end
  end
end
