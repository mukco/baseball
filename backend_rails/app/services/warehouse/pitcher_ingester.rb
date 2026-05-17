require "csv"
require "json"
require "fileutils"

module Warehouse
  class PitcherIngester
    SEASONS_START = 2010

    NAMED_COLUMNS = %w[
      player_id fg_id name team league season
      g gs w l sv ip tbf h er hr bb k
      era fip xfip siera war whip k_per_9 bb_per_9
      k_pct bb_pct k_minus_bb_pct babip gb_pct ld_pct fb_pct
    ].freeze

    class << self
      def ingest!
        FileUtils.mkdir_p(base_dir)
        seasons = (SEASONS_START..Date.today.year).to_a
        all_rows = seasons.flat_map { |season| season_rows(season) }
        write_csv(all_rows)
        Rails.logger.info("Warehouse::PitcherIngester: wrote #{all_rows.size} rows")
        all_rows.size
      end

      def csv_path
        base_dir.join("pitchers.csv")
      end

      private

      def base_dir
        Rails.root.join("tmp", "warehouse")
      end

      def season_rows(season)
        Rails.logger.info("Warehouse::PitcherIngester: fetching #{season}")
        rows = fetch_fangraphs_pitching(season)

        rows.filter_map do |row|
          player_id = integer_or_nil(row["xMLBAMID"] || row["MLBID"])
          next if player_id.nil?

          team_abbr = strip_html(row["Team"] || "")

          {
            player_id:      player_id,
            fg_id:          (row["playerid"] || row["PlayerID"]).to_s,
            name:           strip_html(row["Name"]),
            team:           team_abbr,
            league:         league_for_team(team_abbr),
            season:         season,
            g:              integer_or_nil(row["G"]),
            gs:             integer_or_nil(row["GS"]),
            w:              integer_or_nil(row["W"]),
            l:              integer_or_nil(row["L"]),
            sv:             integer_or_nil(row["SV"]),
            ip:             float_or_nil(row["IP"]),
            tbf:            integer_or_nil(row["TBF"]),
            h:              integer_or_nil(row["H"]),
            er:             integer_or_nil(row["ER"]),
            hr:             integer_or_nil(row["HR"]),
            bb:             integer_or_nil(row["BB"]),
            k:              integer_or_nil(row["SO"] || row["K"]),
            era:            float_or_nil(row["ERA"]),
            fip:            float_or_nil(row["FIP"]),
            xfip:           float_or_nil(row["xFIP"]),
            siera:          float_or_nil(row["SIERA"]),
            war:            float_or_nil(row["WAR"]),
            whip:           float_or_nil(row["WHIP"]),
            k_per_9:        float_or_nil(row["K/9"]),
            bb_per_9:       float_or_nil(row["BB/9"]),
            k_pct:          pct_or_nil(row["K%"]),
            bb_pct:         pct_or_nil(row["BB%"]),
            k_minus_bb_pct: pct_or_nil(row["K-BB%"]),
            babip:          float_or_nil(row["BABIP"]),
            gb_pct:         pct_or_nil(row["GB%"]),
            ld_pct:         pct_or_nil(row["LD%"]),
            fb_pct:         pct_or_nil(row["FB%"])
          }
        end
      rescue StandardError => e
        Rails.logger.error("Warehouse::PitcherIngester season #{season} failed: #{e.message}")
        []
      end

      def write_csv(rows)
        CSV.open(csv_path, "wb") do |csv|
          csv << NAMED_COLUMNS
          rows.each { |r| csv << NAMED_COLUMNS.map { |col| r[col.to_sym] } }
        end
      end

      def fetch_fangraphs_pitching(season)
        conn = fangraphs_conn
        resp = conn.get("https://www.fangraphs.com/api/leaders/major-league/data", {
          pos: "all", stats: "pit", lg: "all", qual: 0, type: 8,
          season: season, season1: season, ind: 0, pageitems: 2000, pagenum: 1
        })
        json = JSON.parse(resp.body)
        rows = json["data"] || json
        rows.is_a?(Array) ? rows.select { |r| r.is_a?(Hash) } : []
      end

      def fangraphs_conn
        Faraday.new do |f|
          f.request  :retry, max: 2, interval: 1.5
          f.response :raise_error
          f.options.timeout      = 60
          f.options.open_timeout = 15
          f.headers["User-Agent"] = "Mozilla/5.0 (compatible; StatlineBot/1.0)"
          f.headers["Accept"]     = "application/json, text/javascript, */*"
          f.headers["Referer"]    = "https://www.fangraphs.com/leaders/major-league"
        end
      end

      def league_for_team(abbr)
        return nil if abbr.blank?
        nl = %w[ARI ATL CHC CIN COL LAD MIA MIL NYM PHI PIT SD SF STL WSH]
        al = %w[BAL BOS CWS CLE DET HOU KC LAA MIN NYY OAK SEA TB TEX TOR]
        return "NL" if nl.include?(abbr)
        return "AL" if al.include?(abbr)
        nil
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
