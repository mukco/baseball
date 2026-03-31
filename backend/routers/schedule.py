from datetime import date
from fastapi import APIRouter, HTTPException, Query
from services.mlb_api import get_schedule

router = APIRouter(tags=["schedule"])


@router.get("/schedule/today")
async def today():
    return await get_schedule(date.today().isoformat())


@router.get("/schedule/{game_date}")
async def by_date(game_date: str):
    try:
        return await get_schedule(game_date)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
