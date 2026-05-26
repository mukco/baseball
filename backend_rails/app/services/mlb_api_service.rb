# Thin wrapper around the free, public MLB Stats API.
# No authentication required. https://statsapi.mlb.com/api/v1
#
# All methods return plain Ruby hashes/arrays — controllers are
# responsible for serialising to JSON.
class MlbApiService
  BASE_URL = "https://statsapi.mlb.com/api/v1".freeze
  BASE_URL_V11 = "https://statsapi.mlb.com/api/v1.1".freeze
  FIP_CONSTANT = 3.2

  TEAM_META = {
    108 => { abbr: "LAA", color: "#003263" },
    109 => { abbr: "ARI", color: "#A71930" },
    110 => { abbr: "BAL", color: "#DF4601" },
    111 => { abbr: "BOS", color: "#BD3039" },
    112 => { abbr: "CHC", color: "#0E3386" },
    113 => { abbr: "CIN", color: "#C6011F" },
    114 => { abbr: "CLE", color: "#00385D" },
    115 => { abbr: "COL", color: "#33006F" },
    116 => { abbr: "DET", color: "#0C2340" },
    117 => { abbr: "HOU", color: "#002D62" },
    118 => { abbr: "KC",  color: "#004687" },
    119 => { abbr: "LAD", color: "#005A9C" },
    120 => { abbr: "WSH", color: "#AB0003" },
    121 => { abbr: "NYM", color: "#002D72" },
    133 => { abbr: "OAK", color: "#003831" },
    134 => { abbr: "PIT", color: "#FDB827" },
    135 => { abbr: "SD",  color: "#2F241D" },
    136 => { abbr: "SEA", color: "#0C2C56" },
    137 => { abbr: "SF",  color: "#FD5A1E" },
    138 => { abbr: "STL", color: "#C41E3A" },
    139 => { abbr: "TB",  color: "#092C5C" },
    140 => { abbr: "TEX", color: "#003278" },
    141 => { abbr: "TOR", color: "#134A8E" },
    142 => { abbr: "MIN", color: "#002B5C" },
    143 => { abbr: "PHI", color: "#E81828" },
    144 => { abbr: "ATL", color: "#CE1141" },
    145 => { abbr: "CWS", color: "#27251F" },
    146 => { abbr: "MIA", color: "#00A3E0" },
    147 => { abbr: "NYY", color: "#003087" },
    158 => { abbr: "MIL", color: "#12284B" }
  }.freeze

  # ------------------------------------------------------------------ #
  # In-memory cache shared across all instances (class-level)
  # ------------------------------------------------------------------ #

  @@cache            = {}
  @@cache_timestamps = {}
  @@cache_ttls       = {}

  CACHE_TTLS = {
    standings_map:       5  * 60,   # hot internal call, 5 min
    standings:           5  * 60,
    all_teams:           60 * 60,   # very static
    schedule_today:      2  * 60,   # live game data
    schedule_past:       24 * 3600, # historical
    team_info:           10 * 60,
    player_info:         20 * 60,
    player_season_stats: 15 * 60,
    player_career_stats: 60 * 60,
    player_game_log:     10 * 60,
    transactions:        10 * 60,
  }.freeze

  def self.cache_fresh?(key)
    ts = @@cache_timestamps[key]
    ts && (Time.now.to_i - ts) < (@@cache_ttls[key] || 600)
  end

  def self.cache_get(key) = @@cache[key]

  def self.cache_set(key, value, ttl)
    @@cache[key]            = value
    @@cache_timestamps[key] = Time.now.to_i
    @@cache_ttls[key]       = ttl
  end

  def initialize
    @conn = Faraday.new(url: BASE_URL) do |f|
      f.request  :retry, max: 2, interval: 0.5
      f.response :raise_error
      f.options.timeout      = 15
      f.options.open_timeout = 8
    end

    @conn_v11 = Faraday.new(url: BASE_URL_V11) do |f|
      f.request  :retry, max: 2, interval: 0.5
      f.response :raise_error
      f.options.timeout      = 15
      f.options.open_timeout = 8
    end

    # No retries, short timeouts — for search-as-you-type UX
    @conn_fast = Faraday.new(url: BASE_URL) do |f|
      f.response :raise_error
      f.options.timeout      = 5
      f.options.open_timeout = 3
    end
  end

  # ------------------------------------------------------------------ #
  # Schedule
  # ------------------------------------------------------------------ #

  def season_schedule(season)
    cache_key = "season_schedule:#{season}"
    ttl       = season.to_i == Date.today.year ? 3600 : 24 * 3600
    return self.class.cache_get(cache_key) if self.class.cache_fresh?(cache_key)

    data  = get("schedule", { sportId: 1, season: season, gameType: "R", hydrate: "team" })
    games = (data["dates"] || []).flat_map do |d|
      date = d["date"]
      (d["games"] || []).filter_map do |g|
        game_pk = g["gamePk"]
        next unless game_pk
        home = g.dig("teams", "home", "team") || {}
        away = g.dig("teams", "away", "team") || {}
        status = g.dig("status", "abstractGameState")
        {
          game_pk:        game_pk,
          game_date:      date,
          home_team_id:   home["id"],
          away_team_id:   away["id"],
          home_team_abbr: home["abbreviation"],
          away_team_abbr: away["abbreviation"],
          home_team_name: home["name"],
          away_team_name: away["name"],
          status:         status,
          home_score:     status == "Final" ? g.dig("teams", "home", "score") : nil,
          away_score:     status == "Final" ? g.dig("teams", "away", "score") : nil,
        }
      end
    end

    self.class.cache_set(cache_key, games, ttl)
    games
  rescue StandardError => e
    { error: e.message }
  end

  def schedule(date)
    cache_key = "schedule:#{date}"
    ttl = date == Date.current.iso8601 ? CACHE_TTLS[:schedule_today] : CACHE_TTLS[:schedule_past]
    return self.class.cache_get(cache_key) if self.class.cache_fresh?(cache_key)

    data = get("schedule", {
      sportId: 1,
      date: date,
      hydrate: "probablePitcher,lineups,team,linescore,broadcasts"
    })

    standings = standings_map

    games = (data["dates"] || []).flat_map do |d|
      (d["games"] || []).map { |g| parse_game(g, standings) }
    end

    result = { date: date, games: games }
    self.class.cache_set(cache_key, result, ttl)
    result
  end

  # ------------------------------------------------------------------ #
  # All teams (directory)
  # ------------------------------------------------------------------ #

  def all_teams
    cache_key = "all_teams:#{Date.today.year}"
    return self.class.cache_get(cache_key) if self.class.cache_fresh?(cache_key)

    data = get("teams", { sportId: 1, season: Date.today.year, hydrate: "league,division" })
    standings = standings_map

    result = (data["teams"] || [])
      .select { |t| TEAM_META.key?(t["id"]) }
      .map do |t|
        id = t["id"]
        st = standings[id] || {}
        {
          id:         id,
          name:       t["name"],
          abbreviation: t["abbreviation"] || TEAM_META.dig(id, :abbr),
          location:   t["locationName"],
          teamName:   t["teamName"],
          league:     t.dig("league", "name"),
          leagueId:   t.dig("league", "id"),
          division:   t.dig("division", "name"),
          divisionId: t.dig("division", "id"),
          color:      TEAM_META.dig(id, :color) || "#333333",
          wins:       st[:wins],
          losses:     st[:losses],
          pct:        st[:pct]
        }
      end
      .sort_by { |t| [t[:leagueId].to_i, t[:divisionId].to_i, t[:name]] }
    self.class.cache_set(cache_key, result, CACHE_TTLS[:all_teams])
    result
  end

  def search_teams(query, limit: 10)
    q = query.to_s.strip.downcase
    return [] if q.blank?

    all_teams
      .select do |team|
        [team[:name], team[:abbreviation], team[:location], team[:teamName]].compact.any? { |value| value.to_s.downcase.include?(q) }
      end
      .first(limit)
      .map do |team|
        {
          id: team[:id],
          name: team[:name],
          abbreviation: team[:abbreviation],
          league: team[:league],
          division: team[:division]
        }
      end
  end

  # ------------------------------------------------------------------ #
  # Player search
  # ------------------------------------------------------------------ #

  def search_players(query, limit: 20)
    resp = @conn_fast.get("people/search", {
      names: query, sportId: 1, limit: limit,
      fields: "people,id,fullName,currentTeam,primaryPosition,active"
    })
    data = JSON.parse(resp.body)
    (data["people"] || []).map do |p|
      {
        id:       p["id"],
        name:     p["fullName"],
        team:     p.dig("currentTeam", "name"),
        teamId:   p.dig("currentTeam", "id"),
        position: p.dig("primaryPosition", "abbreviation"),
        active:   p.fetch("active", true)
      }
    end
  rescue Faraday::Error => e
    raise "MLB API error (people/search): #{e.message}"
  end

  # ------------------------------------------------------------------ #
  # Player info
  # ------------------------------------------------------------------ #

  def player_info(player_id)
    cache_key = "player_info:#{player_id}"
    return self.class.cache_get(cache_key) if self.class.cache_fresh?(cache_key)

    data = get("people/#{player_id}", {
      hydrate: "currentTeam,stats(type=season,season=2024,group=[hitting,pitching,fielding])"
    })

    p = (data["people"] || []).first
    return nil unless p

    team_id = p.dig("currentTeam", "id")
    metadata = PlayerMetadataService.fetch(
      player_id: p["id"],
      team_id: team_id,
      player_name: p["fullName"],
      season: Date.today.year
    )

    result = {
      id:           p["id"],
      name:         p["fullName"],
      firstName:    p["firstName"],
      lastName:     p["lastName"],
      number:       p["primaryNumber"],
      position:     p.dig("primaryPosition", "abbreviation"),
      positionName: p.dig("primaryPosition", "name"),
      team:         p.dig("currentTeam", "name"),
      teamId:       team_id,
      teamAbbrev:   p.dig("currentTeam", "abbreviation"),
      birthDate:    p["birthDate"],
      currentAge:   p["currentAge"],
      mlbDebutDate: p["mlbDebutDate"],
      height:       p["height"],
      weight:       p["weight"],
      batSide:      p.dig("batSide", "code"),
      pitchHand:    p.dig("pitchHand", "code"),
      active:       p.fetch("active", true),
      rosterStatus: player_roster_status(p["id"], team_id),
      headshotUrl:  "https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/#{p["id"]}/headshot/67/current",
      awards:       metadata[:error] ? [] : metadata[:awards],
      contract:     metadata[:error] ? nil : metadata[:contract]
    }
    self.class.cache_set(cache_key, result, CACHE_TTLS[:player_info])
    result
  end

  def player_roster_status(player_id, team_id)
    return nil unless team_id

    cache_key = "team_full_roster:#{team_id}"
    unless self.class.cache_fresh?(cache_key)
      data = get("teams/#{team_id}/roster", { rosterType: "fullRoster" })
      self.class.cache_set(cache_key, data, 30 * 60)
    end
    roster = self.class.cache_get(cache_key)
    entry = (roster["roster"] || []).find { |e| e.dig("person", "id") == player_id }
    entry&.dig("status", "description")
  rescue
    nil
  end

  # ------------------------------------------------------------------ #
  # Team info
  # ------------------------------------------------------------------ #

  def team_info(team_id)
    cache_key = "team_info:#{team_id}"
    return self.class.cache_get(cache_key) if self.class.cache_fresh?(cache_key)

    data = get("teams/#{team_id}", {
      hydrate: "league,division,venue"
    })

    team = (data["teams"] || []).first
    return nil unless team

    finance = TeamFinanceService.fetch(team_id: team["id"], season: Date.today.year)
    front_office = TeamFrontOfficeService.fetch(team_id: team["id"])

    result = {
      id: team["id"],
      name: team["name"],
      abbreviation: team["abbreviation"] || TEAM_META.dig(team["id"], :abbr),
      location: team["locationName"],
      teamName: team["teamName"],
      clubName: team["clubName"],
      firstYearOfPlay: team["firstYearOfPlay"],
      league: team.dig("league", "name"),
      division: team.dig("division", "name"),
      venue: team.dig("venue", "name"),
      color: TEAM_META.dig(team["id"], :color) || "#333333",
      standing: team_standing(team["id"]),
      seasonStats: team_season_stats(team["id"]),
      roster: team_roster(team["id"]),
      recentGames: team_recent_games(team["id"]),
      finance: finance[:error] ? nil : finance,
      frontOffice: front_office[:error] ? nil : front_office
    }
    self.class.cache_set(cache_key, result, CACHE_TTLS[:team_info])
    result
  end

  def team_season_stats(team_id, season: Date.today.year)
    cache_key = "team_season_stats:#{team_id}:#{season}"
    ttl = season.to_i == Date.today.year ? 15 * 60 : 24 * 3600
    return self.class.cache_get(cache_key) if self.class.cache_fresh?(cache_key)

    hitting = begin
      get("teams/#{team_id}/stats", { stats: "season", group: "hitting", season: season })
    rescue StandardError
      {}
    end
    pitching = begin
      get("teams/#{team_id}/stats", { stats: "season", group: "pitching", season: season })
    rescue StandardError
      {}
    end

    h = hitting.dig("stats", 0, "splits", 0, "stat") || {}
    p = pitching.dig("stats", 0, "splits", 0, "stat") || {}

    ranks = league_ranks_for_team(team_id.to_i, season)

    ab      = h["atBats"].to_i
    hits    = h["hits"].to_i
    hr      = h["homeRuns"].to_i
    so      = h["strikeOuts"].to_i
    bb      = h["baseOnBalls"].to_i
    ibb     = h["intentionalWalks"].to_i
    hbp     = h["hitByPitch"].to_i
    sf      = h["sacFlies"].to_i
    pa      = h["plateAppearances"].to_i
    doubles = h["doubles"].to_i
    triples = h["triples"].to_i
    singles = [hits - doubles - triples - hr, 0].max
    pa = (ab + bb + hbp + sf) if pa <= 0
    slg_f   = to_f(h["slg"])
    avg_f   = to_f(h["avg"])

    ip_str = p["inningsPitched"]
    ip     = innings_to_float(ip_str)
    p_hr   = p["homeRuns"].to_i
    p_bb   = p["baseOnBalls"].to_i
    p_hbp  = p["hitByPitch"].to_i
    p_so   = p["strikeOuts"].to_i
    p_bf   = p["battersFaced"].to_i

    result = {
      season: season,
      batting: {
        avg:   h["avg"],
        obp:   h["obp"],
        slg:   h["slg"],
        ops:   h["ops"],
        hr:    hr,
        r:     h["runs"],
        rbi:   h["rbi"],
        sb:    h["stolenBases"],
        hits:  hits,
        bb:    bb,
        so:    so,
        pa:    pa,
        g:     h["gamesPlayed"],
        iso:   slg_f && avg_f ? (slg_f - avg_f).round(3) : nil,
        babip: babip(hits, hr, ab, so, sf),
        kPct:  ratio(so, pa),
        bbPct: ratio(bb, pa),
        woba:  woba(singles, doubles, triples, hr, bb, ibb, hbp, ab, sf),
        ranks: ranks[:batting]
      },
      pitching: {
        era:         p["era"],
        whip:        p["whip"],
        so:          p_so,
        bb:          p_bb,
        hr:          p_hr,
        hits:        p["hits"],
        ip:          ip_str,
        sv:          p["saves"],
        svo:         p["saveOpportunities"],
        fip:         fip(p_hr, p_bb, p_hbp, p_so, ip),
        kPer9:       ip > 0 ? (p_so * 9.0 / ip).round(2) : nil,
        bbPer9:      ip > 0 ? (p_bb * 9.0 / ip).round(2) : nil,
        kMinusBbPct: ratio(p_so, p_bf) && ratio(p_bb, p_bf) ? (ratio(p_so, p_bf) - ratio(p_bb, p_bf)).round(3) : nil,
        ranks:       ranks[:pitching]
      }
    }
    self.class.cache_set(cache_key, result, ttl)
    result
  rescue StandardError => e
    { error: e.message }
  end

  def all_team_season_stats(season, group)
    cache_key = "all_team_season_stats:#{season}:#{group}"
    ttl = season.to_i == Date.today.year ? 30 * 60 : 24 * 3600
    return self.class.cache_get(cache_key) if self.class.cache_fresh?(cache_key)

    api_group = group.to_s == "batting" ? "hitting" : group
    splits = get("teams/stats", {
      stats: "season", group: api_group, sportId: 1, season: season
    }).dig("stats", 0, "splits") || []

    result = splits.filter_map do |split|
      team = split["team"] || {}
      id   = team["id"].to_i
      meta = TEAM_META[id]
      next unless meta

      info = Warehouse::TeamIngester::TEAM_INFO[id] || {}
      stat = split["stat"] || {}

      if group.to_s == "pitching"
        build_team_pitching_row(id, team["name"], meta, info, stat)
      else
        build_team_batting_row(id, team["name"], meta, info, stat)
      end
    end.sort_by { |r| r["Name"].to_s }

    self.class.cache_set(cache_key, result, ttl)
    result
  rescue StandardError => e
    { error: e.message }
  end

  def team_game_log(team_id, season)
    cache_key = "team_game_log:#{team_id}:#{season}"
    ttl = season.to_i == Date.today.year ? 5 * 60 : 24 * 3600
    return self.class.cache_get(cache_key) if self.class.cache_fresh?(cache_key)

    data = get("schedule", {
      sportId:  1,
      teamId:   team_id,
      season:   season,
      gameType: "R",
      hydrate:  "linescore,team"
    })

    games = (data["dates"] || []).flat_map { |d| d["games"] || [] }

    result = games.filter_map do |g|
      next unless g.dig("status", "abstractGameState") == "Final"

      away    = g.dig("teams", "away") || {}
      home    = g.dig("teams", "home") || {}
      is_home = home.dig("team", "id").to_i == team_id.to_i
      opp     = is_home ? away : home
      ls      = g["linescore"] || {}
      ls_t    = ls["teams"] || {}
      team_ls = ls_t[is_home ? "home" : "away"] || {}
      opp_ls  = ls_t[is_home ? "away" : "home"] || {}

      team_r = (team_ls["runs"] || (is_home ? home["score"] : away["score"])).to_i
      opp_r  = (opp_ls["runs"]  || (is_home ? away["score"] : home["score"])).to_i

      {
        gamePk:      g["gamePk"],
        date:        g["gameDate"]&.slice(0, 10),
        isHome:      is_home,
        opponent:    opp.dig("team", "abbreviation") || opp.dig("team", "name"),
        runsScored:  team_r,
        runsAllowed: opp_r,
        hits:        team_ls["hits"].to_i,
        won:         team_r > opp_r
      }
    end.sort_by { |g| g[:date].to_s }

    self.class.cache_set(cache_key, result, ttl)
    result
  rescue StandardError => e
    { error: e.message }
  end

  def team_history(team_id)
    cache_key = "team_history:#{team_id}"
    return self.class.cache_get(cache_key) if self.class.cache_fresh?(cache_key)

    hit_data = get("teams/#{team_id}/stats", { stats: "yearByYear", group: "hitting",  gameType: "R" })
    pit_data = get("teams/#{team_id}/stats", { stats: "yearByYear", group: "pitching", gameType: "R" })

    hit_by_year = {}
    (hit_data.dig("stats", 0, "splits") || []).each do |split|
      year = split["season"]
      next if year.blank?
      hit_by_year[year] = split["stat"] || {}
    end

    pit_by_year = {}
    (pit_data.dig("stats", 0, "splits") || []).each do |split|
      year = split["season"]
      next if year.blank?
      pit_by_year[year] = split["stat"] || {}
    end

    years = (hit_by_year.keys + pit_by_year.keys).uniq.sort.reverse

    result = years.filter_map do |year|
      h = hit_by_year[year] || {}
      p = pit_by_year[year] || {}
      next if h.empty? && p.empty?

      ab      = h["atBats"].to_i
      hits    = h["hits"].to_i
      hr      = h["homeRuns"].to_i
      so      = h["strikeOuts"].to_i
      bb      = h["baseOnBalls"].to_i
      ibb     = h["intentionalWalks"].to_i
      hbp     = h["hitByPitch"].to_i
      sf      = h["sacFlies"].to_i
      pa      = h["plateAppearances"].to_i
      pa = (ab + bb + hbp + sf) if pa <= 0
      doubles = h["doubles"].to_i
      triples = h["triples"].to_i
      singles = [hits - doubles - triples - hr, 0].max

      ip_str = p["inningsPitched"]
      ip     = innings_to_float(ip_str)
      p_hr   = p["homeRuns"].to_i
      p_bb   = p["baseOnBalls"].to_i
      p_hbp  = p["hitByPitch"].to_i
      p_so   = p["strikeOuts"].to_i
      p_bf   = p["battersFaced"].to_i

      {
        season: year,
        g:      h["gamesPlayed"],
        avg:    h["avg"],
        obp:    h["obp"],
        slg:    h["slg"],
        ops:    h["ops"],
        hr:     hr,
        r:      h["runs"],
        rbi:    h["rbi"],
        sb:     h["stolenBases"],
        bb:     bb,
        so:     so,
        woba:   woba(singles, doubles, triples, hr, bb, ibb, hbp, ab, sf),
        era:    p["era"],
        whip:   p["whip"],
        ip:     ip_str,
        sv:     p["saves"],
        pSo:    p_so,
        pBb:    p_bb,
        pHr:    p_hr,
        fip:    fip(p_hr, p_bb, p_hbp, p_so, ip),
        kPer9:  ip > 0 ? (p_so * 9.0 / ip).round(2) : nil,
        bbPer9: ip > 0 ? (p_bb * 9.0 / ip).round(2) : nil
      }
    end

    self.class.cache_set(cache_key, result, 60 * 60)
    result
  rescue StandardError => e
    { error: e.message }
  end

  # ------------------------------------------------------------------ #
  # Season stats (hitting, pitching, fielding)
  # ------------------------------------------------------------------ #

  def player_season_stats(player_id, season)
    cache_key = "player_season_stats:#{player_id}:#{season}"
    return self.class.cache_get(cache_key) if self.class.cache_fresh?(cache_key)

    data = get("people/#{player_id}/stats", {
      stats: "season",
      season: season,
      group: "hitting,pitching,fielding",
      gameType: "R"
    })

    result = { hitting: nil, pitching: nil, fielding: nil }
    (data["stats"] || []).each do |group|
      key   = group.dig("group", "displayName")&.downcase&.to_sym
      split = group.dig("splits", 0)
      result[key] = split["stat"] if key && split
    end
    self.class.cache_set(cache_key, result, CACHE_TTLS[:player_season_stats])
    result
  end

  # ------------------------------------------------------------------ #
  # Career (year-by-year) stats
  # ------------------------------------------------------------------ #

  def player_career_stats(player_id, group: "hitting")
    cache_key = "player_career_stats:#{player_id}:#{group}"
    return self.class.cache_get(cache_key) if self.class.cache_fresh?(cache_key)

    data = get("people/#{player_id}/stats", {
      stats: "yearByYear",
      group: group,
      gameType: "R"
    })

    result = (data["stats"] || []).flat_map do |sg|
      (sg["splits"] || []).filter_map do |split|
        next unless split.dig("sport", "id") == 1
        {
          season:     split["season"],
          age:        split["player"]&.dig("currentAge") || split["age"],
          teamAbbrev: split.dig("team", "abbreviation"),
          teamName:   split.dig("team", "name"),
        }.merge(split.fetch("stat", {}))
      end
    end
    self.class.cache_set(cache_key, result, CACHE_TTLS[:player_career_stats])
    result
  end

  # ------------------------------------------------------------------ #
  # Player game log
  # ------------------------------------------------------------------ #

  def player_game_log(player_id, season, group: "hitting", limit: 30)
    cache_key = "player_game_log:#{player_id}:#{season}:#{group}"
    return self.class.cache_get(cache_key) if self.class.cache_fresh?(cache_key)

    data = get("people/#{player_id}/stats", {
      stats: "gameLog",
      season: season,
      group: group,
      gameType: "R"
    })

    raw_games = data.dig("stats", 0, "splits") || []
    all_games = raw_games.filter_map do |split|
      next unless split.dig("sport", "id") == 1
      normalize_game_log_row(split, group)
    end.sort_by { |g| g[:date] || "" }.reverse

    capped_limit = [[limit.to_i, 10].max, 60].min

    result = {
      season: season,
      group: group,
      totalGames: all_games.length,
      games: all_games.first(capped_limit)
    }
    self.class.cache_set(cache_key, result, CACHE_TTLS[:player_game_log])
    result
  end

  # ------------------------------------------------------------------ #
  # Player projection baseline
  # ------------------------------------------------------------------ #

  def player_projection(player_id, season, group: "hitting", source: "steamer")
    source_key = %w[steamer zips].include?(source.to_s.downcase) ? source.to_s.downcase : "steamer"

    projected = projected_stat_line(player_id, season, group)
    previous = season_stat_line(player_id, season - 1, group)

    projections = source_key == "zips" ? blend_projection(projected, previous) : projected

    {
      season: season,
      group: group,
      source: source_key,
      gamesBaseline: projections["gamesPlayed"].to_i.positive? ? projections["gamesPlayed"].to_i : 162,
      projections: normalize_projection(projections, group),
      notes: source_key == "zips" ? "ZiPS-style blend of projected and prior season" : "Steamer-style projected baseline"
    }
  end

  # ------------------------------------------------------------------ #
  # Standings
  # ------------------------------------------------------------------ #

  def standings(season)
    cache_key = "standings:#{season}"
    return self.class.cache_get(cache_key) if self.class.cache_fresh?(cache_key)

    data = get("standings", {
      leagueId: "103,104",
      season: season,
      standingsType: "regularSeason",
      hydrate: "team,division,league"
    })

    result = (data["records"] || []).map do |record|
      division = record["division"] || {}
      league   = record["league"]   || {}
      teams    = (record["teamRecords"] || [])
                   .sort_by { |tr| tr["divisionRank"].to_i }
                   .map     { |tr| parse_team_record(tr) }

      {
        divisionId:   division["id"],
        divisionName: division["name"],
        leagueId:     league["id"],
        leagueName:   league["name"],
        teams:        teams
      }
    end.sort_by { |d| [d[:leagueId].to_i, d[:divisionName].to_s] }
    self.class.cache_set(cache_key, result, CACHE_TTLS[:standings])
    result
  end

  # ------------------------------------------------------------------ #
  # Play-by-play
  # ------------------------------------------------------------------ #

  # Returns the actual batting order and pitching staff for a completed game.
  # Cached on the first call; used to seed simulation lineups for real games.
  def game_lineup(game_pk)
    cache_key = "game_lineup:#{game_pk}"
    return self.class.cache_get(cache_key) if self.class.cache_fresh?(cache_key)

    data  = get("game/#{game_pk}/boxscore")
    teams = data["teams"] || {}

    result = {
      home: extract_lineup_from_boxscore(teams["home"]),
      away: extract_lineup_from_boxscore(teams["away"]),
    }
    self.class.cache_set(cache_key, result, 24 * 3600)
    result
  rescue StandardError => e
    { error: e.message }
  end

  def play_by_play(game_pk)
    data = get_v11("game/#{game_pk}/feed/live")
    plays_data = data.dig("liveData", "plays") || {}
    all_plays = plays_data["allPlays"] || []
    scoring_indices = (plays_data["scoringPlays"] || []).to_set

    completed = all_plays.each_with_index.filter_map do |play, idx|
      next unless play.dig("about", "isComplete")
      parse_play(play, scoring: scoring_indices.include?(idx))
    end

    {
      scoringPlays: completed.select { |p| p[:isScoring] }.reverse,
      otherPlays: completed.reject { |p| p[:isScoring] }.last(30).reverse
    }
  end

  # ------------------------------------------------------------------ #
  # Game details (advanced single-game metrics)
  # ------------------------------------------------------------------ #

  def game_details(game_pk)
    data = get_v11("game/#{game_pk}/feed/live")

    game_data   = data["gameData"] || {}
    live_data   = data["liveData"] || {}
    boxscore    = live_data["boxscore"] || {}
    linescore   = live_data["linescore"] || {}
    offense     = linescore["offense"] || {}
    defense     = linescore["defense"] || {}
    teams_meta  = game_data["teams"] || {}
    teams_box   = boxscore["teams"] || {}
    lines_teams = linescore["teams"] || {}

    away_meta = teams_meta["away"] || {}
    home_meta = teams_meta["home"] || {}
    away_box  = teams_box["away"] || {}
    home_box  = teams_box["home"] || {}

    away_team_batting = advanced_team_batting(away_box.dig("teamStats", "batting") || {})
    home_team_batting = advanced_team_batting(home_box.dig("teamStats", "batting") || {})
    away_team_pitching = advanced_team_pitching(away_box.dig("teamStats", "pitching") || {})
    home_team_pitching = advanced_team_pitching(home_box.dig("teamStats", "pitching") || {})

    {
      gamePk: game_pk,
      gameDate: game_data.dig("datetime", "dateTime"),
      status: game_data.dig("status", "detailedState"),
      abstractState: game_data.dig("status", "abstractGameState"),
      venue: game_data.dig("venue", "name"),
      gameContext: {
        inningHalf: linescore["inningHalf"],
        currentInning: linescore["currentInning"],
        count: {
          balls: linescore["balls"],
          strikes: linescore["strikes"],
          outs: linescore["outs"]
        },
        matchup: {
          atBat: {
            id: offense.dig("batter", "id"),
            name: offense.dig("batter", "fullName")
          },
          pitcher: {
            id: defense.dig("pitcher", "id"),
            name: defense.dig("pitcher", "fullName")
          }
        },
        bases: {
          first: offense["first"].present?,
          second: offense["second"].present?,
          third: offense["third"].present?
        },
        probablePitchers: {
          away: {
            id: game_data.dig("probablePitchers", "away", "id"),
            name: game_data.dig("probablePitchers", "away", "fullName")
          },
          home: {
            id: game_data.dig("probablePitchers", "home", "id"),
            name: game_data.dig("probablePitchers", "home", "fullName")
          }
        }
      },
      teams: {
        away: game_team(away_meta, lines_teams.dig("away", "runs")),
        home: game_team(home_meta, lines_teams.dig("home", "runs"))
      },
      advanced: {
        teamBatting: {
          away: away_team_batting,
          home: home_team_batting
        },
        teamPitching: {
          away: away_team_pitching,
          home: home_team_pitching
        },
        hitters: {
          away: hitter_impact(away_box["players"]),
          home: hitter_impact(home_box["players"])
        },
        pitching: {
          away: pitching_quality(away_box["players"], game_data.dig("probablePitchers", "away", "id")),
          home: pitching_quality(home_box["players"], game_data.dig("probablePitchers", "home", "id"))
        },
        edges: {
          discipline: {
            away: discipline_edge(away_team_batting[:kMinusBbPct], home_team_batting[:kMinusBbPct]),
            home: discipline_edge(home_team_batting[:kMinusBbPct], away_team_batting[:kMinusBbPct])
          },
          contactQuality: {
            away: nil,
            home: nil
          },
          runPrevention: {
            away: run_prevention_edge(away_team_pitching[:fip], home_team_pitching[:fip]),
            home: run_prevention_edge(home_team_pitching[:fip], away_team_pitching[:fip])
          }
        }
      },
      linescore: {
        innings: (linescore["innings"] || []).map do |inn|
          {
            num:  inn["num"],
            away: inn.dig("away", "runs"),
            home: inn.dig("home", "runs")
          }
        end,
        totals: {
          away: {
            r: lines_teams.dig("away", "runs"),
            h: lines_teams.dig("away", "hits"),
            e: lines_teams.dig("away", "errors")
          },
          home: {
            r: lines_teams.dig("home", "runs"),
            h: lines_teams.dig("home", "hits"),
            e: lines_teams.dig("home", "errors")
          }
        }
      },
      boxscore: {
        teamTotals: {
          away: team_boxscore_totals(away_box, lines_teams.dig("away")),
          home: team_boxscore_totals(home_box, lines_teams.dig("home"))
        },
        batting: {
          away: batting_boxscore(away_box["players"]),
          home: batting_boxscore(home_box["players"])
        },
        pitching: {
          away: pitching_boxscore(away_box["players"], game_data.dig("probablePitchers", "away", "id")),
          home: pitching_boxscore(home_box["players"], game_data.dig("probablePitchers", "home", "id"))
        }
      }
    }
  end

  # SC (Status Change) encodes IL placements, activations, and generic noise.
  # We parse those by description in normalize_transaction and drop the noise.
  TRANSACTION_ALLOWLIST = %w[
    CU OPT DES ACT TRD TR REL SFA SIG ASG RTN OUT CLW SE SC
    IL IL10 IL15 IL60 IL7
  ].freeze

  def transactions(team_id: nil, player_id: nil, start_date: nil, end_date: nil, limit: 50)
    cache_key = "transactions:#{team_id}:#{player_id}:#{start_date}:#{end_date}:#{limit}"
    return self.class.cache_get(cache_key) if self.class.cache_fresh?(cache_key)

    query = { sportId: 1, limit: limit.to_i.clamp(1, 500) }
    query[:teamId]    = team_id.to_i   if team_id.present?
    query[:playerId]  = player_id.to_i if player_id.present?
    query[:startDate] = start_date     if start_date.present?
    query[:endDate]   = end_date       if end_date.present?

    data = get('transactions', query)
    raw  = Array(data["transactions"])

    normalized = raw
      .select      { |t| TRANSACTION_ALLOWLIST.include?((t[:typeCode] || t["typeCode"]).to_s) }
      .filter_map  { |t| normalize_transaction(t) }
      .sort_by     { |t| [t[:date].to_s, t[:id].to_i] }
      .reverse

    result = { transactions: normalized }
    self.class.cache_set(cache_key, result, CACHE_TTLS[:transactions])
    result
  rescue => e
    { error: e.message }
  end

  def win_probability(game_pk)
    plays = get("game/#{game_pk}/winProbability")
    return { error: "No data", plays: [] } unless plays.is_a?(Array)

    plays.each_with_index.map do |play, idx|
      {
        index:              idx,
        inning:             play.dig("about", "inning"),
        halfInning:         play.dig("about", "halfInning"),
        homeWinProbability: play["homeTeamWinProbability"].to_f,
        description:        play.dig("result", "description").to_s.truncate(120)
      }
    end
  rescue StandardError => e
    { error: e.message, plays: [] }
  end

  private

  def extract_lineup_from_boxscore(team_data)
    players = (team_data || {})["players"] || {}

    # battingOrder is a string like "100", "200", ..., "900" for starters.
    # Sub-values ("101", "201") are pinch hitters; we include all who batted.
    batters = players.values
      .filter_map do |p|
        order = p["battingOrder"].to_i
        next unless order > 0
        [order, p.dig("person", "id").to_i]
      end
      .sort_by { |order, _| order }
      .map { |_, id| id }
      .uniq   # keep first appearance (starter) when a spot is substituted

    # All pitchers who threw at least one pitch, ordered by appearance (most IP first = SP first)
    pitchers = players.values
      .filter_map do |p|
        ip = innings_to_float(p.dig("stats", "pitching", "inningsPitched").to_s)
        next unless ip > 0
        [ip, p.dig("person", "id").to_i]
      end
      .sort_by { |ip, _| -ip }
      .map { |_, id| id }

    { batting_order: batters, pitcher_ids: pitchers }
  end

  def build_team_batting_row(id, name, meta, info, h)
    ab      = h["atBats"].to_i
    hits    = h["hits"].to_i
    hr      = h["homeRuns"].to_i
    so      = h["strikeOuts"].to_i
    bb      = h["baseOnBalls"].to_i
    ibb     = h["intentionalWalks"].to_i
    hbp     = h["hitByPitch"].to_i
    sf      = h["sacFlies"].to_i
    pa      = h["plateAppearances"].to_i
    doubles = h["doubles"].to_i
    triples = h["triples"].to_i
    singles = [hits - doubles - triples - hr, 0].max
    pa = (ab + bb + hbp + sf) if pa <= 0
    slg_f = to_f(h["slg"])
    avg_f = to_f(h["avg"])

    {
      "Name"     => name,
      "team_id"  => id,
      "Abbr"     => meta[:abbr],
      "League"   => info[:league],
      "Division" => info[:division],
      "G"        => h["gamesPlayed"].to_i,
      "PA"       => pa,
      "AB"       => ab,
      "H"        => hits,
      "2B"       => doubles,
      "3B"       => triples,
      "AVG"      => to_f(h["avg"]),
      "OBP"      => to_f(h["obp"]),
      "SLG"      => to_f(h["slg"]),
      "OPS"      => to_f(h["ops"]),
      "HR"       => hr,
      "R"        => h["runs"].to_i,
      "RBI"      => h["rbi"].to_i,
      "SB"       => h["stolenBases"].to_i,
      "BB"       => bb,
      "SO"       => so,
      "ISO"      => (slg_f && avg_f) ? (slg_f - avg_f).round(3) : nil,
      "BABIP"    => babip(hits, hr, ab, so, sf),
      "K%"       => pa > 0 ? (so.to_f / pa * 100).round(1) : nil,
      "BB%"      => pa > 0 ? (bb.to_f / pa * 100).round(1) : nil,
      "wOBA"     => woba(singles, doubles, triples, hr, bb, ibb, hbp, ab, sf)
    }
  end

  def build_team_pitching_row(id, name, meta, info, p)
    ip    = innings_to_float(p["inningsPitched"])
    p_hr  = p["homeRuns"].to_i
    p_bb  = p["baseOnBalls"].to_i
    p_hbp = p["hitByPitch"].to_i
    p_so  = p["strikeOuts"].to_i
    p_bf  = p["battersFaced"].to_i
    k_pct_val  = p_bf > 0 ? (p_so.to_f / p_bf * 100).round(1) : nil
    bb_pct_val = p_bf > 0 ? (p_bb.to_f / p_bf * 100).round(1) : nil

    {
      "Name"     => name,
      "team_id"  => id,
      "Abbr"     => meta[:abbr],
      "League"   => info[:league],
      "Division" => info[:division],
      "ERA"      => to_f(p["era"]),
      "WHIP"     => to_f(p["whip"]),
      "FIP"      => fip(p_hr, p_bb, p_hbp, p_so, ip),
      "K/9"      => ip > 0 ? (p_so * 9.0 / ip).round(1) : nil,
      "BB/9"     => ip > 0 ? (p_bb * 9.0 / ip).round(1) : nil,
      "K-BB%"    => k_pct_val && bb_pct_val ? (k_pct_val - bb_pct_val).round(1) : nil,
      "SO"       => p_so,
      "BB"       => p_bb,
      "HR"       => p_hr,
      "SV"       => p["saves"].to_i,
      "IP"       => ip,
      "K%"       => k_pct_val,
      "BB%"      => bb_pct_val
    }
  end

  def parse_team_record(tr)
    team = tr["team"] || {}
    id   = team["id"].to_i
    last_ten = (tr.dig("records", "splitRecords") || []).find { |r| r["type"] == "lastTen" }

    {
      teamId:                    id,
      teamName:                  team["name"],
      teamAbbr:                  TEAM_META.dig(id, :abbr) || team["abbreviation"],
      wins:                      tr["wins"].to_i,
      losses:                    tr["losses"].to_i,
      pct:                       tr.dig("leagueRecord", "pct"),
      gamesBack:                 tr["gamesBack"],
      wildCardGamesBack:         tr["wildCardGamesBack"],
      divisionRank:              tr["divisionRank"].to_i,
      wildCardRank:              tr["wildCardRank"].to_i,
      leagueRank:                tr["leagueRank"].to_i,
      streak:                    tr.dig("streak", "streakCode"),
      lastTen:                   last_ten ? "#{last_ten["wins"]}-#{last_ten["losses"]}" : nil,
      clinched:                  tr["clinched"] == true,
      eliminationNumber:         tr["eliminationNumber"],
      wildCardEliminationNumber: tr["wildCardEliminationNumber"]
    }
  end

  def standings_map
    cache_key = "standings_map:#{Date.today.year}"
    return self.class.cache_get(cache_key) if self.class.cache_fresh?(cache_key)

    data = get("standings", {
      leagueId: "103,104",
      season: Date.today.year,
      standingsType: "regularSeason",
      hydrate: "team,division,league"
    })
    map = {}
    (data["records"] || []).each do |record|
      (record["teamRecords"] || []).each do |tr|
        id = tr.dig("team", "id").to_i
        map[id] = {
          wins:                      tr["wins"].to_i,
          losses:                    tr["losses"].to_i,
          pct:                       tr.dig("leagueRecord", "pct"),
          gamesBack:                 tr["gamesBack"],
          wildCardGamesBack:         tr["wildCardGamesBack"],
          divisionRank:              tr["divisionRank"].to_i,
          wildCardRank:              tr["wildCardRank"].to_i,
          leagueRank:                tr["leagueRank"].to_i,
          streak:                    tr.dig("streak", "streakCode"),
          lastTen:                   (tr.dig("records", "splitRecords") || []).then { |r| r.find { |s| s["type"] == "lastTen" } }&.then { |l| "#{l["wins"]}-#{l["losses"]}" },
          clinched:                  tr["clinched"] == true,
          eliminationNumber:         tr["eliminationNumber"],
          wildCardEliminationNumber: tr["wildCardEliminationNumber"]
        }
      end
    end
    self.class.cache_set(cache_key, map, CACHE_TTLS[:standings_map])
    map
  rescue StandardError
    {}
  end

  def team_standing(team_id)
    standings_map[team_id.to_i] || {}
  rescue StandardError
    {}
  end

  def parse_play(play, scoring:)
    about   = play["about"] || {}
    result  = play["result"] || {}
    matchup = play["matchup"] || {}

    {
      inning:      about["inning"],
      halfInning:  about["halfInning"],
      isScoring:   scoring,
      event:       result["event"],
      description: result["description"],
      rbi:         result["rbi"].to_i,
      awayScore:   result["awayScore"],
      homeScore:   result["homeScore"],
      batter: {
        id:   matchup.dig("batter", "id"),
        name: matchup.dig("batter", "fullName")
      },
      pitcher: {
        id:   matchup.dig("pitcher", "id"),
        name: matchup.dig("pitcher", "fullName")
      }
    }
  end

  def normalize_game_log_row(split, group)
    stat = split["stat"] || {}

    row = {
      gamePk: split.dig("game", "gamePk"),
      date: split["date"],
      opponent: split.dig("opponent", "abbreviation") || split.dig("opponent", "name"),
      team: split.dig("team", "abbreviation") || split.dig("team", "name"),
      isHome: split["isHome"],
      isWin: split["isWin"],
      summary: stat["summary"]
    }

    if group.to_s == "pitching"
      row.merge({
        ip: stat["inningsPitched"],
        er: stat["earnedRuns"],
        h: stat["hits"],
        bb: stat["baseOnBalls"],
        so: stat["strikeOuts"],
        hr: stat["homeRuns"],
        era: stat["era"],
        whip: stat["whip"],
        kPer9: stat["strikeoutsPer9Inn"],
        bbPer9: stat["walksPer9Inn"]
      })
    else
      row.merge({
        ab: stat["atBats"],
        h: stat["hits"],
        hr: stat["homeRuns"],
        rbi: stat["rbi"],
        r: stat["runs"],
        bb: stat["baseOnBalls"],
        so: stat["strikeOuts"],
        sb: stat["stolenBases"],
        avg: stat["avg"],
        obp: stat["obp"],
        slg: stat["slg"],
        ops: stat["ops"]
      })
    end
  end

  def projected_stat_line(player_id, season, group)
    data = get("people/#{player_id}/stats", {
      stats: "projected",
      season: season,
      group: group,
      gameType: "R"
    })
    data.dig("stats", 0, "splits", 0, "stat") || {}
  end

  def season_stat_line(player_id, season, group)
    data = get("people/#{player_id}/stats", {
      stats: "season",
      season: season,
      group: group,
      gameType: "R"
    })
    data.dig("stats", 0, "splits", 0, "stat") || {}
  end

  def blend_projection(projected, previous)
    return projected if previous.empty?

    keys = (projected.keys + previous.keys).uniq
    keys.each_with_object({}) do |k, acc|
      pv = numeric_or_nil(projected[k])
      lv = numeric_or_nil(previous[k])
      acc[k] = if pv.nil?
        projected[k]
      elsif lv.nil?
        pv
      else
        ((pv * 0.65) + (lv * 0.35)).round(3)
      end
    end
  end

  def normalize_projection(stat, group)
    if group.to_s == "pitching"
      {
        gamesPlayed: to_i(stat["gamesPlayed"]),
        inningsPitched: to_f(stat["inningsPitched"]),
        strikeOuts: to_i(stat["strikeOuts"]),
        baseOnBalls: to_i(stat["baseOnBalls"]),
        wins: to_i(stat["wins"]),
        saves: to_i(stat["saves"]),
        era: to_f(stat["era"]),
        whip: to_f(stat["whip"])
      }
    else
      {
        gamesPlayed: to_i(stat["gamesPlayed"]),
        plateAppearances: to_i(stat["plateAppearances"]),
        homeRuns: to_i(stat["homeRuns"]),
        rbi: to_i(stat["rbi"]),
        stolenBases: to_i(stat["stolenBases"]),
        strikeOuts: to_i(stat["strikeOuts"]),
        baseOnBalls: to_i(stat["baseOnBalls"]),
        avg: to_f(stat["avg"]),
        obp: to_f(stat["obp"]),
        slg: to_f(stat["slg"]),
        ops: to_f(stat["ops"])
      }
    end
  end

  def numeric_or_nil(value)
    return nil if value.nil?
    str = value.to_s.strip
    return nil if str.empty?
    Float(str)
  rescue ArgumentError
    nil
  end

  def to_i(value)
    n = numeric_or_nil(value)
    n.nil? ? nil : n.round
  end

  def to_f(value)
    numeric_or_nil(value)
  end

  def game_team(team, score)
    id = team["id"]
    {
      id: id,
      name: team["name"],
      abbreviation: team["abbreviation"] || TEAM_META.dig(id, :abbr),
      color: TEAM_META.dig(id, :color) || "#333333",
      score: score
    }
  end

  def advanced_team_batting(stat)
    pa = stat["plateAppearances"].to_i
    ab = stat["atBats"].to_i
    h = stat["hits"].to_i
    doubles = stat["doubles"].to_i
    triples = stat["triples"].to_i
    hr = stat["homeRuns"].to_i
    bb = stat["baseOnBalls"].to_i
    ibb = stat["intentionalWalks"].to_i
    hbp = stat["hitByPitch"].to_i
    so = stat["strikeOuts"].to_i
    sf = stat["sacFlies"].to_i

    pa = (ab + bb + hbp + sf).to_i if pa <= 0
    singles = [h - doubles - triples - hr, 0].max

    {
      kPct: ratio(so, pa),
      bbPct: ratio(bb, pa),
      kMinusBbPct: ratio(so, pa) && ratio(bb, pa) ? (ratio(so, pa) - ratio(bb, pa)).round(3) : nil,
      babip: babip(h, hr, ab, so, sf),
      woba: woba(singles, doubles, triples, hr, bb, ibb, hbp, ab, sf),
      xwoba: nil,
      hardHitPct: nil,
      barrelPct: nil
    }
  end

  def advanced_team_pitching(stat)
    ip = innings_to_float(stat["inningsPitched"])
    hr = stat["homeRuns"].to_i
    bb = stat["baseOnBalls"].to_i
    hbp = stat["hitByPitch"].to_i
    so = stat["strikeOuts"].to_i
    bf = stat["battersFaced"].to_i

    {
      fip: fip(hr, bb, hbp, so, ip),
      xFip: nil,
      kMinusBbPct: ratio(so, bf) && ratio(bb, bf) ? (ratio(so, bf) - ratio(bb, bf)).round(3) : nil,
      cswPct: nil,
      whiffPct: nil,
      gbPct: nil,
      hardHitAllowedPct: nil
    }
  end

  def hitter_impact(players_hash)
    (players_hash || {}).values.filter_map do |player|
      stat = player.dig("stats", "batting") || {}
      pa = stat["plateAppearances"].to_i
      next if pa <= 0

      ab = stat["atBats"].to_i
      h = stat["hits"].to_i
      doubles = stat["doubles"].to_i
      triples = stat["triples"].to_i
      hr = stat["homeRuns"].to_i
      bb = stat["baseOnBalls"].to_i
      ibb = stat["intentionalWalks"].to_i
      hbp = stat["hitByPitch"].to_i
      sf = stat["sacFlies"].to_i
      so = stat["strikeOuts"].to_i
      singles = [h - doubles - triples - hr, 0].max

      k_pct = ratio(so, pa)
      bb_pct = ratio(bb, pa)

      {
        playerId: player.dig("person", "id"),
        playerName: player.dig("person", "fullName"),
        pa: pa,
        woba: woba(singles, doubles, triples, hr, bb, ibb, hbp, ab, sf),
        xwoba: nil,
        hardHitPct: nil,
        barrelPct: nil,
        wpa: nil,
        kMinusBbPct: k_pct && bb_pct ? (k_pct - bb_pct).round(3) : nil
      }
    end.sort_by { |h| [-(h[:woba] || -1.0), -h[:pa]] }.first(8)
  end

  def pitching_quality(players_hash, starter_id)
    rows = (players_hash || {}).values.filter_map do |player|
      stat = player.dig("stats", "pitching") || {}
      ip = innings_to_float(stat["inningsPitched"])
      next if ip <= 0

      bf = stat["battersFaced"].to_i
      so = stat["strikeOuts"].to_i
      bb = stat["baseOnBalls"].to_i
      hbp = stat["hitByPitch"].to_i
      hr = stat["homeRuns"].to_i
      ground_outs = stat["groundOuts"].to_i
      air_outs = stat["airOuts"].to_i
      k_pct = ratio(so, bf)
      bb_pct = ratio(bb, bf)

      {
        playerId: player.dig("person", "id"),
        playerName: player.dig("person", "fullName"),
        role: player.dig("person", "id") == starter_id ? "SP" : "RP",
        inningsPitched: stat["inningsPitched"],
        fip: fip(hr, bb, hbp, so, ip),
        xFip: nil,
        kMinusBbPct: k_pct && bb_pct ? (k_pct - bb_pct).round(3) : nil,
        cswPct: nil,
        whiffPct: nil,
        gbPct: ratio(ground_outs, ground_outs + air_outs),
        hardHitAllowedPct: nil
      }
    end

    rows.sort_by { |r| [r[:role] == "SP" ? 0 : 1, -innings_to_float(r[:inningsPitched])] }
  end

  def team_boxscore_totals(team_box, lines_team)
    batting = team_box.dig("teamStats", "batting") || {}
    pitching = team_box.dig("teamStats", "pitching") || {}

    {
      runs: lines_team&.dig("runs"),
      hits: lines_team&.dig("hits"),
      errors: lines_team&.dig("errors"),
      leftOnBase: lines_team&.dig("leftOnBase"),
      batting: {
        atBats: to_i(batting["atBats"]),
        hits: to_i(batting["hits"]),
        homeRuns: to_i(batting["homeRuns"]),
        rbi: to_i(batting["rbi"]),
        walks: to_i(batting["baseOnBalls"]),
        strikeOuts: to_i(batting["strikeOuts"]),
        avg: to_f(batting["avg"])
      },
      pitching: {
        inningsPitched: pitching["inningsPitched"],
        hits: to_i(pitching["hits"]),
        earnedRuns: to_i(pitching["earnedRuns"]),
        walks: to_i(pitching["baseOnBalls"]),
        strikeOuts: to_i(pitching["strikeOuts"]),
        homeRuns: to_i(pitching["homeRuns"]),
        era: to_f(pitching["era"])
      }
    }
  end

  def batting_boxscore(players_hash)
    (players_hash || {}).values.filter_map do |player|
      stat = player.dig("stats", "batting") || {}
      pa = stat["plateAppearances"].to_i
      next if pa <= 0

      {
        playerId: player.dig("person", "id"),
        playerName: player.dig("person", "fullName"),
        pa: pa,
        ab: to_i(stat["atBats"]),
        runs: to_i(stat["runs"]),
        hits: to_i(stat["hits"]),
        rbi: to_i(stat["rbi"]),
        walks: to_i(stat["baseOnBalls"]),
        strikeOuts: to_i(stat["strikeOuts"]),
        homeRuns: to_i(stat["homeRuns"]),
        avg: to_f(stat["avg"]),
        gameScore: batting_game_score(stat)
      }
    end.sort_by { |h| [-(h[:pa] || 0), -(h[:hits] || 0)] }
  end

  def pitching_boxscore(players_hash, starter_id)
    (players_hash || {}).values.filter_map do |player|
      stat = player.dig("stats", "pitching") || {}
      ip = innings_to_float(stat["inningsPitched"])
      next if ip <= 0

      {
        playerId: player.dig("person", "id"),
        playerName: player.dig("person", "fullName"),
        role: player.dig("person", "id") == starter_id ? "SP" : "RP",
        inningsPitched: stat["inningsPitched"],
        hits: to_i(stat["hits"]),
        earnedRuns: to_i(stat["earnedRuns"]),
        walks: to_i(stat["baseOnBalls"]),
        strikeOuts: to_i(stat["strikeOuts"]),
        homeRuns: to_i(stat["homeRuns"]),
        era: to_f(stat["era"]),
        gameScore: pitching_game_score(stat)
      }
    end.sort_by { |r| [r[:role] == "SP" ? 0 : 1, -innings_to_float(r[:inningsPitched])] }
  end

  def batting_game_score(stat)
    hits = stat["hits"].to_i
    hr = stat["homeRuns"].to_i
    rbi = stat["rbi"].to_i
    runs = stat["runs"].to_i
    bb = stat["baseOnBalls"].to_i
    so = stat["strikeOuts"].to_i
    sb = stat["stolenBases"].to_i

    (hits * 10) + (hr * 8) + (rbi * 4) + (runs * 3) + (bb * 2) + (sb * 2) - (so * 2)
  end

  def pitching_game_score(stat)
    ip = innings_to_float(stat["inningsPitched"])
    outs = (ip * 3).round
    hits = stat["hits"].to_i
    er = stat["earnedRuns"].to_i
    bb = stat["baseOnBalls"].to_i
    so = stat["strikeOuts"].to_i
    hr = stat["homeRuns"].to_i
    bonus_innings = [outs - 12, 0].max

    50 + outs + (bonus_innings * 2) + so - (hits * 2) - (er * 4) - bb - (hr * 2)
  end

  def ratio(num, den)
    return nil if den.to_f <= 0
    (num.to_f / den.to_f).round(3)
  end

  def babip(h, hr, ab, so, sf)
    den = ab.to_i - so.to_i - hr.to_i + sf.to_i
    return nil if den <= 0
    ((h.to_f - hr.to_f) / den).round(3)
  end

  def woba(singles, doubles, triples, hr, bb, ibb, hbp, ab, sf)
    ubb = bb.to_i - ibb.to_i
    den = ab.to_i + ubb + sf.to_i + hbp.to_i
    return nil if den <= 0

    num = (0.69 * ubb) +
          (0.72 * hbp.to_i) +
          (0.88 * singles.to_i) +
          (1.247 * doubles.to_i) +
          (1.578 * triples.to_i) +
          (2.031 * hr.to_i)

    (num / den).round(3)
  end

  def innings_to_float(ip)
    str = ip.to_s
    return 0.0 if str.empty?

    whole, partial = str.split(".")
    outs = partial.to_i
    whole.to_i + (outs / 3.0)
  end

  def fip(hr, bb, hbp, so, ip)
    return nil if ip.to_f <= 0
    (((13.0 * hr.to_i) + (3.0 * (bb.to_i + hbp.to_i)) - (2.0 * so.to_i)) / ip.to_f + FIP_CONSTANT).round(3)
  end

  def discipline_edge(team_k_minus_bb, opp_k_minus_bb)
    return nil if team_k_minus_bb.nil? || opp_k_minus_bb.nil?
    (opp_k_minus_bb - team_k_minus_bb).round(3)
  end

  def run_prevention_edge(team_fip, opp_fip)
    return nil if team_fip.nil? || opp_fip.nil?
    (opp_fip - team_fip).round(3)
  end

  # ------------------------------------------------------------------ #
  # Win probability timeline
  # ------------------------------------------------------------------ #

  def get(path, params = {})
    resp = @conn.get(path, params)
    JSON.parse(resp.body)
  rescue Faraday::Error => e
    raise "MLB API error (#{path}): #{e.message}"
  end

  def get_v11(path, params = {})
    resp = @conn_v11.get(path, params)
    JSON.parse(resp.body)
  rescue Faraday::Error => e
    raise "MLB API error (#{path}): #{e.message}"
  end

  def parse_game(g, standings = {})
    away = g.dig("teams", "away") || {}
    home = g.dig("teams", "home") || {}
    ls   = g["linescore"] || {}

    {
      gamePk:        g["gamePk"],
      gameDate:      g["gameDate"],
      status:        g.dig("status", "detailedState") || "Scheduled",
      abstractState: g.dig("status", "abstractGameState") || "Preview",
      venue:         g.dig("venue", "name"),
      away:          team_side(away, standings),
      home:          team_side(home, standings),
      awayProbable:  probable_pitcher(away),
      homeProbable:  probable_pitcher(home),
      currentInning: ls["currentInning"],
      inningHalf:    ls["inningHalf"]
    }
  end

  def team_roster(team_id)
    data = get("teams/#{team_id}/roster", {
      rosterType: "active",
      hydrate: "person(stats(type=season,group=[hitting,pitching],season=#{Date.current.year}))"
    })

    (data["roster"] || []).map do |entry|
      person = entry["person"] || {}
      stat = person_stats_snapshot(person)
      {
        id: person["id"],
        name: person["fullName"],
        headshotUrl: headshot_url(person["id"]),
        position: entry.dig("position", "abbreviation"),
        positionName: entry.dig("position", "name"),
        jerseyNumber: entry["jerseyNumber"],
        status: entry.dig("status", "description"),
        statSummary: stat
      }
    end.sort_by { |p| [p[:position].to_s, p[:name].to_s] }
  rescue StandardError
    []
  end
  public :team_roster

  def normalize_transaction(t)
    type_code   = (t[:typeCode]   || t["typeCode"]).to_s
    type_desc   = (t[:typeDesc]   || t["typeDesc"]).to_s
    description = (t[:description] || t["description"]).to_s
    return nil if type_code.blank?

    # Normalize aliases so the frontend only needs one set of codes
    type_code = 'TRD' if type_code == 'TR'   # Trade
    type_code = 'CU'  if type_code == 'SE'   # Selected / contract selected ≈ call-up

    # SC (Status Change) encodes IL placements and activations via description text.
    # Drop the generic "roster status changed" noise and remap real events.
    if type_code == 'SC'
      desc_lc = description.downcase
      if desc_lc.match?(/placed.+injured list|transferred.+injured list/)
        il_days = description[/(\d+)-day/i, 1]
        type_code = il_days ? "IL#{il_days}" : 'IL'
        type_desc = il_days ? "#{il_days}-Day IL" : 'Injured List'
      elsif desc_lc.match?(/activated|reinstated/)
        type_code = 'ACT'
        type_desc = 'Activated'
      else
        return nil
      end
    end

    person    = t[:person]    || t["person"]    || {}
    from_team = t[:fromTeam]  || t["fromTeam"]
    to_team   = t[:toTeam]    || t["toTeam"]

    person_id   = (person["id"]       || person[:id]).to_i
    person_name = (person["fullName"] || person[:fullName]).to_s.strip
    return nil if person_name.blank? || person_name == '0' || person_id == 0

    {
      id:          (t[:id] || t["id"]).to_i,
      type_code:   type_code,
      type_desc:   type_desc,
      description: description,
      date:        (t[:effectiveDate] || t["effectiveDate"] || t[:date] || t["date"]).to_s,
      person: {
        id:   (person["id"] || person[:id]).to_i,
        name: (person["fullName"] || person[:fullName]).to_s,
      },
      from_team: from_team.present? ? { id: (from_team["id"] || from_team[:id]).to_i, name: (from_team["name"] || from_team[:name]).to_s } : nil,
      to_team:   to_team.present?   ? { id: (to_team["id"]   || to_team[:id]).to_i,   name: (to_team["name"]   || to_team[:name]).to_s   } : nil,
    }
  end

  def person_stats_snapshot(person)
    hitting  = nil
    pitching = nil

    (person["stats"] || []).each do |stat_group|
      group_name = stat_group.dig("group", "displayName")&.downcase
      row = stat_group.dig("splits", 0, "stat") || {}
      next if row.empty?

      if group_name == "pitching" || (group_name.nil? && (row["inningsPitched"].present? || row["era"].present?))
        pitching = {
          group:          "pitching",
          games:          to_i(row["gamesPitched"] || row["gamesPlayed"]),
          inningsPitched: row["inningsPitched"],
          era:            to_f(row["era"]),
          whip:           to_f(row["whip"]),
          strikeOuts:     to_i(row["strikeOuts"])
        }
      elsif group_name == "hitting" || group_name.nil?
        hitting = {
          group:            "hitting",
          games:            to_i(row["gamesPlayed"]),
          plateAppearances: to_i(row["plateAppearances"]),
          avg:              to_f(row["avg"]),
          ops:              to_f(row["ops"]),
          homeRuns:         to_i(row["homeRuns"]),
          rbi:              to_i(row["rbi"])
        }
      end
    end

    { pitching: pitching, hitting: hitting }
  end

  def league_ranks_for_team(team_id, season)
    hit_splits = get("teams/stats", { stats: "season", group: "hitting",  sportId: 1, season: season })
                   .dig("stats", 0, "splits") || []
    pit_splits = get("teams/stats", { stats: "season", group: "pitching", sportId: 1, season: season })
                   .dig("stats", 0, "splits") || []

    batting_ranks  = compute_stat_ranks(hit_splits, team_id, {
      avg: ["avg",          :desc],
      obp: ["obp",          :desc],
      slg: ["slg",          :desc],
      ops: ["ops",          :desc],
      hr:  ["homeRuns",     :desc],
      r:   ["runs",         :desc],
      rbi: ["rbi",          :desc],
      sb:  ["stolenBases",  :desc],
      bb:  ["baseOnBalls",  :desc],
      so:  ["strikeOuts",   :asc]
    })
    pitching_ranks = compute_stat_ranks(pit_splits, team_id, {
      era:  ["era",          :asc],
      whip: ["whip",         :asc],
      so:   ["strikeOuts",   :desc],
      bb:   ["baseOnBalls",  :asc],
      hr:   ["homeRuns",     :asc]
    })

    { batting: batting_ranks, pitching: pitching_ranks }
  rescue StandardError
    { batting: {}, pitching: {} }
  end

  def compute_stat_ranks(splits, team_id, stat_config)
    stat_config.each_with_object({}) do |(rank_key, config), acc|
      stat_key, direction = config
      sorted = splits.sort_by { |s| v = s.dig("stat", stat_key).to_f; direction == :asc ? v : -v }
      idx = sorted.index { |s| s.dig("team", "id").to_i == team_id }
      acc[rank_key] = idx ? idx + 1 : nil
    end
  end

  def headshot_url(player_id)
    return nil if player_id.blank?
    "https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/#{player_id}/headshot/67/current"
  end

  def team_recent_games(team_id)
    end_date = Date.current + 2
    start_date = end_date - 10

    data = get("schedule", {
      sportId: 1,
      teamId: team_id,
      startDate: start_date.iso8601,
      endDate: end_date.iso8601,
      hydrate: "linescore,team,probablePitcher"
    })

    games = (data["dates"] || []).flat_map { |d| d["games"] || [] }

    games.map do |g|
      away = g.dig("teams", "away") || {}
      home = g.dig("teams", "home") || {}
      is_home = home.dig("team", "id") == team_id
      team_side = is_home ? home : away
      opp_side = is_home ? away : home
      linescore = g["linescore"] || {}
      offense = linescore["offense"] || {}
      defense = linescore["defense"] || {}

      {
        gamePk: g["gamePk"],
        gameDate: g["gameDate"],
        status: g.dig("status", "detailedState"),
        abstractState: g.dig("status", "abstractGameState"),
        isHome: is_home,
        teamScore: team_side["score"],
        oppScore: opp_side["score"],
        inningHalf: linescore["inningHalf"],
        currentInning: linescore["currentInning"],
        count: {
          balls: linescore["balls"],
          strikes: linescore["strikes"],
          outs: linescore["outs"]
        },
        matchup: {
          atBat: {
            id: offense.dig("batter", "id"),
            name: offense.dig("batter", "fullName")
          },
          pitcher: {
            id: defense.dig("pitcher", "id"),
            name: defense.dig("pitcher", "fullName")
          }
        },
        bases: {
          first: offense["first"].present?,
          second: offense["second"].present?,
          third: offense["third"].present?
        },
        probable: {
          team: {
            id: team_side.dig("probablePitcher", "id"),
            name: team_side.dig("probablePitcher", "fullName")
          },
          opponent: {
            id: opp_side.dig("probablePitcher", "id"),
            name: opp_side.dig("probablePitcher", "fullName")
          }
        },
        opponent: {
          id: opp_side.dig("team", "id"),
          name: opp_side.dig("team", "name"),
          abbreviation: opp_side.dig("team", "abbreviation")
        }
      }
    end.sort_by { |game| game[:gameDate].to_s }.reverse.first(10)
  rescue StandardError
    []
  end

  def team_side(side, standings = {})
    t   = side["team"] || {}
    id  = t["id"]
    st  = standings[id] || {}
    {
      id:           id,
      name:         t["name"],
      abbreviation: t["abbreviation"] || TEAM_META.dig(id, :abbr),
      color:        TEAM_META.dig(id, :color) || "#333333",
      score:        side["score"],
      wins:         st[:wins],
      losses:       st[:losses]
    }
  end

  def probable_pitcher(side)
    pp = side["probablePitcher"]
    return nil unless pp&.any?
    {
      id:          pp["id"],
      name:        pp["fullName"],
      handedness:  pp.dig("pitchHand", "code")
    }
  end
end
