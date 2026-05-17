require "csv"
require "json"
require "fileutils"

module Warehouse
  class BatterIngester
    SEASONS_START = 2010

    NAMED_COLUMNS = %w[
      player_id fg_id name team league position season
      g pa ab h hr r rbi sb bb k
      avg obp slg ops iso
      wrc_plus war woba babip k_pct bb_pct ld_pct gb_pct fb_pct hr_fb_pct
      o_swing_pct z_swing_pct bat_speed
      swing_length hard_swing_rate squared_up_per_swing blast_per_swing
    ].freeze

    # Savant only began tracking bat speed in 2024
    BAT_SPEED_START = 2024

    class << self
      def ingest!
        FileUtils.mkdir_p(base_dir)
        seasons = (SEASONS_START..Date.today.year).to_a
        all_rows = seasons.flat_map { |season| season_rows(season) }
        write_csv(all_rows)
        Rails.logger.info("Warehouse::BatterIngester: wrote #{all_rows.size} rows")
        all_rows.size
      end

      def csv_path
        base_dir.join("batters.csv")
      end

      private

      def base_dir
        Rails.root.join("tmp", "warehouse")
      end

      def season_rows(season)
        Rails.logger.info("Warehouse::BatterIngester: fetching #{season}")
        rows = fetch_fangraphs_batting(season)
        disc = fetch_fangraphs_discipline(season)
        speeds = season >= BAT_SPEED_START ? fetch_savant_bat_speed(season) : {}

        disc_by_id   = disc.each_with_object({}) do |r, h|
          id = integer_or_nil(r["xMLBAMID"] || r["MLBID"])
          h[id] = r if id
        end

        player_ids = rows.filter_map { |r| integer_or_nil(r["xMLBAMID"] || r["MLBID"]) }.uniq
        positions = fetch_positions(player_ids)

        rows.filter_map do |row|
          player_id = integer_or_nil(row["xMLBAMID"] || row["MLBID"])
          next if player_id.nil?

          team_abbr  = strip_html(row["Team"] || "")
          pos_info   = positions[player_id] || {}
          d          = disc_by_id[player_id] || {}
          spd        = speeds[player_id] || {}

          {
            player_id: player_id,
            fg_id:     (row["playerid"] || row["PlayerID"]).to_s,
            name:      strip_html(row["Name"]),
            team:      team_abbr,
            league:    league_for_team(team_abbr),
            position:  pos_info[:position],
            season:    season,
            g:         integer_or_nil(row["G"]),
            pa:        integer_or_nil(row["PA"]),
            ab:        integer_or_nil(row["AB"]),
            h:         integer_or_nil(row["H"]),
            hr:        integer_or_nil(row["HR"]),
            r:         integer_or_nil(row["R"]),
            rbi:       integer_or_nil(row["RBI"]),
            sb:        integer_or_nil(row["SB"]),
            bb:        integer_or_nil(row["BB"]),
            k:         integer_or_nil(row["SO"]),
            avg:       float_or_nil(row["AVG"]),
            obp:       float_or_nil(row["OBP"]),
            slg:       float_or_nil(row["SLG"]),
            ops:       float_or_nil(row["OPS"]),
            iso:       float_or_nil(row["ISO"]),
            wrc_plus:  integer_or_nil(row["wRC+"]),
            war:       float_or_nil(row["WAR"]),
            woba:      float_or_nil(row["wOBA"]),
            babip:     float_or_nil(row["BABIP"]),
            k_pct:     pct_or_nil(row["K%"]),
            bb_pct:    pct_or_nil(row["BB%"]),
            ld_pct:    pct_or_nil(row["LD%"]),
            gb_pct:    pct_or_nil(row["GB%"]),
            fb_pct:    pct_or_nil(row["FB%"]),
            hr_fb_pct: pct_or_nil(row["HR/FB"]),
            o_swing_pct:          pct_or_nil(d["O-Swing%"]),
            z_swing_pct:          pct_or_nil(d["Z-Swing%"]),
            bat_speed:            spd[:avg_bat_speed],
            swing_length:         spd[:swing_length],
            hard_swing_rate:      spd[:hard_swing_rate],
            squared_up_per_swing: spd[:squared_up_per_swing],
            blast_per_swing:      spd[:blast_per_swing]
          }
        end
      rescue StandardError => e
        Rails.logger.error("Warehouse::BatterIngester season #{season} failed: #{e.message}")
        []
      end

      # FanGraphs type 6 = Plate Discipline (O-Swing%, Z-Swing%, SwStr%, Contact%, Zone%, etc.)
      def fetch_fangraphs_discipline(season)
        conn = fangraphs_conn
        resp = conn.get("https://www.fangraphs.com/api/leaders/major-league/data", {
          pos: "all", stats: "bat", lg: "all", qual: 0, type: 6,
          season: season, season1: season, ind: 0, pageitems: 2000, pagenum: 1
        })
        json = JSON.parse(resp.body)
        rows = json["data"] || json
        rows.is_a?(Array) ? rows.select { |r| r.is_a?(Hash) } : []
      rescue StandardError => e
        Rails.logger.warn("Warehouse::BatterIngester discipline fetch failed (#{season}): #{e.message}")
        []
      end

      # Baseball Savant bat tracking leaderboard — available from 2024 onward.
      # Returns a hash of { player_id (int) => bat_speed (float) }.
      def fetch_savant_bat_speed(season)
        conn = Faraday.new do |f|
          f.request  :retry, max: 2, interval: 1.0
          f.response :raise_error
          f.options.timeout      = 30
          f.options.open_timeout = 10
          f.headers["User-Agent"] = "Mozilla/5.0 (compatible; StatlineBot/1.0)"
          f.headers["Referer"]    = "https://baseballsavant.mlb.com/leaderboard/bat-tracking"
        end

        resp = conn.get("https://baseballsavant.mlb.com/leaderboard/bat-tracking", {
          attackZone: "", batSide: "", contactType: "", count: "",
          csv: "true", v: "1", year: season
        })

        body = resp.body.force_encoding("UTF-8")
        return {} if body.strip.empty? || body.start_with?("<")

        csv = CSV.parse(body, headers: true, liberal_parsing: true)
        csv.each_with_object({}) do |row, memo|
          h  = row.to_h.transform_keys(&:strip)
          # Savant uses "id" as the player id column (not "player_id")
          id = integer_or_nil(h["id"] || h["player_id"])
          next unless id
          memo[id] = {
            avg_bat_speed:        float_or_nil(h["avg_bat_speed"]) || float_or_nil(h["bat_speed"]) || float_or_nil(h["bat_speed_rounded"]),
            swing_length:         float_or_nil(h["swing_length"]),
            hard_swing_rate:      pct_or_nil(h["hard_swing_rate"]),
            squared_up_per_swing: pct_or_nil(h["squared_up_per_swing"]),
            blast_per_swing:      pct_or_nil(h["blast_per_swing"]),
          }
        end
      rescue StandardError => e
        Rails.logger.warn("Warehouse::BatterIngester bat speed fetch failed (#{season}): #{e.message}")
        {}
      end

      def write_csv(rows)
        CSV.open(csv_path, "wb") do |csv|
          csv << NAMED_COLUMNS
          rows.each { |r| csv << NAMED_COLUMNS.map { |col| r[col.to_sym] } }
        end
      end

      def fetch_fangraphs_batting(season)
        conn = fangraphs_conn
        resp = conn.get("https://www.fangraphs.com/api/leaders/major-league/data", {
          pos: "all", stats: "bat", lg: "all", qual: 0, type: 8,
          season: season, season1: season, ind: 0, pageitems: 2000, pagenum: 1
        })
        json = JSON.parse(resp.body)
        rows = json["data"] || json
        rows.is_a?(Array) ? rows.select { |r| r.is_a?(Hash) } : []
      end

      def fetch_positions(player_ids)
        return {} if player_ids.empty?

        conn = Faraday.new(url: "https://statsapi.mlb.com/api/v1") do |f|
          f.request :retry, max: 2, interval: 0.5
          f.response :raise_error
          f.options.timeout      = 20
          f.options.open_timeout = 8
        end

        player_ids.each_slice(75).each_with_object({}) do |slice, memo|
          resp = conn.get("people", { personIds: slice.join(",") })
          (JSON.parse(resp.body)["people"] || []).each do |p|
            memo[p["id"].to_i] = {
              position: p.dig("primaryPosition", "abbreviation"),
              team:     p.dig("currentTeam", "abbreviation")
            }
          end
        end
      rescue Faraday::Error => e
        Rails.logger.warn("Warehouse::BatterIngester position fetch failed: #{e.message}")
        {}
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
        # FanGraphs returns rates as fractions (0.25) or percents (25.0); normalise to percent
        f <= 1.0 ? (f * 100.0).round(1) : f.round(1)
      rescue ArgumentError, TypeError
        nil
      end
    end
  end
end
