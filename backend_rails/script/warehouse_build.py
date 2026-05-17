#!/usr/bin/env python3
"""
Reads CSVs and writes a persistent DuckDB warehouse file.
Accepts JSON on stdin: { "duckdb_path": str, "tables": { table_name: csv_path, ... } }
"""
import json
import sys
import os
import duckdb


def main():
    try:
        payload = json.load(sys.stdin)
        duckdb_path = payload["duckdb_path"]
        tables = payload.get("tables", {})

        os.makedirs(os.path.dirname(duckdb_path), exist_ok=True)

        # Always rebuild from scratch so schema changes are picked up cleanly
        if os.path.exists(duckdb_path):
            os.remove(duckdb_path)

        con = duckdb.connect(database=duckdb_path)
        con.execute("PRAGMA threads=4")

        for table_name, csv_path in tables.items():
            if not os.path.exists(csv_path):
                print(f"[warehouse_build] skipping {table_name}: CSV not found at {csv_path}", file=sys.stderr)
                continue
            safe_path = csv_path.replace("'", "''")
            con.execute(f"""
                CREATE TABLE {table_name} AS
                SELECT * FROM read_csv_auto('{safe_path}', HEADER=TRUE, SAMPLE_SIZE=-1)
            """)
            count = con.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()[0]
            print(f"[warehouse_build] {table_name}: {count} rows", file=sys.stderr)

        con.close()
        print(json.dumps({"ok": True}))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
