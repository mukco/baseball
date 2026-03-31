# Thin wrapper around the free, public MLB Stats API.
# No authentication required. https://statsapi.mlb.com/api/v1
#
# All methods return plain Ruby hashes/arrays — controllers are
# responsible for serialising to JSON.
class MlbApiService
  BASE_URL = "https://statsapi.mlb.com/api/v1".freeze

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

  def initialize
    @conn = Faraday.new(url: BASE_URL) do |f|
      f.request  :retry, max: 2, interval: 0.5
      f.response :raise_error
      f.options.timeout      = 15
      f.options.open_timeout = 8
    end
  end

  # ------------------------------------------------------------------ #
  # Schedule
  # ------------------------------------------------------------------ #

  def schedule(date)
    data = get("/schedule", {
      sportId: 1,
      date: date,
      hydrate: "probablePitcher,lineups,team,linescore,broadcasts"
    })

    games = (data["dates"] || []).flat_map do |d|
      (d["games"] || []).map { |g| parse_game(g) }
    end

    { date: date, games: games }
  end

  # ------------------------------------------------------------------ #
  # Player search
  # ------------------------------------------------------------------ #

  def search_players(query, limit: 20)
    data = get("/people/search", {
      names: query,
      sportId: 1,
      limit: limit,
      fields: "people,id,fullName,currentTeam,primaryPosition,active"
    })

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
  end

  # ------------------------------------------------------------------ #
  # Player info
  # ------------------------------------------------------------------ #

  def player_info(player_id)
    data = get("/people/#{player_id}", {
      hydrate: "currentTeam,stats(type=season,season=2024,group=[hitting,pitching,fielding])"
    })

    p = (data["people"] || []).first
    return nil unless p

    team_id = p.dig("currentTeam", "id")

    {
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
      height:       p["height"],
      weight:       p["weight"],
      batSide:      p.dig("batSide", "code"),
      pitchHand:    p.dig("pitchHand", "code"),
      active:       p.fetch("active", true),
      headshotUrl:  "https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/#{p["id"]}/headshot/67/current"
    }
  end

  # ------------------------------------------------------------------ #
  # Season stats (hitting, pitching, fielding)
  # ------------------------------------------------------------------ #

  def player_season_stats(player_id, season)
    data = get("/people/#{player_id}/stats", {
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
    result
  end

  # ------------------------------------------------------------------ #
  # Career (year-by-year) stats
  # ------------------------------------------------------------------ #

  def player_career_stats(player_id, group: "hitting")
    data = get("/people/#{player_id}/stats", {
      stats: "yearByYear",
      group: group,
      gameType: "R"
    })

    (data["stats"] || []).flat_map do |sg|
      (sg["splits"] || []).filter_map do |split|
        next unless split.dig("sport", "id") == 1
        { season: split["season"] }.merge(split.fetch("stat", {}))
      end
    end
  end

  private

  def get(path, params = {})
    resp = @conn.get(path, params)
    JSON.parse(resp.body)
  rescue Faraday::Error => e
    raise "MLB API error (#{path}): #{e.message}"
  end

  def parse_game(g)
    away = g.dig("teams", "away") || {}
    home = g.dig("teams", "home") || {}
    ls   = g["linescore"] || {}

    {
      gamePk:        g["gamePk"],
      gameDate:      g["gameDate"],
      status:        g.dig("status", "detailedState") || "Scheduled",
      abstractState: g.dig("status", "abstractGameState") || "Preview",
      venue:         g.dig("venue", "name"),
      away:          team_side(away),
      home:          team_side(home),
      awayProbable:  probable_pitcher(away),
      homeProbable:  probable_pitcher(home),
      currentInning: ls["currentInning"],
      inningHalf:    ls["inningHalf"]
    }
  end

  def team_side(side)
    t  = side["team"] || {}
    id = t["id"]
    {
      id:           id,
      name:         t["name"],
      abbreviation: t["abbreviation"] || TEAM_META.dig(id, :abbr),
      color:        TEAM_META.dig(id, :color) || "#333333",
      score:        side["score"]
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
