"""
Statcast / pybaseball service.
Runs synchronous pybaseball calls in a thread pool to avoid blocking FastAPI.
Results are cached per player + season to avoid hammering the API.
"""
import asyncio
import functools
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from typing import Any

import pandas as pd

_executor = ThreadPoolExecutor(max_workers=4)
_cache: dict[str, Any] = {}


def _run_sync(fn, *args, **kwargs):
    return fn(*args, **kwargs)


async def _run_in_thread(fn, *args, **kwargs):
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_executor, functools.partial(fn, *args, **kwargs))


# -------------------------------------------------------------------
# Statcast pitcher
# -------------------------------------------------------------------

async def get_pitcher_statcast(player_id: int, season: int = 2024) -> dict:
    cache_key = f"pitcher_{player_id}_{season}"
    if cache_key in _cache:
        return _cache[cache_key]

    try:
        from pybaseball import statcast_pitcher
        start = f"{season}-03-01"
        end = f"{season}-11-30"
        df: pd.DataFrame = await _run_in_thread(statcast_pitcher, start, end, player_id)
        result = _aggregate_pitcher(df)
    except Exception as e:
        result = {"error": str(e), "pitches": [], "summary": {}}

    _cache[cache_key] = result
    return result


def _aggregate_pitcher(df: pd.DataFrame) -> dict:
    if df is None or df.empty:
        return {"pitches": [], "summary": {}}

    df = df.dropna(subset=["pitch_type"])

    # Pitch mix and averages by type
    pitch_groups = df.groupby("pitch_type")
    total = len(df)

    pitch_types = []
    for ptype, group in pitch_groups:
        name = group["pitch_name"].iloc[0] if "pitch_name" in group.columns else ptype
        usage = len(group) / total * 100

        avg_velo = group["release_speed"].mean() if "release_speed" in group.columns else None
        avg_spin = group["release_spin_rate"].mean() if "release_spin_rate" in group.columns else None
        avg_pfx_x = group["pfx_x"].mean() * 12 if "pfx_x" in group.columns else None  # convert to inches
        avg_pfx_z = group["pfx_z"].mean() * 12 if "pfx_z" in group.columns else None

        # Plate discipline
        swings = group[group["description"].isin(["swinging_strike", "swinging_strike_blocked", "foul", "foul_tip", "hit_into_play", "hit_into_play_no_out", "hit_into_play_score"])] if "description" in group.columns else group.iloc[0:0]
        whiffs = group[group["description"].isin(["swinging_strike", "swinging_strike_blocked"])] if "description" in group.columns else group.iloc[0:0]
        whiff_rate = len(whiffs) / len(swings) * 100 if len(swings) > 0 else None

        pitch_types.append({
            "type": ptype,
            "name": name,
            "usage": round(usage, 1),
            "avgVelo": round(float(avg_velo), 1) if avg_velo is not None and not pd.isna(avg_velo) else None,
            "avgSpin": round(float(avg_spin), 0) if avg_spin is not None and not pd.isna(avg_spin) else None,
            "hBreak": round(float(avg_pfx_x), 1) if avg_pfx_x is not None and not pd.isna(avg_pfx_x) else None,
            "vBreak": round(float(avg_pfx_z), 1) if avg_pfx_z is not None and not pd.isna(avg_pfx_z) else None,
            "whiffRate": round(float(whiff_rate), 1) if whiff_rate is not None and not pd.isna(whiff_rate) else None,
            "count": len(group),
        })

    # Overall summary
    summary = {}
    if "release_speed" in df.columns:
        ff = df[df["pitch_type"].isin(["FF", "SI"])]
        summary["avgFastballVelo"] = round(float(ff["release_speed"].mean()), 1) if not ff.empty and not pd.isna(ff["release_speed"].mean()) else None
    if "estimated_woba_using_speedangle" in df.columns:
        summary["xwOBA"] = round(float(df["estimated_woba_using_speedangle"].mean()), 3) if not pd.isna(df["estimated_woba_using_speedangle"].mean()) else None
    if "launch_speed" in df.columns:
        balls_in_play = df.dropna(subset=["launch_speed"])
        if not balls_in_play.empty:
            summary["avgExitVelo"] = round(float(balls_in_play["launch_speed"].mean()), 1)
            summary["hardHitPct"] = round(float((balls_in_play["launch_speed"] >= 95).mean() * 100), 1)

    # Movement data for chart (sample)
    movement_data = []
    sample = df.dropna(subset=["pfx_x", "pfx_z", "pitch_type"])
    if len(sample) > 500:
        sample = sample.sample(500, random_state=42)
    for _, row in sample.iterrows():
        movement_data.append({
            "type": row["pitch_type"],
            "name": row.get("pitch_name", row["pitch_type"]),
            "hBreak": round(float(row["pfx_x"]) * 12, 1),
            "vBreak": round(float(row["pfx_z"]) * 12, 1),
        })

    return {
        "pitchTypes": sorted(pitch_types, key=lambda x: x["usage"], reverse=True),
        "movementData": movement_data,
        "summary": summary,
        "totalPitches": total,
    }


