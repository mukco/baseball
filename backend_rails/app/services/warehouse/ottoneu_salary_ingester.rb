require "csv"
require "fileutils"

module Warehouse
  class OttoneuSalaryIngester
    COLUMNS = %w[
      season ottoneu_league_id ottoneu_team_id team_name
      ottoneu_id fg_id fg_minor_id player_name mlb_team positions salary
    ].freeze

    class << self
      def ingest!
        FileUtils.mkdir_p(base_dir)

        all_rosters = OttoneuService.all_rosters
        if all_rosters.is_a?(Hash) && all_rosters[:error]
          Rails.logger.warn("Warehouse::OttoneuSalaryIngester: #{all_rosters[:error]}")
          write_csv([])
          return 0
        end

        season = Date.today.year
        league_id = ENV.fetch("OTTONEU_LEAGUE_ID", "845").to_i

        rows = Array(all_rosters).flat_map do |team|
          Array(team[:players]).map do |player|
            {
              "season"            => season,
              "ottoneu_league_id" => league_id,
              "ottoneu_team_id"   => team[:team_id].to_i,
              "team_name"         => team[:team_name].to_s,
              "ottoneu_id"        => player[:ottoneu_id].to_s,
              "fg_id"             => player[:fg_id].to_s,
              "fg_minor_id"       => player[:fg_minor_id].to_s,
              "player_name"       => player[:name].to_s,
              "mlb_team"          => player[:mlb_team].to_s,
              "positions"         => player[:positions].to_s,
              "salary"            => player[:salary].to_i
            }
          end
        end

        write_csv(rows)
        Rails.logger.info("Warehouse::OttoneuSalaryIngester: wrote #{rows.size} rows")
        rows.size
      rescue => e
        Rails.logger.error("Warehouse::OttoneuSalaryIngester: #{e.message}")
        0
      end

      def csv_path
        base_dir.join("ottoneu_salaries.csv")
      end

      private

      def base_dir
        Rails.root.join("tmp", "warehouse")
      end

      def write_csv(rows)
        CSV.open(csv_path, "w", headers: COLUMNS, write_headers: true) do |csv|
          rows.each { |r| csv << COLUMNS.map { |c| r[c] } }
        end
      end
    end
  end
end
