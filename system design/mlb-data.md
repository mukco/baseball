# MLB Data

The primary data source for live game state, schedules, standings, player and team information.

## Overview

`MlbApiService` is a thin wrapper around the free MLB Stats API (`https://statsapi.mlb.com/api/v1`). No authentication is required. Every controller that needs live MLB data calls this service — it is instantiated once per request via the `mlb` helper in `BaseController`.

## What It Provides

| Method | Endpoint | Returns |
|---|---|---|
| `schedule(date)` | `/schedule` | Games for a given date with status, scores, probable pitchers |
| `standings(season)` | `/standings` | All 6 divisions with W-L, GB, last-10, streak |
| `search_players(query)` | `/people/search` | Player IDs and bio from a name fragment |
| `player_info(id)` | `/people/:id` | Full bio: position, team, height, weight, bats/throws |
| `player_season_stats(id, season)` | `/people/:id/stats` | Traditional batting/pitching/fielding splits |
| `player_career_stats(id)` | `/people/:id/stats` | Year-by-year career breakdown |
| `player_game_log(id, season)` | `/people/:id/stats` | Game-by-game log for the season |
| `player_projection(id, season, source:)` | `/people/:id/stats` | Steamer/ZiPS projections |
| `team_info(id)` | `/teams/:id` + roster + stats | Standing, roster, season stats |
| `game_details(game_pk)` | `/game/:pk/feed/live` | Boxscore + play-by-play + advanced metrics |
| `game_plays(game_pk)` | `/game/:pk/feed/live` | Scoring plays + full play log |
| `game_boxscore(game_pk)` | `/game/:pk/boxscore` | Structured boxscore |

## Advanced Metrics (Derived Client-Side)

`MlbApiService` computes several advanced stats from raw MLB API data rather than fetching them pre-computed:

- **BABIP**: `(H - HR) / (AB - K - HR + SF)`
- **wOBA**: weighted on-base using fixed 2024 coefficients (uBB, HBP, 1B, 2B, 3B, HR)
- **FIP**: `(13*HR + 3*(BB+HBP) - 2*K) / IP + FIP_constant` (FIP constant hardcoded at 3.10)
- **K%-BB%**: strikeout rate minus walk rate
- **Game Score**: Seager method for pitcher quality starts
- **Batting discipline edges**: edge categories from zone contact rates

These are computed in `build_advanced_metrics` called from `game_details`.

## Caching

`MlbApiService` does **not** cache internally. Callers are responsible:
- `GameInsightsService` wraps game details with a 10-minute in-memory cache
- `DailySummaryService` caches the full summary until end-of-day
- `FactoidsService` caches per player/team/game with context-aware TTLs

For controllers that call `mlb` directly (standings, schedule, player search), responses are not cached — each request hits the MLB API fresh.

## HTTP Configuration

All requests use Faraday with:
- `timeout: 15`, `open_timeout: 8`
- `:retry` middleware, max 2 retries, 1s interval
- `raise_error` middleware — errors surface as `Faraday::Error` which `BaseController` catches

## Hardcoded Team Metadata

All 30 teams are hardcoded in `TEAMS` hash inside the service: ID, abbreviation, full name, city, and brand color hex. This avoids a round-trip to the MLB API for team display data and is stable enough to maintain manually.