# -------------------------------------------------------------------
# Statcast batter
# -------------------------------------------------------------------

async def get_batter_statcast(player_id: int, season: int = 2024) -> dict:
    cache_key = f"batter_{player_id}_{season}"
    if cache_key in _cache:
        return _cache[cache_key]

    try:
        from pybaseball import statcast_batter
        start = f"{season}-03-01"
        end = f"{season}-11-30"
        df: pd.DataFrame = await _run_in_thread(statcast_batter, start, end, player_id)
        result = _aggregate_batter(df)
    except Exception as e:
        result = {"error": str(e), "summary": {}, "sprayData": []}

    _cache[cache_key] = result
    return result


def _aggregate_batter(df: pd.DataFrame) -> dict:
    if df is None or df.empty:
        return {"summary": {}, "sprayData": []}

    summary = {}

    bip = df.dropna(subset=["launch_speed"])
    if not bip.empty:
        summary["avgExitVelo"] = round(float(bip["launch_speed"].mean()), 1)
        summary["maxExitVelo"] = round(float(bip["launch_speed"].max()), 1)
        summary["hardHitPct"] = round(float((bip["launch_speed"] >= 95).mean() * 100), 1)

        bip_angle = bip.dropna(subset=["launch_angle"])
        if not bip_angle.empty:
            summary["avgLaunchAngle"] = round(float(bip_angle["launch_angle"].mean()), 1)
            summary["sweetSpotPct"] = round(
                float(bip_angle["launch_angle"].between(8, 32).mean() * 100), 1
            )
            # Barrels: exit velo >= 98 AND launch angle 26-30, etc (simplified)
            barrels = bip_angle[
                (bip_angle["launch_speed"] >= 98) & (bip_angle["launch_angle"].between(26, 30))
            ]
            summary["barrelPct"] = round(float(len(barrels) / len(bip_angle) * 100), 1)

    if "estimated_ba_using_speedangle" in df.columns:
        xba_col = df["estimated_ba_using_speedangle"].dropna()
        if not xba_col.empty:
            summary["xBA"] = round(float(xba_col.mean()), 3)

    if "estimated_woba_using_speedangle" in df.columns:
        xwoba_col = df["estimated_woba_using_speedangle"].dropna()
        if not xwoba_col.empty:
            summary["xwOBA"] = round(float(xwoba_col.mean()), 3)

    if "sprint_speed" in df.columns:
        ss_col = df["sprint_speed"].dropna()
        if not ss_col.empty:
            summary["sprintSpeed"] = round(float(ss_col.mean()), 1)

    # Spray chart data (hc_x, hc_y are hit coordinates on field)
    spray_data = []
    hits = df.dropna(subset=["hc_x", "hc_y"]) if "hc_x" in df.columns and "hc_y" in df.columns else pd.DataFrame()
    if not hits.empty:
        if len(hits) > 300:
            hits = hits.sample(300, random_state=42)
        for _, row in hits.iterrows():
            spray_data.append({
                "x": round(float(row["hc_x"]), 1),
                "y": round(float(row["hc_y"]), 1),
                "result": row.get("events", "unknown"),
                "exitVelo": round(float(row["launch_speed"]), 1) if not pd.isna(row.get("launch_speed", float("nan"))) else None,
            })

    return {"summary": summary, "sprayData": spray_data}


# -------------------------------------------------------------------
# FanGraphs / season leaderboards
# -------------------------------------------------------------------

async def get_batting_leaderboard(season: int = 2024, min_pa: int = 100) -> list[dict]:
    cache_key = f"bat_leaders_{season}_{min_pa}"
    if cache_key in _cache:
        return _cache[cache_key]
    try:
        from pybaseball import batting_stats
        df = await _run_in_thread(batting_stats, season, season, qual=min_pa)
        df = df.rename(columns={"playerid": "fangraphsId"})
        key_cols = [c for c in ["Name", "Team", "G", "PA", "HR", "RBI", "SB", "AVG", "OBP", "SLG", "OPS", "wRC+", "WAR", "BB%", "K%", "BABIP", "ISO", "fWAR", "xFIP"] if c in df.columns]
        result = df[key_cols].head(200).to_dict(orient="records")
        _cache[cache_key] = result
        return result
    except Exception as e:
        return []


async def get_pitching_leaderboard(season: int = 2024, min_ip: int = 30) -> list[dict]:
    cache_key = f"pitch_leaders_{season}_{min_ip}"
    if cache_key in _cache:
        return _cache[cache_key]
    try:
        from pybaseball import pitching_stats
        df = await _run_in_thread(pitching_stats, season, season, qual=min_ip)
        key_cols = [c for c in ["Name", "Team", "G", "GS", "IP", "W", "L", "SV", "ERA", "WHIP", "K/9", "BB/9", "HR/9", "FIP", "xFIP", "SIERA", "WAR", "K%", "BB%", "ERA-", "FIP-"] if c in df.columns]
        result = df[key_cols].head(200).to_dict(orient="records")
        _cache[cache_key] = result
        return result
    except Exception as e:
        return []
