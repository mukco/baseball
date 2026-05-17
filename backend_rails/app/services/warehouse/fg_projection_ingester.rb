require "csv"
require "json"
require "fileutils"

module Warehouse
  class FgProjectionIngester
    PROJECTION_SYSTEM = "steamer".freeze

    BATTING_COLUMNS = %w[
      player_id fg_id name team season projection_system
      g pa hr r rbi sb bb k avg obp slg ops iso
      wrc_plus war woba babip k_pct bb_pct
    ].freeze

    PITCHING_COLUMNS = %w[
      player_id fg_id name team season projection_system
      g gs w l sv ip tbf k bb hr
      era fip xfip siera war whip k_per_9 bb_per_9
      k_pct bb_pct k_minus_bb_pct babip gb_pct
    ].freeze

    class << self
      def ingest!
        FileUtils.mkdir_p(base_dir)
        season = Date.today.year

        batting_rows  = fetch_batting_projections(season)
        pitching_rows = fetch_pitching_projections(season)
        write_csv(batting_csv_path,  BATTING_COLUMNS,  batting_rows)
        write_csv(pitching_csv_path, PITCHING_COLUMNS, pitching_rows)

        Rails.logger.info("Warehouse::FgProjectionIngester: #{batting_rows.size} batting, #{pitching_rows.size} pitching")
        { batting: batting_rows.size, pitching: pitching_rows.size }
      end

      def batting_csv_path
        base_dir.join("fg_projections_batting.csv")
      end

      def pitching_csv_path
        base_dir.join("fg_projections_pitching.csv")
      end

      private

      def base_dir
        Rails.root.join("tmp", "warehouse")
      end

      def fetch_batting_projections(season)
        rows = fetch_fg_projections(stats: "bat")
        rows.map do |row|
          {
            player_id:         integer_or_nil(row["mlbamid"] || row["xMLBAMID"] || row["MLBID"]),
            fg_id:             (row["playerid"] || row["PlayerID"]).to_s,
            name:              strip_html(row["PlayerName"] || row["Name"]),
            team:              strip_html(row["Team"] || ""),
            season:            season,
            projection_system: PROJECTION_SYSTEM,
            g:                 integer_or_nil(row["G"]),
            pa:                integer_or_nil(row["PA"]),
            hr:                integer_or_nil(row["HR"]),
            r:                 integer_or_nil(row["R"]),
            rbi:               integer_or_nil(row["RBI"]),
            sb:                integer_or_nil(row["SB"]),
            bb:                integer_or_nil(row["BB"]),
            k:                 integer_or_nil(row["SO"] || row["K"]),
            avg:               float_or_nil(row["AVG"]),
            obp:               float_or_nil(row["OBP"]),
            slg:               float_or_nil(row["SLG"]),
            ops:               float_or_nil(row["OPS"]),
            iso:               float_or_nil(row["ISO"]),
            wrc_plus:          integer_or_nil(row["wRC+"]),
            war:               float_or_nil(row["WAR"]),
            woba:              float_or_nil(row["wOBA"]),
            babip:             float_or_nil(row["BABIP"]),
            k_pct:             pct_or_nil(row["K%"]),
            bb_pct:            pct_or_nil(row["BB%"])
          }
        end
      rescue StandardError => e
        Rails.logger.error("Warehouse::FgProjectionIngester batting failed: #{e.message}")
        []
      end

      def fetch_pitching_projections(season)
        rows = fetch_fg_projections(stats: "pit")
        rows.map do |row|
          {
            player_id:        integer_or_nil(row["mlbamid"] || row["xMLBAMID"] || row["MLBID"]),
            fg_id:            (row["playerid"] || row["PlayerID"]).to_s,
            name:             strip_html(row["PlayerName"] || row["Name"]),
            team:             strip_html(row["Team"] || ""),
            season:           season,
            projection_system: PROJECTION_SYSTEM,
            g:                integer_or_nil(row["G"]),
            gs:               integer_or_nil(row["GS"]),
            w:                integer_or_nil(row["W"]),
            l:                integer_or_nil(row["L"]),
            sv:               integer_or_nil(row["SV"]),
            ip:               float_or_nil(row["IP"]),
            tbf:              integer_or_nil(row["TBF"]),
            k:                integer_or_nil(row["SO"] || row["K"]),
            bb:               integer_or_nil(row["BB"]),
            hr:               integer_or_nil(row["HR"]),
            era:              float_or_nil(row["ERA"]),
            fip:              float_or_nil(row["FIP"]),
            xfip:             float_or_nil(row["xFIP"]),
            siera:            float_or_nil(row["SIERA"]),
            war:              float_or_nil(row["WAR"]),
            whip:             float_or_nil(row["WHIP"]),
            k_per_9:          float_or_nil(row["K/9"]),
            bb_per_9:         float_or_nil(row["BB/9"]),
            k_pct:            pct_or_nil(row["K%"]),
            bb_pct:           pct_or_nil(row["BB%"]),
            k_minus_bb_pct:   pct_or_nil(row["K-BB%"]),
            babip:            float_or_nil(row["BABIP"]),
            gb_pct:           pct_or_nil(row["GB%"])
          }
        end
      rescue StandardError => e
        Rails.logger.error("Warehouse::FgProjectionIngester pitching failed: #{e.message}")
        []
      end

      def fetch_fg_projections(stats:)
        conn = Faraday.new do |f|
          f.request  :retry, max: 2, interval: 1.5
          f.response :raise_error
          f.options.timeout      = 60
          f.options.open_timeout = 15
          f.headers["User-Agent"] = "Mozilla/5.0 (compatible; StatlineBot/1.0)"
          f.headers["Accept"]     = "application/json, text/javascript, */*"
          f.headers["Referer"]    = "https://www.fangraphs.com/projections"
        end

        resp = conn.get("https://www.fangraphs.com/api/projections", {
          type: PROJECTION_SYSTEM, stats: stats, pos: "all", team: 0, players: 0, lg: "all"
        })
        json = JSON.parse(resp.body)
        rows = json.is_a?(Array) ? json : (json["data"] || [])
        rows.select { |r| r.is_a?(Hash) }
      end

      def write_csv(path, columns, rows)
        CSV.open(path, "wb") do |csv|
          csv << columns
          rows.each { |r| csv << columns.map { |col| r[col.to_sym] } }
        end
      end

      def strip_html(value)
        value.to_s.gsub(/<[^>]+>/, "").strip
      end

      def integer_or_nil(value)
        return nil if value.nil?
        str = value.to_s.strip
        return nil if str.empty?
        Float(str).round
      rescue ArgumentError, TypeError
        nil
      end

      def float_or_nil(value)
        return nil if value.nil?
        Float(value.to_s)
      rescue ArgumentError, TypeError
        nil
      end

      def pct_or_nil(value)
        return nil if value.nil?
        f = Float(value.to_s)
        f <= 1.0 ? (f * 100.0).round(1) : f.round(1)
      rescue ArgumentError, TypeError
        nil
      end
    end
  end
end
