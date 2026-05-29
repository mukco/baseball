require "csv"
require "json"
require "fileutils"

module Warehouse
  class MiLBIngester
    COLUMNS = %w[
      fg_minor_id name mlb_team level season group
      ab h doubles hr bb sb cs avg obp slg ops
      ip k sv era fip whip
    ].freeze

    class << self
      def ingest!
        FileUtils.mkdir_p(base_dir)

        target_ids = rostered_minor_ids
        if target_ids.empty?
          write_csv([])
          Rails.logger.info("Warehouse::MiLBIngester: no rostered minor leaguers, wrote 0 rows")
          return 0
        end

        season   = Date.today.year
        bat_rows = fetch_fg_minor(season, "bat", target_ids)
        pit_rows = fetch_fg_minor(season, "pit", target_ids)
        all_rows = bat_rows + pit_rows

        write_csv(all_rows)
        Rails.logger.info("Warehouse::MiLBIngester: wrote #{all_rows.size} rows for #{target_ids.size} rostered prospects")
        all_rows.size
      rescue => e
        Rails.logger.error("Warehouse::MiLBIngester: #{e.message}")
        write_csv([])
        0
      end

      def csv_path
        base_dir.join("minor_leaguers.csv")
      end

      private

      def base_dir
        Rails.root.join("tmp", "warehouse")
      end

      # Collect fg_minor_ids for rostered players who have no fg_id (true minor leaguers).
      def rostered_minor_ids
        rosters = OttoneuService.all_rosters
        return [] if rosters.is_a?(Hash) && rosters[:error]

        Array(rosters).flat_map do |team|
          Array(team[:players]).filter_map do |p|
            p[:fg_minor_id].presence if p[:fg_id].blank? && p[:fg_minor_id].present?
          end
        end.uniq
      end

      def fetch_fg_minor(season, stats_type, target_ids)
        target_set = target_ids.to_set
        conn       = fg_conn
        group      = stats_type == "bat" ? "batter" : "pitcher"

        resp = conn.get("https://www.fangraphs.com/api/leaders/minor-league/data", {
          pos: stats_type == "bat" ? "all" : "all",
          stats: stats_type,
          lg: "all",
          qual: 0,
          type: 0,
          season: season,
          season1: season,
          ind: 0,
          pageitems: 3000,
          pagenum: 1
        })

        json = JSON.parse(resp.body)
        rows = json["data"] || (json.is_a?(Array) ? json : [])
        rows = rows.select { |r| r.is_a?(Hash) }

        rows.filter_map do |r|
          pid = r["playerid"].to_s.strip
          next unless target_set.include?(pid)

          if stats_type == "bat"
            build_batter_row(r, pid, season, group)
          else
            build_pitcher_row(r, pid, season, group)
          end
        end
      rescue => e
        Rails.logger.warn("Warehouse::MiLBIngester fetch_fg_minor(#{stats_type}): #{e.message}")
        []
      end

      def build_batter_row(r, pid, season, group)
        {
          "fg_minor_id" => pid,
          "name"        => r["Name"].to_s.strip,
          "mlb_team"    => r["Team"].to_s.strip,
          "level"       => r["Level"].to_s.strip,
          "season"      => season,
          "group"       => group,
          "ab"          => float_or_nil(r["AB"]),
          "h"           => float_or_nil(r["H"]),
          "doubles"     => float_or_nil(r["2B"]),
          "hr"          => float_or_nil(r["HR"]),
          "bb"          => float_or_nil(r["BB"]),
          "sb"          => float_or_nil(r["SB"]),
          "cs"          => float_or_nil(r["CS"]),
          "avg"         => float_or_nil(r["AVG"]),
          "obp"         => float_or_nil(r["OBP"]),
          "slg"         => float_or_nil(r["SLG"]),
          "ops"         => float_or_nil(r["OPS"]),
          "ip"          => nil,
          "k"           => nil,
          "sv"          => nil,
          "era"         => nil,
          "fip"         => nil,
          "whip"        => nil
        }
      end

      def build_pitcher_row(r, pid, season, group)
        {
          "fg_minor_id" => pid,
          "name"        => r["Name"].to_s.strip,
          "mlb_team"    => r["Team"].to_s.strip,
          "level"       => r["Level"].to_s.strip,
          "season"      => season,
          "group"       => group,
          "ab"          => nil,
          "h"           => nil,
          "doubles"     => nil,
          "hr"          => nil,
          "bb"          => nil,
          "sb"          => nil,
          "cs"          => nil,
          "avg"         => nil,
          "obp"         => nil,
          "slg"         => nil,
          "ops"         => nil,
          "ip"          => float_or_nil(r["IP"]),
          "k"           => float_or_nil(r["SO"] || r["K"]),
          "sv"          => float_or_nil(r["SV"]),
          "era"         => float_or_nil(r["ERA"]),
          "fip"         => float_or_nil(r["FIP"]),
          "whip"        => float_or_nil(r["WHIP"])
        }
      end

      def float_or_nil(val)
        return nil if val.nil? || val.to_s.strip.empty?
        Float(val.to_s.gsub(",", ""), exception: false)
      end

      def fg_conn
        Faraday.new do |f|
          f.request  :retry, max: 1, interval: 0.5
          f.response :raise_error
          f.options.timeout      = 30
          f.options.open_timeout = 10
          f.headers["User-Agent"] = "Mozilla/5.0 (compatible; StatlineBot/1.0)"
          f.headers["Accept"]     = "application/json, text/javascript, */*"
          f.headers["Referer"]    = "https://www.fangraphs.com/leaders/minor-league"
        end
      end

      def write_csv(rows)
        CSV.open(csv_path, "w", headers: COLUMNS, write_headers: true) do |csv|
          rows.each { |r| csv << COLUMNS.map { |c| r[c] } }
        end
      end
    end
  end
end
