#!/usr/bin/env python3
import json
import sys
import os
import duckdb


def normalize_cell(v):
    if v is None:
        return None
    if isinstance(v, (int, float, str, bool)):
        return v
    return str(v)


def main():
    try:
        payload     = json.load(sys.stdin)
        sql         = payload.get("sql", "")
        tables      = payload.get("tables", [])
        limit       = int(payload.get("limit", 500))
        duckdb_path = payload.get("duckdb_path", "")

        # Prefer the persistent warehouse file; fall back to in-memory + CSV views
        if duckdb_path and os.path.exists(duckdb_path):
            con = duckdb.connect(database=duckdb_path, read_only=True)
        else:
            con = duckdb.connect(database=":memory:")
            con.execute("PRAGMA threads=2")
            for table in tables:
                name = table["name"]
                path = table["path"].replace("'", "''")
                con.execute(f"CREATE OR REPLACE VIEW {name} AS SELECT * FROM read_csv_auto('{path}', HEADER=TRUE)")

        wrapped = f"SELECT * FROM ({sql}) q LIMIT {limit + 1}"
        result  = con.execute(wrapped)
        rows    = result.fetchall()
        cols    = [d[0] for d in (result.description or [])]

        truncated = len(rows) > limit
        if truncated:
            rows = rows[:limit]

        out_rows = [[normalize_cell(c) for c in row] for row in rows]
        print(json.dumps({
            "columns":   cols,
            "rows":      out_rows,
            "row_count": len(out_rows),
            "truncated": truncated,
        }))
    except Exception as e:
        print(json.dumps({"error": str(e)}))


if __name__ == "__main__":
    main()
