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
  end

  # ------------------------------------------------------------------ #
  # Schedule
  # ------------------------------------------------------------------ #

  def schedule(date)
    data = get("schedule", {
      sportId: 1,
      date: date,
      hydrate: "probablePitcher,lineups,team,linescore,broadcasts"
    })

    standings = standings_map

    games = (data["dates"] || []).flat_map do |d|
      (d["games"] || []).map { |g| parse_game(g, standings) }
    end

    { date: date, games: games }
  end

  # ------------------------------------------------------------------ #
  # All teams (directory)
  # ------------------------------------------------------------------ #

  def all_teams
    data = get("teams", { sportId: 1, season: Date.today.year, hydrate: "league,division" })
    standings = standings_map

    (data["teams"] || [])
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
  end

  # ------------------------------------------------------------------ #
  # Player search
  # ------------------------------------------------------------------ #

  def search_players(query, limit: 20)
    data = get("people/search", {
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
    data = get("people/#{player_id}", {
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
  # Team info
  # ------------------------------------------------------------------ #

  def team_info(team_id)
    data = get("teams/#{team_id}", {
      hydrate: "league,division,venue"
    })

    team = (data["teams"] || []).first
    return nil unless team

    {
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
      recentGames: team_recent_games(team["id"])
    }
  end

  def team_season_stats(team_id)
    season = Date.today.year
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

    {
      batting: {
        avg:   h["avg"],
        obp:   h["obp"],
        slg:   h["slg"],
        ops:   h["ops"],
        hr:    h["homeRuns"],
        r:     h["runs"],
        rbi:   h["rbi"],
        sb:    h["stolenBases"],
        hits:  h["hits"],
        bb:    h["baseOnBalls"],
        so:    h["strikeOuts"],
        ranks: ranks[:batting]
      },
      pitching: {
        era:   p["era"],
        whip:  p["whip"],
        so:    p["strikeOuts"],
        bb:    p["baseOnBalls"],
        hr:    p["homeRuns"],
        hits:  p["hits"],
        ip:    p["inningsPitched"],
        sv:    p["saves"],
        svo:   p["saveOpportunities"],
        ranks: ranks[:pitching]
      }
    }
  rescue StandardError
    {}
  end

  # ------------------------------------------------------------------ #
  # Season stats (hitting, pitching, fielding)
  # ------------------------------------------------------------------ #

  def player_season_stats(player_id, season)
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
    result
  end

  # ------------------------------------------------------------------ #
  # Career (year-by-year) stats
  # ------------------------------------------------------------------ #

  def player_career_stats(player_id, group: "hitting")
    data = get("people/#{player_id}/stats", {
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

  # ------------------------------------------------------------------ #
  # Player game log
  # ------------------------------------------------------------------ #

  def player_game_log(player_id, season, group: "hitting", limit: 30)
    data = get("people/#{player_id}/stats", {
      stats: "gameLog",
      season: season,
      group: group,
      gameType: "R"
    })

    raw_games = data.dig("stats", 0, "splits") || []
    games = raw_games.filter_map do |split|
      next unless split.dig("sport", "id") == 1
      normalize_game_log_row(split, group)
    end.sort_by { |g| g[:date] || "" }.reverse

    capped_limit = [[limit.to_i, 10].max, 60].min

    {
      season: season,
      group: group,
      totalGames: games.length,
      games: games.first(capped_limit)
    }
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
    data = get("standings", {
      leagueId: "103,104",
      season: season,
      standingsType: "regularSeason",
      hydrate: "team,division,league"
    })

    (data["records"] || []).map do |record|
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
  end

  # ------------------------------------------------------------------ #
  # Play-by-play
  # ------------------------------------------------------------------ #

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
    data = get("standings", {
      leagueId: "103,104",
      season: Date.today.year,
      standingsType: "regularSeason",
      hydrate: "team"
    })
    map = {}
    (data["records"] || []).each do |record|
      (record["teamRecords"] || []).each do |tr|
        id = tr.dig("team", "id").to_i
        map[id] = { wins: tr["wins"].to_i, losses: tr["losses"].to_i, pct: tr.dig("leagueRecord", "pct") }
      end
    end
    map
  rescue StandardError
    {}
  end

  def team_standing(team_id)
    data = get("standings", {
      leagueId: "103,104",
      season: Date.today.year,
      standingsType: "regularSeason",
      hydrate: "team,division,league"
    })

    (data["records"] || []).each do |record|
      (record["teamRecords"] || []).each do |tr|
        return parse_team_record(tr) if tr.dig("team", "id").to_i == team_id.to_i
      end
    end

    {}
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

  def person_stats_snapshot(person)
    hitting  = nil
    pitching = nil

    (person["stats"] || []).each do |stat_group|
      row = stat_group.dig("splits", 0, "stat") || {}
      next if row.empty?

      if row["inningsPitched"].present? || row["era"].present?
        pitching = {
          group:          "pitching",
          games:          to_i(row["gamesPitched"] || row["gamesPlayed"]),
          inningsPitched: row["inningsPitched"],
          era:            to_f(row["era"]),
          whip:           to_f(row["whip"]),
          strikeOuts:     to_i(row["strikeOuts"])
        }
      else
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
      avg: ["avg",        :desc],
      obp: ["obp",        :desc],
      ops: ["ops",        :desc],
      hr:  ["homeRuns",   :desc],
      r:   ["runs",       :desc]
    })
    pitching_ranks = compute_stat_ranks(pit_splits, team_id, {
      era:  ["era",        :asc],
      whip: ["whip",       :asc],
      so:   ["strikeOuts", :desc]
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
