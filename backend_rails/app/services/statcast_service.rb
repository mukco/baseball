# Fetches Statcast data directly from Baseball Savant's CSV export API
# and FanGraphs leaderboard CSVs. No Python or pybaseball required.
#
# Results are cached in a class-level hash for the server process lifetime.
# Replace with Rails.cache (Redis, Memcached) for persistent caching.
require "csv"

class StatcastService
  SAVANT_BASE    = "https://baseballsavant.mlb.com".freeze
  FANGRAPHS_BASE = "https://www.fangraphs.com".freeze

  # Maximum sample size for movement / spray chart data sent to the client
  MOVEMENT_SAMPLE  = 500
  SPRAY_SAMPLE     = 300

  PITCH_COLORS = {
    "FF" => "4-Seam Fastball",
    "SI" => "Sinker",
    "FC" => "Cutter",
    "SL" => "Slider",
    "ST" => "Sweeper",
    "CU" => "Curveball",
    "KC" => "Knuckle Curve",
    "CH" => "Changeup",
    "FS" => "Split-Finger",
    "KN" => "Knuckleball",
    "SC" => "Screwball",
    "EP" => "Eephus"
  }.freeze

  @@cache = {}
  @@cache_timestamps = {}
  CACHE_TTL = 6 * 3600

  class << self
    # ---------------------------------------------------------------- #
    # Pitcher Statcast
    # ---------------------------------------------------------------- #
    def pitcher(player_id, season)
      key = "pitcher_#{player_id}_#{season}"
      return @@cache[key] if cache_fresh?(key)
      result = fetch_pitcher(player_id, season)
      cache_set(key, result) unless result[:error]
      result
    end

    # ---------------------------------------------------------------- #
    # Batter Statcast
    # ---------------------------------------------------------------- #
    def batter(player_id, season)
      key = "batter_#{player_id}_#{season}"
      return @@cache[key] if cache_fresh?(key)
      result = fetch_batter(player_id, season)
      cache_set(key, result) unless result[:error]
      result
    end

    # ---------------------------------------------------------------- #
    # FanGraphs leaderboards
    # ---------------------------------------------------------------- #
    def batting_leaderboard(season, min_pa: 100)
      key = "bat_leaders_#{season}_#{min_pa}"
      return @@cache[key] if cache_fresh?(key)

      data = fetch_fangraphs_batting(season, min_pa)
      cache_set(key, data) if data.any?
      data
    end

    def pitching_leaderboard(season, min_ip: 30)
      key = "pitch_leaders_#{season}_#{min_ip}"
      return @@cache[key] if cache_fresh?(key)

      data = fetch_fangraphs_pitching(season, min_ip)
      cache_set(key, data) if data.any?
      data
    end

    private

    # ---------------------------------------------------------------- #
    # Baseball Savant CSV fetch helpers
    # ---------------------------------------------------------------- #

    def cache_fresh?(key)
      @@cache.key?(key) && @@cache_timestamps[key].to_i > Time.now.to_i - CACHE_TTL
    end

    def cache_set(key, value)
      @@cache[key] = value
      @@cache_timestamps[key] = Time.now.to_i
    end

    def fetch_pitcher(player_id, season)
      url = "#{SAVANT_BASE}/statcast_search/csv"
      params = {
        type:        "details",
        player_type: "pitcher",
        pitcherId:   player_id,
        season:      season,
        all:         "true",
        hfGT:        "R|",     # Regular season only
        min_pitches: 0
      }
      rows = fetch_csv(url, params)
      return { error: "No data", pitchTypes: [], movementData: [], summary: {}, totalPitches: 0 } if rows.empty?

      aggregate_pitcher(rows)
    rescue StandardError => e
      { error: e.message, pitchTypes: [], movementData: [], summary: {}, totalPitches: 0 }
    end

    def fetch_batter(player_id, season)
      url = "#{SAVANT_BASE}/statcast_search/csv"
      params = {
        type:             "details",
        player_type:      "batter",
        "batters_lookup[]" => player_id,
        season:           season,
        all:              "true",
        hfGT:             "R|",
        min_pitches:      0
      }
      rows = fetch_csv(url, params)
      return { error: "No data", summary: {}, sprayData: [] } if rows.empty?

      aggregate_batter(rows)
    rescue StandardError => e
      { error: e.message, summary: {}, sprayData: [] }
    end

    def fetch_csv(url, params)
      conn = Faraday.new do |f|
        f.request  :retry, max: 2, interval: 1.0
        f.response :raise_error
        f.options.timeout      = 60
        f.options.open_timeout = 15
      end

      # Savant uses `|` as a literal multi-value separator in hfGT (e.g. "R|").
      # Faraday would percent-encode it to `R%7C`, which Savant silently ignores
      # and returns empty data. Build the query string manually to preserve it.
      hfgt = params[:hfGT] || params["hfGT"]
      other = params.reject { |k, _| k.to_s == "hfGT" }
      query = URI.encode_www_form(other)
      query += "&hfGT=#{hfgt}" if hfgt

      resp = conn.get("#{url}?#{query}")
      body = resp.body.force_encoding("UTF-8")

      # Baseball Savant returns an empty CSV or error string for bad requests
      return [] if body.strip.empty? || body.start_with?("<!DOCTYPE")

      csv = CSV.parse(body, headers: true, liberal_parsing: true)
      csv.map do |row|
        row.to_h.transform_keys do |k|
          k.to_s.delete_prefix("\uFEFF").delete_prefix('"').delete_suffix('"').strip
        end
      end
    rescue Faraday::Error => e
      raise "Baseball Savant fetch failed: #{e.message}"
    end

    # ---------------------------------------------------------------- #
    # Pitcher aggregation
    # ---------------------------------------------------------------- #

    def aggregate_pitcher(rows)
      rows = rows.reject { |r| r["pitch_type"].nil? || r["pitch_type"].strip.empty? }
      total = rows.size
      return { pitchTypes: [], movementData: [], locationData: [], pitchOutcomes: {}, summary: {}, totalPitches: 0 } if total.zero?

      by_type = rows.group_by { |r| r["pitch_type"] }

      pitch_types = by_type.map do |ptype, group|
        name         = group.first["pitch_name"].presence || PITCH_COLORS[ptype] || ptype
        usage        = group.size.to_f / total * 100
        avg_velo     = safe_mean(group, "release_speed")
        avg_spin     = safe_mean(group, "release_spin_rate")
        avg_pfx_x    = safe_mean(group, "pfx_x")
        avg_pfx_z    = safe_mean(group, "pfx_z")
        swing_events = %w[swinging_strike swinging_strike_blocked foul foul_tip
                          hit_into_play hit_into_play_no_out hit_into_play_score]
        whiff_events = %w[swinging_strike swinging_strike_blocked]
        swings       = group.count { |r| swing_events.include?(r["description"]) }
        whiffs       = group.count { |r| whiff_events.include?(r["description"]) }
        whiff_rate   = swings.positive? ? (whiffs.to_f / swings * 100).round(1) : nil

        {
          type:      ptype,
          name:      name,
          usage:     usage.round(1),
          avgVelo:   avg_velo&.round(1),
          avgSpin:   avg_spin&.round(0)&.to_i,
          hBreak:    avg_pfx_x ? (avg_pfx_x * 12).round(1) : nil,
          vBreak:    avg_pfx_z ? (avg_pfx_z * 12).round(1) : nil,
          whiffRate: whiff_rate,
          count:     group.size
        }
      end.sort_by { |p| -p[:usage] }

      # Movement data — sample for chart performance
      sample = rows.reject { |r| r["pfx_x"].nil? || r["pfx_z"].nil? }
      sample = sample.sample(MOVEMENT_SAMPLE) if sample.size > MOVEMENT_SAMPLE
      movement_data = sample.map do |r|
        {
          type:   r["pitch_type"],
          name:   r["pitch_name"].presence || PITCH_COLORS[r["pitch_type"]] || r["pitch_type"],
          hBreak: (r["pfx_x"].to_f * 12).round(1),
          vBreak: (r["pfx_z"].to_f * 12).round(1)
        }
      end

      # Summary metrics
      summary = {}
      ff_rows  = rows.select { |r| %w[FF SI].include?(r["pitch_type"]) }
      if (velos = float_vals(ff_rows, "release_speed")).any?
        summary[:avgFastballVelo] = mean(velos).round(1)
      end
      if (xwoba = float_vals(rows, "estimated_woba_using_speedangle")).any?
        summary[:xwOBA] = mean(xwoba).round(3)
      end
      bip = rows.reject { |r| r["launch_speed"].nil? || r["launch_speed"].strip.empty? }
      if (ev = float_vals(bip, "launch_speed")).any?
        summary[:avgExitVelo]  = mean(ev).round(1)
        summary[:hardHitPct]   = (ev.count { |v| v >= 95 }.to_f / ev.size * 100).round(1)
      end

      # Location data for pitch zone chart
      location_data = rows
        .select { |r| r["plate_x"].presence && r["plate_z"].presence }
        .reject { |r| r["plate_x"].strip.empty? || r["plate_z"].strip.empty? }
        .map { |r|
          {
            px:   r["plate_x"].to_f.round(3),
            pz:   r["plate_z"].to_f.round(3),
            type: r["pitch_type"],
            desc: r["description"].to_s
          }
        }

      # Pitch outcomes by type — powers the Sankey chart
      outcome_buckets = {
        "ball"            => %w[ball blocked_ball intent_ball pitchout],
        "called_strike"   => %w[called_strike],
        "swinging_strike" => %w[swinging_strike swinging_strike_blocked foul_tip],
        "foul"            => %w[foul foul_bunt],
        "in_play"         => %w[hit_into_play hit_into_play_no_out hit_into_play_score]
      }
      pitch_outcomes = by_type.transform_values do |group|
        outcome_buckets.transform_values { |descs| group.count { |r| descs.include?(r["description"]) } }
      end

      { pitchTypes: pitch_types, movementData: movement_data, locationData: location_data,
        pitchOutcomes: pitch_outcomes, summary: summary, totalPitches: total }
    end

    # ---------------------------------------------------------------- #
    # Batter aggregation
    # ---------------------------------------------------------------- #

    def aggregate_batter(rows)
      summary    = {}
      bip        = rows.reject { |r| r["launch_speed"].nil? || r["launch_speed"].strip.empty? }
      ev_vals    = float_vals(bip, "launch_speed")

      if ev_vals.any?
        summary[:avgExitVelo] = mean(ev_vals).round(1)
        summary[:maxExitVelo] = ev_vals.max.round(1)
        summary[:hardHitPct]  = (ev_vals.count { |v| v >= 95 }.to_f / ev_vals.size * 100).round(1)
      end

      la_vals = float_vals(bip.reject { |r| r["launch_angle"].nil? || r["launch_angle"].strip.empty? }, "launch_angle")
      if la_vals.any?
        summary[:avgLaunchAngle] = mean(la_vals).round(1)
        summary[:sweetSpotPct]   = (la_vals.count { |v| v.between?(8, 32) }.to_f / la_vals.size * 100).round(1)
        # Simplified barrel: ≥98 mph exit velo AND 26–30° launch angle
        barrel_bip = bip.reject { |r| r["launch_angle"].nil? || r["launch_angle"].strip.empty? }
        barrels    = barrel_bip.count do |r|
          r["launch_speed"].to_f >= 98 && r["launch_angle"].to_f.between?(26, 30)
        end
        summary[:barrelPct] = (barrels.to_f / barrel_bip.size * 100).round(1) if barrel_bip.any?
      end

      if (xba = float_vals(rows, "estimated_ba_using_speedangle")).any?
        summary[:xBA] = mean(xba).round(3)
      end
      if (xwoba = float_vals(rows, "estimated_woba_using_speedangle")).any?
        summary[:xwOBA] = mean(xwoba).round(3)
      end
      if (ss = float_vals(rows, "sprint_speed")).any?
        summary[:sprintSpeed] = mean(ss).round(1)
      end

      # Spray chart — sample hit-location rows
      spray_rows = rows.reject { |r| r["hc_x"].nil? || r["hc_y"].nil? }
      spray_rows = spray_rows.sample(SPRAY_SAMPLE) if spray_rows.size > SPRAY_SAMPLE
      spray_data = spray_rows.map do |r|
        ev = r["launch_speed"].presence&.to_f
        { x: r["hc_x"].to_f.round(1), y: r["hc_y"].to_f.round(1), result: r["events"], exitVelo: ev&.round(1) }
      end

      { summary: summary, sprayData: spray_data }
    end

    # ---------------------------------------------------------------- #
    # FanGraphs leaderboard helpers
    # ---------------------------------------------------------------- #

    def fetch_fangraphs_batting(season, min_pa)
      # FanGraphs custom leaderboard type=8 = dashboard (includes wRC+, WAR, K%, BB%)
      url    = "#{FANGRAPHS_BASE}/api/leaders/major-league/data"
      params = {
        pos: "all", stats: "bat", lg: "all",
        qual: min_pa, type: 8,
        season: season, season1: season,
        ind: 0, pageitems: 500, pagenum: 1,
        sortcol: 17, sortdir: "default"   # sort by WAR
      }
      fetch_fangraphs_json(url, params)
    rescue StandardError => e
      Rails.logger.error("FanGraphs batting error: #{e.message}")
      []
    end

    def fetch_fangraphs_pitching(season, min_ip)
      url    = "#{FANGRAPHS_BASE}/api/leaders/major-league/data"
      params = {
        pos: "all", stats: "pit", lg: "all",
        qual: min_ip, type: 8,
        season: season, season1: season,
        ind: 0, pageitems: 500, pagenum: 1,
        sortcol: 10, sortdir: "default"   # sort by ERA
      }
      fetch_fangraphs_json(url, params)
    rescue StandardError => e
      Rails.logger.error("FanGraphs pitching error: #{e.message}")
      []
    end

    def fetch_fangraphs_json(url, params)
      conn = Faraday.new do |f|
        f.request  :retry, max: 2, interval: 1.0
        f.response :raise_error
        f.options.timeout      = 45
        f.options.open_timeout = 15
        f.headers["User-Agent"] = "Mozilla/5.0 (compatible; StatlineBot/1.0)"
        f.headers["Accept"]     = "application/json, text/javascript, */*"
        f.headers["Referer"]    = "https://www.fangraphs.com/leaders/major-league"
      end

      resp = conn.get(url, params)
      json = JSON.parse(resp.body)

      # FanGraphs wraps rows in json["data"]
      rows = json["data"] || json
      return [] unless rows.is_a?(Array)

      rows.map do |row|
        next row unless row.is_a?(Hash)

        normalized = row.dup
        normalized["Name"] = strip_html(normalized["Name"])
        normalized["Team"] = strip_html(normalized["Team"])

        ["K%", "BB%"].each do |key|
          val = normalized[key]
          next unless val.is_a?(Numeric) || val.to_s.match?(/\A-?\d+(\.\d+)?\z/)

          f = val.to_f
          normalized[key] = f <= 1 ? (f * 100.0) : f
        end

        normalized
      end
    rescue JSON::ParserError
      []
    end

    def strip_html(value)
      value.to_s.gsub(/<[^>]+>/, "")
    end

    # ---------------------------------------------------------------- #
    # Numeric helpers
    # ---------------------------------------------------------------- #

    def float_vals(rows, col)
      rows.filter_map { |r| v = r[col]; v.nil? || v.strip.empty? ? nil : v.to_f }
    end

    def mean(vals)
      return nil if vals.empty?
      vals.sum.to_f / vals.size
    end

    def safe_mean(rows, col)
      vals = float_vals(rows, col)
      vals.any? ? mean(vals) : nil
    end
  end
end
