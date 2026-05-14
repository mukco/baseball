# Statcast & Leaderboards

Pulls advanced Statcast metrics from Baseball Savant and FanGraphs season leaderboards. No Python or pybaseball dependency — data is fetched directly from public CSV/JSON endpoints.

## Overview

`StatcastService` is a class-only service (all `class << self`) with two data sources:

- **Baseball Savant** — per-pitch CSV exports for individual player Statcast data
- **FanGraphs** — JSON leaderboard API for season-level batting and pitching stats

Results are cached in a class-level in-memory hash (`@@cache`) for the lifetime of the server process, with a 6-hour TTL.

## Baseball Savant — Individual Player Data

### Endpoint

`https://baseballsavant.mlb.com/statcast_search/csv` with `type=details`

### Pitcher

```
player_type=pitcher&pitcherId=<id>&season=<year>&all=true&hfGT=R|&min_pitches=0
```

Returns one row per pitch for the full season. Aggregated into:
- `pitchTypes` — array of pitch type objects: usage%, avg velo, avg spin, horizontal/vertical break (converted from feet to inches), whiff rate
- `movementData` — sampled scatter data for the movement chart (max 500 points)
- `summary` — avg fastball velo, xwOBA against, avg exit velo, hard-hit%
- `totalPitches` — raw pitch count

### Batter

```
player_type=batter&batters_lookup[]=<id>&season=<year>&all=true&hfGT=R|&min_pitches=0
```

Aggregated into:
- `summary` — avg/max exit velo, hard-hit%, barrel% (≥98 mph + 26-30° launch angle), xBA, xwOBA, sprint speed, avg launch angle, sweet-spot%
- `sprayData` — sampled hit location points (max 300) for the spray chart

### Important: `hfGT` Pipe Encoding

The `hfGT=R|` parameter uses `|` as Savant's multi-value separator. Faraday percent-encodes `|` to `%7C` by default, which Savant silently ignores, returning empty data.

**Fix**: `fetch_csv` builds the query string manually, keeping `hfGT` outside of `URI.encode_www_form` so the literal pipe is preserved:

```ruby
hfgt = params[:hfGT] || params["hfGT"]
other = params.reject { |k, _| k.to_s == "hfGT" }
query = URI.encode_www_form(other)
query += "&hfGT=#{hfgt}" if hfgt
resp = conn.get("#{url}?#{query}")
```

## FanGraphs — Season Leaderboards

### Endpoint

`https://www.fangraphs.com/api/leaders/major-league/data`

Returns JSON with a `data` array. The service normalizes:
- HTML tags stripped from `Name` and `Team` fields
- `K%` and `BB%` converted from decimal fractions (e.g. `0.25`) to percentages (`25.0`) when the raw value is ≤ 1

Used by `LeaderboardsController` (`/api/leaderboards/batting` and `/api/leaderboards/pitching`) and by `Sandbox::PlayersDatasetBuilder` to populate the DuckDB dataset.

## Caching

```ruby
@@cache = {}
@@cache_timestamps = {}
CACHE_TTL = 6 * 3600  # 6 hours
```

- `pitcher` and `batter`: cached only on success — error results (e.g. empty Savant response) are **not** cached so the next request retries the live fetch
- `batting_leaderboard` and `pitching_leaderboard`: cached only when `data.any?`

Cache lives for the server process lifetime. Restart the server to clear it.

## Consumers

| Caller | What it uses |
|---|---|
| `StatsController#statcast_pitching` | `StatcastService.pitcher` |
| `StatsController#statcast_batting` | `StatcastService.batter` |
| `LeaderboardsController` | `StatcastService.batting_leaderboard`, `.pitching_leaderboard` |
| `AssistantService` (`get_statcast` tool) | `StatcastService.pitcher` / `.batter` |
| `AssistantService` (`get_leaderboards` tool) | `StatcastService.batting_leaderboard` / `.pitching_leaderboard` |
| `Sandbox::PlayersDatasetBuilder` | `StatcastService.batting_leaderboard` / `.pitching_leaderboard` for the last 6 seasons |
