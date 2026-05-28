import io
import duckdb
import httpx
import pandas as pd
from typing import Optional
from urllib.parse import urlencode

FILTER_COLUMNS = {
    "batters":                   {"min_pa": "pa", "seasons": "season", "player_id": "player_id", "player_name": "name"},
    "pitchers":                  {"min_ip": "ip", "seasons": "season", "player_id": "player_id", "player_name": "name"},
    "teams_batting":             {"seasons": "season"},
    "teams_pitching":            {"seasons": "season"},
    "fg_projections_batting":    {"player_id": "player_id", "player_name": "name"},
    "fg_projections_pitching":   {"player_id": "player_id", "player_name": "name"},
}

PITCH_BY_PITCH_TABLE = "pitch_by_pitch"

PITCH_BY_PITCH_COLUMNS = [
    {"name": "pitch_type",                        "type": "VARCHAR"},
    {"name": "pitch_name",                        "type": "VARCHAR"},
    {"name": "release_speed",                     "type": "DOUBLE"},
    {"name": "release_spin_rate",                 "type": "DOUBLE"},
    {"name": "release_extension",                 "type": "DOUBLE"},
    {"name": "pfx_x",                             "type": "DOUBLE"},
    {"name": "pfx_z",                             "type": "DOUBLE"},
    {"name": "plate_x",                           "type": "DOUBLE"},
    {"name": "plate_z",                           "type": "DOUBLE"},
    {"name": "zone",                              "type": "INTEGER"},
    {"name": "balls",                             "type": "INTEGER"},
    {"name": "strikes",                           "type": "INTEGER"},
    {"name": "outs_when_up",                      "type": "INTEGER"},
    {"name": "stand",                             "type": "VARCHAR"},
    {"name": "p_throws",                          "type": "VARCHAR"},
    {"name": "description",                       "type": "VARCHAR"},
    {"name": "events",                            "type": "VARCHAR"},
    {"name": "launch_speed",                      "type": "DOUBLE"},
    {"name": "launch_angle",                      "type": "DOUBLE"},
    {"name": "estimated_woba_using_speedangle",   "type": "DOUBLE"},
]

VALID_TABLES = set(FILTER_COLUMNS.keys()) | {PITCH_BY_PITCH_TABLE}


def _fetch_savant_pitch_by_pitch(player_id: int, season: int) -> pd.DataFrame:
    base = "https://baseballsavant.mlb.com/statcast_search/csv"
    params = {
        "type": "details",
        "player_type": "pitcher",
        "pitchers_lookup[]": player_id,
        "season": season,
        "all": "true",
        "min_pitches": 0,
    }
    # hfGT pipe must NOT be URL-encoded — Savant silently ignores %7C
    qs = urlencode(params) + "&hfGT=R|"
    with httpx.Client(timeout=90, follow_redirects=True) as client:
        resp = client.get(
            f"{base}?{qs}",
            headers={"User-Agent": "Mozilla/5.0 (compatible; StatlineBot/1.0)"},
        )
        resp.raise_for_status()
    body = resp.text
    if not body.strip() or body.strip().startswith("<"):
        return pd.DataFrame()
    return pd.read_csv(io.StringIO(body), low_memory=False)


def _load_pitch_by_pitch(
    features: list[str],
    target: str,
    filters: Optional[dict],
) -> pd.DataFrame:
    if not filters or filters.get("player_id") is None:
        raise ValueError("pitch_by_pitch requires a player_id filter")

    player_id = int(filters["player_id"])
    seasons = filters.get("seasons") or [2024]

    frames = []
    for season in seasons:
        df = _fetch_savant_pitch_by_pitch(player_id, int(season))
        if not df.empty:
            frames.append(df)

    if not frames:
        return pd.DataFrame(columns=list(dict.fromkeys(features + [target])))

    raw = pd.concat(frames, ignore_index=True)

    all_cols = list(dict.fromkeys(features + [target]))
    available = [c for c in all_cols if c in raw.columns]
    df = raw[available].copy()

    df = df.dropna(subset=[c for c in [target, *features] if c in df.columns])
    return df


def load_training_data(
    duckdb_path: str,
    table: str,
    features: list[str],
    target: str,
    filters: Optional[dict] = None,
) -> pd.DataFrame:
    if table not in VALID_TABLES:
        raise ValueError(f"Unknown table: {table}. Valid tables: {sorted(VALID_TABLES)}")

    if table == PITCH_BY_PITCH_TABLE:
        return _load_pitch_by_pitch(features, target, filters)

    all_cols = list(dict.fromkeys(features + [target]))
    col_list = ", ".join(f'"{c}"' for c in all_cols)

    where_clauses = []
    params = []

    if filters:
        col_map = FILTER_COLUMNS.get(table, {})
        if "min_pa" in filters and "min_pa" in col_map:
            where_clauses.append(f'"{col_map["min_pa"]}" >= ?')
            params.append(int(filters["min_pa"]))
        if "min_ip" in filters and "min_ip" in col_map:
            where_clauses.append(f'"{col_map["min_ip"]}" >= ?')
            params.append(float(filters["min_ip"]))
        if "seasons" in filters and filters["seasons"] and "seasons" in col_map:
            placeholders = ", ".join("?" * len(filters["seasons"]))
            where_clauses.append(f'"{col_map["seasons"]}" IN ({placeholders})')
            params.extend(int(s) for s in filters["seasons"])
        if "player_id" in filters and filters["player_id"] is not None and "player_id" in col_map:
            where_clauses.append(f'"{col_map["player_id"]}" = ?')
            params.append(int(filters["player_id"]))
        if "player_name" in filters and filters["player_name"] and "player_name" in col_map:
            where_clauses.append(f'"{col_map["player_name"]}" ILIKE ?')
            params.append(f'%{filters["player_name"]}%')

    where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
    sql = f'SELECT {col_list} FROM "{table}" {where_sql}'

    con = duckdb.connect(duckdb_path, read_only=True)
    try:
        df = con.execute(sql, params).df()
    finally:
        con.close()

    df = df.dropna(subset=[target, *features])

    return df
