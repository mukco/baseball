import duckdb
import pandas as pd
from typing import Optional

FILTER_COLUMNS = {
    "batters":           {"min_pa": "pa", "seasons": "season"},
    "pitchers":          {"min_ip": "ip", "seasons": "season"},
    "teams_batting":     {"seasons": "season"},
    "teams_pitching":    {"seasons": "season"},
    "fg_projections_batting":  {},
    "fg_projections_pitching": {},
}

VALID_TABLES = set(FILTER_COLUMNS.keys())


def load_training_data(
    duckdb_path: str,
    table: str,
    features: list[str],
    target: str,
    filters: Optional[dict] = None,
) -> pd.DataFrame:
    if table not in VALID_TABLES:
        raise ValueError(f"Unknown table: {table}. Valid tables: {sorted(VALID_TABLES)}")

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

    where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
    sql = f'SELECT {col_list} FROM "{table}" {where_sql}'

    con = duckdb.connect(duckdb_path, read_only=True)
    try:
        df = con.execute(sql, params).df()
    finally:
        con.close()

    df = df.dropna(subset=[target])
    df = df.dropna(subset=features)

    return df
