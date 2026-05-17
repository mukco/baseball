# SQL Sandbox

A read-only SQL interface over a local multi-season FanGraphs/Statcast dataset, backed by DuckDB running as a Python subprocess. Used both as a user-facing query tool (the Sandbox page) and as the data source for the AI assistant's `query_players_sql` tool.

## Architecture

```
SandboxController / AssistantService
  ↓
Sandbox::QueryService.run(sql:, limit:)
  ↓ validates SQL, builds request JSON
Python subprocess: script/sandbox_duckdb_query.py
  ↓ reads CSV via DuckDB
Returns { columns, rows, row_count, truncated }
```

## Dataset

A single CSV file at `tmp/sandbox/players.csv`, built and refreshed by `Sandbox::PlayersDatasetBuilder`.

**Contents:** FanGraphs batting and pitching leaderboard data for the past 6 seasons. Each row is one player-season. Key columns: `player_id`, `name`, `team`, `position`, `season`, `pa`, `hr`, `avg`, `obp`, `slg`, `ops`, `wrc_plus`, `bb_pct`, `k_pct`, `babip`, `war`, `barrel_pct`, `hard_hit_pct`, `exit_velocity`, `sprint_speed`, `era`, `fip`, `xfip`, `whip`, `k_per_9`, `bb_per_9`.

Column names are normalized: `%`, `+`, `/`, `-` replaced with spelled-out equivalents (`_pct`, `_plus`, `_per_`, `_minus_`) so they are valid SQL identifiers.

**Metadata** stored alongside the CSV in `tmp/sandbox/players_meta.json`: season list, row count, last refresh timestamp.

## Dataset Builder (`Sandbox::PlayersDatasetBuilder`)

Builds the CSV on demand with a lazy 6-hour refresh threshold:
1. Fetch batting and pitching leaderboards for each of the past 6 seasons via `StatcastService`
2. Normalize column names
3. Enrich each row with current `position` and `team` from `MlbApiService` (batched, one call per unique player ID)
4. Write merged CSV + metadata JSON to `tmp/sandbox/`

Called on the first query if the CSV doesn't exist or is stale. Stale threshold: 6 hours (`DatasetRegistry`).

## Query Service (`Sandbox::QueryService`)

### SQL Validation

Before execution, the service:
1. Strips SQL comments (`--`)
2. Checks that the query starts with `SELECT` or `WITH ... SELECT`
3. Rejects any DDL/DML keywords: `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `CREATE`, `GRANT`, `REVOKE`, `TRUNCATE`, `ATTACH`, `COPY`, `CALL`
4. Rejects multiple statements (presence of `;` after the first clause)

Only one SELECT statement is allowed per call.

### Execution

Passes the validated SQL + limit + table paths to `script/sandbox_duckdb_query.py` via `Open3.capture3`. The Python script:
- Loads the CSV into DuckDB as a table named `players`
- Executes the query with the row limit applied
- Returns `{ columns, rows, row_count, truncated }` as JSON on stdout, or `{ error }` on failure

Max 500 rows returned (`MAX_LIMIT`). Runtime is measured in Ruby and included in the response.

### Error Handling

- Non-zero subprocess exit → raises `"Sandbox query process failed: #{stderr}"`
- Python script errors → raises the error message from `parsed["error"]`
- SQL validation failures → raises descriptive error before spawning the subprocess

## Frontend (Sandbox Page)

The Sandbox page provides:
- A SQL editor (textarea with monospace font)
- Pre-filled default query from `DatasetRegistry`
- Sortable results table with column headers
- Dataset metadata panel: row count, available seasons, last refresh, stale indicator
- Column glossary with descriptions for each stat column

The assistant also uses this dataset via `query_players_sql` — queries from the assistant route through the same `QueryService` with a default limit of 200.

## Dataset Registry (`Sandbox::DatasetRegistry`)

Provides metadata about available datasets (currently just `players`):
- `stale?`: true if last refresh > 6 hours ago
- `tables_for_query`: hash mapping table names to CSV file paths, passed to the Python script
- `datasets`: full metadata object returned to clients (for the Sandbox page header)
