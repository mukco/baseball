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

    LEVEL_PRIORITY = { "AAA" => 6, "AA" => 5, "A+" => 4, "A" => 3, "A-" => 2, "R" => 1 }.freeze

    class << self
      def ingest!
        FileUtils.mkdir_p(base_dir)

        prospects = rostered_minor_leaguers
        if prospects.empty?
          write_csv([])
          Rails.logger.info("Warehouse::MiLBIngester: no rostered minor leaguers, wrote 0 rows")
          return 0
        end

        season   = Date.today.year
        all_rows = prospects.filter_map { |p| fetch_player_row(p, season) }

        write_csv(all_rows)
        Rails.logger.info("Warehouse::MiLBIngester: wrote #{all_rows.size} rows for #{prospects.size} rostered prospects")
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

      def rostered_minor_leaguers
        rosters = OttoneuService.all_rosters
        return [] if rosters.is_a?(Hash) && rosters[:error]

        Array(rosters).flat_map do |team|
          Array(team[:players]).filter_map do |p|
            next unless p[:fg_id].blank? && p[:fg_minor_id].present?
            { fg_minor_id: p[:fg_minor_id], name: p[:name], positions: p[:positions] }
          end
        end.uniq { |p| p[:fg_minor_id] }
      end

      # Fetch batting or pitching stats for a single player via FanGraphs per-player API.
      # Prefers the combined "MiLB" row; falls back to the highest level with AB/IP data.
      def fetch_player_row(player, season)
        fg_minor_id = player[:fg_minor_id]
        is_pitcher  = player[:positions].to_s.match?(/\bP\b|SP|RP|CP/)
        stats_type  = is_pitcher ? "pit" : "bat"
        position    = is_pitcher ? "P" : "NP"

        resp = fg_conn.get("https://www.fangraphs.com/api/players/stats", {
          playerid: fg_minor_id,
          position: position,
          stats:    stats_type,
          lg:       "all",
          season:   season,
          type:     0
        })

        json = JSON.parse(resp.body)
        rows = Array(json["data"]).select do |r|
          r["aseason"].to_i == season &&
            !%w[PROJ ROS].include?(r["AbbLevel"].to_s)
        end

        return nil if rows.empty?

        # Prefer the combined MiLB row; otherwise pick the highest level
        row = rows.find { |r| r["AbbLevel"] == "MiLB" } ||
              rows.max_by { |r| LEVEL_PRIORITY[r["AbbLevel"].to_s] || 0 }

        is_pitcher ? build_pitcher_row(row, fg_minor_id, season) : build_batter_row(row, fg_minor_id, season)
      rescue => e
        Rails.logger.warn("Warehouse::MiLBIngester: #{player[:name]} (#{player[:fg_minor_id]}) — #{e.message}")
        nil
      end

      def build_batter_row(r, fg_minor_id, season)
        {
          "fg_minor_id" => fg_minor_id,
          "name"        => r["name"].to_s.presence || extract_name(r),
          "mlb_team"    => r["AbbName"].to_s,
          "level"       => r["AbbLevel"].to_s,
          "season"      => season,
          "group"       => "batter",
          "ab"          => r["AB"],
          "h"           => r["H"],
          "doubles"     => r["2B"],
          "hr"          => r["HR"],
          "bb"          => r["BB"],
          "sb"          => r["SB"],
          "cs"          => r["CS"],
          "avg"         => r["AVG"],
          "obp"         => r["OBP"],
          "slg"         => r["SLG"],
          "ops"         => r["OPS"],
          "ip"          => nil,
          "k"           => nil,
          "sv"          => nil,
          "era"         => nil,
          "fip"         => nil,
          "whip"        => nil
        }
      end

      def build_pitcher_row(r, fg_minor_id, season)
        {
          "fg_minor_id" => fg_minor_id,
          "name"        => r["name"].to_s.presence || extract_name(r),
          "mlb_team"    => r["AbbName"].to_s,
          "level"       => r["AbbLevel"].to_s,
          "season"      => season,
          "group"       => "pitcher",
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
          "ip"          => r["IP"],
          "k"           => r["SO"] || r["K"],
          "sv"          => r["SV"],
          "era"         => r["ERA"],
          "fip"         => r["FIP"],
          "whip"        => r["WHIP"]
        }
      end

      # The per-player API doesn't always return a "name" field; strip HTML from ateam if needed.
      def extract_name(r)
        r["ateam"].to_s.gsub(/<[^>]+>/, "").strip
      end

      def fg_conn
        Faraday.new do |f|
          f.request  :retry, max: 1, interval: 0.5
          f.response :raise_error
          f.options.timeout      = 30
          f.options.open_timeout = 10
          f.headers["User-Agent"] = "Mozilla/5.0 (compatible; StatlineBot/1.0)"
          f.headers["Accept"]     = "application/json, text/javascript, */*"
          f.headers["Referer"]    = "https://www.fangraphs.com/players"
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
