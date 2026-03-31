"""
MLB Stats API service — wraps the free, public statsapi.mlb.com endpoints.
No auth key required.
"""
import httpx
from datetime import date, timedelta
from functools import lru_cache
import asyncio

MLB_BASE = "https://statsapi.mlb.com/api/v1"
TIMEOUT = 15.0

# -------------------------------------------------------------------
# Helpers
# -------------------------------------------------------------------

async def _get(path: str, params: dict | None = None) -> dict:
    url = f"{MLB_BASE}{path}"
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        r = await client.get(url, params=params)
        r.raise_for_status()
        return r.json()


# -------------------------------------------------------------------
# Schedule
# -------------------------------------------------------------------

async def get_schedule(game_date: str) -> dict:
    """Return games for a given date (YYYY-MM-DD)."""
    data = await _get(
        "/schedule",
        params={
            "sportId": 1,
            "date": game_date,
            "hydrate": "probablePitcher,lineups,team,linescore,broadcasts",
        },
    )

    games = []
    for date_entry in data.get("dates", []):
        for g in date_entry.get("games", []):
            games.append(_parse_game(g))

    return {"date": game_date, "games": games}


def _parse_game(g: dict) -> dict:
    teams = g.get("teams", {})
    away = teams.get("away", {})
    home = teams.get("home", {})

    def pitcher(side):
        pp = side.get("probablePitcher", {})
        if not pp:
            return None
        return {"id": pp.get("id"), "name": pp.get("fullName"), "handedness": pp.get("pitchHand", {}).get("code")}

    def team_info(side):
        t = side.get("team", {})
        return {
            "id": t.get("id"),
            "name": t.get("name"),
            "abbreviation": t.get("abbreviation", ""),
            "score": side.get("score"),
        }

    linescore = g.get("linescore", {})

    return {
        "gamePk": g.get("gamePk"),
        "gameDate": g.get("gameDate"),
        "status": g.get("status", {}).get("detailedState", "Scheduled"),
        "abstractState": g.get("status", {}).get("abstractGameState", "Preview"),
        "venue": g.get("venue", {}).get("name"),
        "away": team_info(away),
        "home": team_info(home),
        "awayProbable": pitcher(away),
        "homeProbable": pitcher(home),
        "currentInning": linescore.get("currentInning"),
        "inningHalf": linescore.get("inningHalf"),
    }


# -------------------------------------------------------------------
# Player search
# -------------------------------------------------------------------

async def search_players(query: str, limit: int = 20) -> list[dict]:
    if not query or len(query) < 2:
        return []
    data = await _get(
        "/people/search",
        params={"names": query, "sportId": 1, "limit": limit, "fields": "people,id,fullName,currentTeam,primaryPosition,active"},
    )
    results = []
    for p in data.get("people", []):
        results.append({
            "id": p.get("id"),
            "name": p.get("fullName"),
            "team": p.get("currentTeam", {}).get("name"),
            "teamId": p.get("currentTeam", {}).get("id"),
            "position": p.get("primaryPosition", {}).get("abbreviation"),
            "active": p.get("active", True),
        })
    return results


# -------------------------------------------------------------------
# Player info
# -------------------------------------------------------------------

async def get_player_info(player_id: int) -> dict:
    data = await _get(
        f"/people/{player_id}",
        params={"hydrate": "currentTeam,stats(type=season,season=2024,group=[hitting,pitching,fielding])"},
    )
    people = data.get("people", [{}])
    if not people:
        return {}
    p = people[0]

    return {
        "id": p.get("id"),
        "name": p.get("fullName"),
        "firstName": p.get("firstName"),
        "lastName": p.get("lastName"),
        "number": p.get("primaryNumber"),
        "position": p.get("primaryPosition", {}).get("abbreviation"),
        "positionName": p.get("primaryPosition", {}).get("name"),
        "team": p.get("currentTeam", {}).get("name"),
        "teamId": p.get("currentTeam", {}).get("id"),
        "teamAbbrev": p.get("currentTeam", {}).get("abbreviation", ""),
        "birthDate": p.get("birthDate"),
        "height": p.get("height"),
        "weight": p.get("weight"),
        "batSide": p.get("batSide", {}).get("code"),
        "pitchHand": p.get("pitchHand", {}).get("code"),
        "active": p.get("active", True),
        "headshotUrl": f"https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/{p.get('id')}/headshot/67/current",
    }


# -------------------------------------------------------------------
# Standard stats from MLB API
# -------------------------------------------------------------------

async def get_player_stats(player_id: int, season: int = 2024) -> dict:
    data = await _get(
        f"/people/{player_id}/stats",
        params={
            "stats": "season",
            "season": season,
            "group": "hitting,pitching,fielding",
            "gameType": "R",
        },
    )

    result = {"hitting": None, "pitching": None, "fielding": None}
    for stat_group in data.get("stats", []):
        group = stat_group.get("group", {}).get("displayName", "").lower()
        splits = stat_group.get("splits", [])
        if splits:
            result[group] = splits[0].get("stat", {})
    return result


async def get_player_career_stats(player_id: int, group: str = "hitting") -> list[dict]:
    data = await _get(
        f"/people/{player_id}/stats",
        params={"stats": "yearByYear", "group": group, "gameType": "R"},
    )
    seasons = []
    for stat_group in data.get("stats", []):
        for split in stat_group.get("splits", []):
            if split.get("sport", {}).get("id") == 1:
                row = {"season": split.get("season")}
                row.update(split.get("stat", {}))
                seasons.append(row)
    return seasons
