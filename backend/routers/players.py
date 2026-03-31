from fastapi import APIRouter, HTTPException, Query
from services.mlb_api import search_players, get_player_info

router = APIRouter(tags=["players"])


@router.get("/players/search")
async def search(q: str = Query(min_length=2)):
    try:
        return await search_players(q)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/players/{player_id}")
async def player_info(player_id: int):
    try:
        info = await get_player_info(player_id)
        if not info:
            raise HTTPException(status_code=404, detail="Player not found")
        return info
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
