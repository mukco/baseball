from fastapi import APIRouter, HTTPException, Query
from services.mlb_api import get_player_stats, get_player_career_stats
from services.statcast import (
    get_pitcher_statcast,
    get_batter_statcast,
    get_batting_leaderboard,
    get_pitching_leaderboard,
)

router = APIRouter(tags=["stats"])


@router.get("/stats/{player_id}/season")
async def season_stats(player_id: int, season: int = Query(default=2024)):
    try:
        return await get_player_stats(player_id, season)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/stats/{player_id}/career")
async def career_stats(player_id: int, group: str = Query(default="hitting")):
    try:
        return await get_player_career_stats(player_id, group)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/stats/{player_id}/statcast/pitching")
async def statcast_pitching(player_id: int, season: int = Query(default=2024)):
    try:
        return await get_pitcher_statcast(player_id, season)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/stats/{player_id}/statcast/batting")
async def statcast_batting(player_id: int, season: int = Query(default=2024)):
    try:
        return await get_batter_statcast(player_id, season)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/leaderboards/batting")
async def batting_leaders(season: int = Query(default=2024), min_pa: int = Query(default=100)):
    return await get_batting_leaderboard(season, min_pa)


@router.get("/leaderboards/pitching")
async def pitching_leaders(season: int = Query(default=2024), min_ip: int = Query(default=30)):
    return await get_pitching_leaderboard(season, min_ip)
