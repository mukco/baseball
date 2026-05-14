require "time"

module Sandbox
  class DatasetRegistry
    DATASET_ID = "players".freeze

    class << self
      def datasets
        ensure_fresh!
        info = dataset_info

        [{
          id: DATASET_ID,
          label: "Players (Multi-season)",
          table: "players",
          description: "Season-level batting stats with position/team across multiple seasons.",
          columns: players_columns,
          seasons: info[:seasons],
          lastRefreshedAt: info[:last_refreshed_at],
          stale: stale?(info[:last_refreshed_at]),
          rowCount: info[:row_count],
          defaultSql: <<~SQL.strip
            SELECT season, name, league, team, position, pa, hr, rbi, sb, avg, obp, slg, ops, wrc_plus, war
            FROM players
            WHERE league = 'NL' AND position = '3B' AND pa >= 300
            ORDER BY season DESC, wrc_plus DESC, war DESC
            LIMIT 50
          SQL
        }]
      end

      def tables_for_query
        ensure_fresh!
        [{ name: "players", path: Sandbox::PlayersDatasetBuilder.csv_path.to_s }]
      end

      def ensure_fresh!
        Sandbox::PlayersDatasetBuilder.refresh_if_needed!
      end

      private

      def dataset_info
        Sandbox::PlayersDatasetBuilder.metadata
      end

      def stale?(timestamp)
        return true if timestamp.blank?
        Time.parse(timestamp) < 6.hours.ago
      rescue ArgumentError
        true
      end

      def players_columns
        [
          { name: "player_id", type: "integer", description: "MLB player identifier (MLBAM)." },
          { name: "name", type: "text", description: "Player full name." },
          { name: "team", type: "text", description: "Team abbreviation for that season context." },
          { name: "league", type: "text", description: "League abbreviation (AL/NL)." },
          { name: "position", type: "text", description: "Primary position abbreviation (e.g., 2B, RF, SP)." },
          { name: "season", type: "integer", description: "MLB regular season year." },
          { name: "g", type: "integer", description: "Games played." },
          { name: "pa", type: "integer", description: "Plate appearances." },
          { name: "ab", type: "integer", description: "At-bats." },
          { name: "h", type: "integer", description: "Hits." },
          { name: "hr", type: "integer", description: "Home runs." },
          { name: "rbi", type: "integer", description: "Runs batted in." },
          { name: "sb", type: "integer", description: "Stolen bases." },
          { name: "bb", type: "integer", description: "Walks (base on balls)." },
          { name: "k", type: "integer", description: "Strikeouts." },
          { name: "avg", type: "double", description: "Batting average." },
          { name: "obp", type: "double", description: "On-base percentage." },
          { name: "slg", type: "double", description: "Slugging percentage." },
          { name: "ops", type: "double", description: "On-base plus slugging." }
        ]
      end
    end
  end
end
