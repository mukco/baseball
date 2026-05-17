class ProspectService
  DATA_DIR = Rails.root.join("data", "prospects")
  CACHE_TTL = 6 * 3600
  FILE_REFRESH_TTL = 24 * 3600

  FG_API_URL = "https://www.fangraphs.com/api/prospects/board/prospects-list".freeze

  # FanGraphs uses non-standard abbreviations for several teams
  FG_TEAM_ABBR = {
    "CHW" => "CWS",
    "KCR" => "KC",
    "SDP" => "SD",
    "SFG" => "SF",
    "TBR" => "TB",
    "WSN" => "WSH",
    "ATH" => "OAK"
  }.freeze

  # MLB team ID → FanGraphs abbreviation
  TEAM_ID_TO_FG = {
    108 => "LAA", 109 => "ARI", 110 => "BAL", 111 => "BOS",
    112 => "CHC", 113 => "CIN", 114 => "CLE", 115 => "COL",
    116 => "DET", 117 => "HOU", 118 => "KCR", 119 => "LAD",
    120 => "WSN", 121 => "NYM", 133 => "ATH", 134 => "PIT",
    135 => "SDP", 136 => "SEA", 137 => "SFG", 138 => "STL",
    139 => "TBR", 140 => "TEX", 141 => "TOR", 142 => "MIN",
    143 => "PHI", 144 => "ATL", 145 => "CHW", 146 => "MIA",
    147 => "NYY", 158 => "MIL"
  }.freeze

  SPORT_IDS = {
    "MLB" => 1, "AAA" => 11, "AA" => 12,
    "A+" => 13, "A" => 14, "A-" => 15,
    "R" => 16, "ROK" => 16, "DSL" => 17
  }.freeze

  @@cache = {}
  @@cache_timestamps = {}
  @@file_refresh_timestamps = {}

  class << self
    def for_player(player_id:)
      key = "prospects_player_#{player_id}"
      return @@cache[key] if cache_fresh?(key)

      data = load_file("board.json")
      unless data
        cache_set(key, { prospect: nil })
        return { prospect: nil }
      end

      mlb  = MlbApiService.new
      info = mlb.player_info(player_id)
      unless info
        cache_set(key, { prospect: nil })
        return { prospect: nil }
      end

      name = info[:name].to_s.downcase.strip
      prospect = data.find { |p| p["name"].to_s.downcase.strip == name }

      result = { prospect: prospect }
      cache_set(key, result)
      result
    rescue => e
      Rails.logger.warn("[ProspectService.for_player] #{e.message}")
      { prospect: nil }
    end

    def top100
      key = "prospects_top100"
      return @@cache[key] if cache_fresh?(key)

      refresh_file_if_stale("board.json")
      data = load_file("board.json")
      return { error: "No prospect data available" } unless data

      top = data
        .select { |p| p["rank"].to_i.between?(1, 100) }
        .sort_by { |p| p["rank"].to_i }

      enriched = enrich_with_stats(top)
      cache_set(key, enriched) unless enriched.is_a?(Hash) && enriched[:error]
      enriched
    rescue => e
      { error: e.message }
    end

    def team_prospects(team_id:)
      key = "prospects_team_#{team_id}"
      return @@cache[key] if cache_fresh?(key)

      fg_abbr = TEAM_ID_TO_FG[team_id]
      return { error: "Unsupported team" } unless fg_abbr

      data = load_file("board.json")
      return { error: "No prospect data available" } unless data

      team_data = data
        .select { |p| p["fgTeam"] == fg_abbr }
        .sort_by { |p| p["orgRank"].to_i > 0 ? p["orgRank"].to_i : 9999 }
        .first(25)

      return { error: "No prospects found for this team" } if team_data.empty?

      enriched = enrich_with_stats(team_data)
      cache_set(key, enriched) unless enriched.is_a?(Hash) && enriched[:error]
      enriched
    rescue => e
      { error: e.message }
    end

    private

    def refresh_file_if_stale(filename)
      path = DATA_DIR.join(filename)
      last_check = @@file_refresh_timestamps[filename] || 0
      return if Time.now.to_i - last_check < FILE_REFRESH_TTL

      @@file_refresh_timestamps[filename] = Time.now.to_i
      return if file_too_recent?(path)

      fetched = fetch_fangraphs_board
      return if fetched.nil? || fetched.length < 10

      current = load_file(filename) || []
      existing_hash = Digest::SHA256.hexdigest(JSON.generate(current))
      new_hash = Digest::SHA256.hexdigest(JSON.generate(fetched))
      return if existing_hash == new_hash

      File.write(path, JSON.pretty_generate(fetched))
      Rails.logger.info("[ProspectService] Refreshed #{filename}: #{current.length} → #{fetched.length} prospects")
      clear_cache!
    rescue => e
      Rails.logger.warn("[ProspectService] Refresh failed for #{filename}: #{e.message}")
    end

    def file_too_recent?(path)
      return false unless path.exist?
      path.mtime > Time.now - FILE_REFRESH_TTL
    end

    def fetch_fangraphs_board
      conn = Faraday.new do |f|
        f.request :retry, max: 2, interval: 1.0
        f.response :raise_error
        f.options.timeout      = 45
        f.options.open_timeout = 10
      end

      resp = conn.get(FG_API_URL) do |req|
        req.params["draft"]   = "all"
        req.params["players"] = ""
        req.headers["User-Agent"] = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
        req.headers["Referer"]    = "https://www.fangraphs.com/prospects/the-board"
        req.headers["Accept"]     = "application/json"
      end

      all_data = JSON.parse(resp.body)
      return nil unless all_data.is_a?(Array) && all_data.length > 10

      current_season = all_data
        .map { |p| p["cSeason"].to_s }
        .reject { |s| s.include?("Updated") || s == "0" || s.blank? }
        .uniq
        .max_by(&:to_i)

      return nil unless current_season

      all_data
        .select { |p| p["cSeason"].to_s == current_season && p["Team"].present? && p["Ovr_Rank"].to_i > 0 }
        .map { |p| format_prospect(p) }
    rescue => e
      Rails.logger.warn("[ProspectService] FanGraphs API error: #{e.message}")
      nil
    end

    def format_prospect(p)
      fg_team = p["Team"].to_s
      mlb_abbr = FG_TEAM_ABBR[fg_team] || fg_team

      {
        "rank"     => p["Ovr_Rank"].to_i,
        "orgRank"  => p["Org_Rank"].to_i,
        "name"     => p["playerName"].to_s,
        "position" => p["Position"].to_s,
        "team"     => mlb_abbr,
        "fgTeam"   => fg_team,
        "level"    => p["mlevel"].presence || p["llevel"].to_s,
        "age"      => p["Age"].to_f.round(1),
        "bats"     => p["Bats"].to_s,
        "throws"   => p["Throws"].to_s,
        "fv"       => p["FV_Current"].to_i,
        "eta"      => p["ETA_Current"].to_i,
        "risk"     => p["cRisk"].presence,
        "tldr"     => p["TLDR"].presence,
        "tools"    => tools_for(p)
      }
    end

    def tools_for(p)
      pos = p["Position"].to_s
      is_pitcher = %w[SP RP P].include?(pos) || pos.end_with?("HP")

      if is_pitcher
        {
          fb:  p["FB"].presence,
          sl:  p["SL"].presence,
          cb:  p["CB"].presence,
          ch:  p["CH"].presence,
          cmd: p["CMD"].presence
        }.compact
      else
        {
          hit:   p["Hit"].presence,
          power: p["Raw"].presence,
          run:   p["Spd"].presence,
          field: p["Fld"].presence,
          arm:   p["pArm"].to_i > 0 ? "#{p["pArm"]} / #{p["fArm"] || p["pArm"]}" : nil
        }.compact
      end
    end

    def load_file(path)
      file = DATA_DIR.join(path)
      return nil unless file.exist?
      JSON.parse(File.read(file))
    rescue JSON::ParserError
      nil
    end

    def clear_cache!
      @@cache.clear
      @@cache_timestamps.clear
    end

    def enrich_with_stats(prospects)
      mlb = MlbApiService.new
      prospects.map do |prospect|
        player_id = resolve_player_id(prospect["name"], mlb)
        next prospect.merge("resolved" => false) unless player_id

        sport_id = SPORT_IDS[prospect["level"]] || 11
        stats = fetch_minor_league_stats(player_id, sport_id, mlb)

        prospect.merge(
          "playerId"  => player_id,
          "resolved"  => true,
          "stats"     => stats
        )
      rescue => e
        Rails.logger.warn("[ProspectService] Enrichment failed for #{prospect["name"]}: #{e.message}")
        prospect.merge("resolved" => false)
      end
    end

    def resolve_player_id(name, mlb)
      results = mlb.search_players(name)
      return nil if results.empty?

      exact = results.find { |r| r[:name].downcase.strip == name.downcase.strip }
      (exact || results.first)&.dig(:id)
    end

    def fetch_minor_league_stats(player_id, sport_id, mlb)
      data = mlb.send(:get, "people/#{player_id}/stats", {
        stats:     "season",
        season:    Date.today.year,
        group:     "hitting,pitching,fielding",
        gameType:  "R",
        sportIds:  sport_id
      })

      result = { hitting: nil, pitching: nil, fielding: nil }
      (data["stats"] || []).each do |group|
        key   = group.dig("group", "displayName")&.downcase&.to_sym
        split = group.dig("splits", 0)
        result[key] = split["stat"] if key && split
      end
      result
    rescue
      {}
    end

    def cache_fresh?(key)
      @@cache.key?(key) && @@cache_timestamps[key].to_i > Time.now.to_i - CACHE_TTL
    end

    def cache_set(key, value)
      @@cache[key] = value
      @@cache_timestamps[key] = Time.now.to_i
    end
  end
end
