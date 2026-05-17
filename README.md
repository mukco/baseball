# Statline — Baseball Analytics Platform

A full-featured baseball analytics application built on a Rails 8 API backend and a React/Vite frontend. It aggregates data from MLB's Stats API, Baseball Savant (Statcast), FanGraphs, ESPN, and Yahoo Fantasy into a single interface with player profiles, sortable leaderboards, AI-powered insights, a SQL sandbox, a custom projection engine, and Yahoo Fantasy integration.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Prerequisites](#prerequisites)
- [Environment Variables & Credentials](#environment-variables--credentials)
- [Running the App](#running-the-app)
- [Yahoo Fantasy Setup (OAuth + Tunnel)](#yahoo-fantasy-setup-oauth--tunnel)
- [Data Warehouse & Sandbox](#data-warehouse--sandbox)
- [Pages & Features](#pages--features)
- [Backend Architecture](#backend-architecture)
- [Frontend Architecture](#frontend-architecture)
- [Data Sources](#data-sources)
- [Adding New Endpoints](#adding-new-endpoints)

---

## Architecture Overview

```
baseball/
├── start.sh                         # One-command startup script
├── backend_rails/                   # Rails 8 API — runs on :8000
│   ├── .env                         # API keys (git-ignored, you must create this)
│   ├── Gemfile
│   ├── config/
│   │   ├── routes.rb                # All /api/* routes
│   │   └── environments/
│   ├── app/
│   │   ├── controllers/api/         # Thin controllers, one per resource
│   │   ├── services/                # All business logic
│   │   │   ├── mlb_api_service.rb   # MLB Stats API
│   │   │   ├── statcast_service.rb  # Baseball Savant + FanGraphs
│   │   │   ├── open_ai/client.rb    # OpenAI wrapper (all AI calls go here)
│   │   │   ├── assistant_service.rb # AI assistant with tool-calling
│   │   │   ├── yahoo_fantasy_service.rb
│   │   │   ├── warehouse/           # Data ingestion (FanGraphs + Savant CSVs)
│   │   │   └── sandbox/             # SQL query layer over DuckDB
│   │   └── models/                  # SQLite: ProjectionScenario, PlayerProjection
│   ├── db/                          # SQLite migrations
│   └── script/
│       ├── warehouse_build.py       # Python: CSV → DuckDB builder
│       └── sandbox_duckdb_query.py  # Python: runs SQL against DuckDB
│
└── frontend/                        # React 18 + Vite + Tailwind — runs on :5173
    ├── vite.config.js               # /api proxy → :8000
    └── src/
        ├── App.jsx                  # Routes
        ├── api.js                   # All fetch() calls (never call fetch directly in components)
        ├── pages/                   # One file per page/route
        ├── components/              # Shared UI components
        │   └── charts/              # Chart components (Recharts + ECharts)
        └── lib/
            ├── statHelp.js          # STAT_HELP glossary + STAT_ALIASES
            └── gamblingHelp.js
```

The Vite dev server proxies all `/api/*` requests to the Rails backend at `localhost:8000`, so no CORS configuration or environment variables are needed in the frontend.

---

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Ruby | 3.3+ | Use rbenv or rvm |
| Bundler | 2.x | `gem install bundler` |
| Node.js | 18+ | |
| npm | 9+ | |
| Python | 3.9+ | Only needed for the Sandbox / Warehouse features |
| DuckDB Python package | latest | `pip install duckdb` |

The Python runtime is only invoked when the data warehouse is built or a sandbox SQL query runs. If you don't use Sandbox, Python is not required.

---

## Environment Variables & Credentials

Create a file at `backend_rails/.env` (it is git-ignored). The `start.sh` script reads this file automatically via `dotenv-rails`.

```bash
# backend_rails/.env

# ── Required for all AI features ──────────────────────────────────────────────
OPENAI_API_KEY=sk-...

# Optional overrides (defaults shown):
# OPENAI_MODEL=gpt-4.1
# OPENAI_BASE_URL=https://api.openai.com
# OPENAI_PROJECT=proj_...          # Only needed if your org uses Projects

# ── Required for Yahoo Fantasy ─────────────────────────────────────────────────
YAHOO_CLIENT_ID=...
YAHOO_CLIENT_SECRET=...
YAHOO_LEAGUE_ID=211665             # The number in your league URL
YAHOO_REDIRECT_URI=https://xxxx.loca.lt/api/yahoo/callback   # See Yahoo section below
```

### Credential Details

#### `OPENAI_API_KEY` — **Required**
Used by the floating AI assistant, game insights, factoids, daily digest, fantasy insights, and the "Picks" feature. Without it the server will not start (raises on first AI request). Get one at [platform.openai.com](https://platform.openai.com/).

The model defaults to `gpt-4.1`. All AI calls go through `OpenAi::Client#json_completion`, which uses JSON mode and logs every request to `log/openai_requests.jsonl`. The assistant bypasses JSON mode because it uses tool-calling.

#### `YAHOO_CLIENT_ID` + `YAHOO_CLIENT_SECRET` — **Required for /fantasy**
Yahoo Fantasy uses OAuth 2.0. See the [Yahoo Fantasy Setup](#yahoo-fantasy-setup-oauth--tunnel) section for the full walkthrough.

#### `YAHOO_LEAGUE_ID` — **Required for /fantasy**
The numeric ID from your league URL. For `baseball.fantasysports.yahoo.com/b1/211665`, the league ID is `211665`.

#### `YAHOO_REDIRECT_URI` — **Managed automatically by start.sh**
This is the OAuth callback URL. It must be an HTTPS URL pointing at the running backend. Because the app runs locally (HTTP), you need a tunnel. `start.sh` handles this automatically with `localtunnel` — see the [Yahoo Fantasy Setup](#yahoo-fantasy-setup-oauth--tunnel) section.

#### No key required
MLB Stats API, Baseball Savant, FanGraphs, and ESPN are all free public endpoints with no authentication.

---

## Running the App

```bash
./start.sh
```

This script does the following in order:
1. If `backend_rails/tmp/yahoo_tokens.json` does not exist, walks through Yahoo Fantasy setup
2. Kills any existing processes on ports 8000 and 5173
3. Runs `bundle check` / `bundle install` for the Rails backend
4. Runs `npm install` for the frontend
5. Starts the Rails server on `:8000`
6. Starts the Vite dev server on `:5173`

Open **http://localhost:5173** in your browser.

To start services manually:

```bash
# Terminal 1 — backend
cd backend_rails
bundle exec rails server -p 8000

# Terminal 2 — frontend
cd frontend
npm run dev
```

---

## Yahoo Fantasy Setup (OAuth + Tunnel)

This is the most complex part of the setup. Yahoo's OAuth requires the redirect URI to be HTTPS, which means you can't use plain `http://localhost`. The workaround is a tunnel.

### The Problem

When a user clicks "Connect Yahoo Fantasy" in the app, they are sent to Yahoo to authorize. Yahoo then redirects back to the callback URL (`/api/yahoo/callback`) with an authorization code. This callback must be reachable by Yahoo's servers over HTTPS, but the Rails backend only runs on HTTP locally.

### The Solution: localtunnel

`start.sh` automatically starts a localtunnel (`npx localtunnel --port 8000`) which gives you a temporary public HTTPS URL like `https://happy-tiger-12.loca.lt`. This URL is written to `backend_rails/.env` as `YAHOO_REDIRECT_URI`.

**Important:** The tunnel URL changes every time you restart the app (unless you pay for a stable subdomain). Each time the URL changes, you must update the Redirect URI in your Yahoo app settings at [developer.yahoo.com/apps](https://developer.yahoo.com/apps/).

### One-Time Setup Steps

1. Go to [developer.yahoo.com/apps](https://developer.yahoo.com/apps/) and click **Create App**
2. Fill in:
   - **Application Name**: anything (e.g. Statline)
   - **Application Type**: Web Application
   - **Callback Domain**: `loca.lt` (or your tunnel's domain)
   - **API Permissions**: Fantasy Sports → Read
3. Copy the **Client ID** (Consumer Key) and **Client Secret** (Consumer Secret) into `backend_rails/.env`
4. Run `./start.sh` — it will print the current tunnel URL
5. Paste that URL into your Yahoo app's **Redirect URI(s)** field
6. Open http://localhost:5173/fantasy and click **Connect Yahoo Fantasy**
7. After authorizing, Yahoo redirects back through the tunnel and tokens are saved to `backend_rails/tmp/yahoo_tokens.json`

### After First Authorization

Once tokens are saved, the tunnel is only needed for the initial OAuth dance. The app uses the saved refresh token to get new access tokens automatically. You won't need to re-authorize unless the tokens expire (they last 1 hour; refresh tokens last longer but can be revoked).

If tokens stop working, delete `backend_rails/tmp/yahoo_tokens.json` and re-run `./start.sh` to re-authorize.

### Alternatives to localtunnel

If localtunnel is unreliable, you can use:
- **ngrok**: `ngrok http 8000` — gives a stable URL on paid plans. Set `YAHOO_REDIRECT_URI` manually in `.env`.
- **Cloudflare Tunnel**: Free and stable. `cloudflared tunnel --url http://localhost:8000`

---

## Data Warehouse & Sandbox

The **Sandbox** (`/sandbox`) is an in-browser SQL interface backed by a DuckDB warehouse built from FanGraphs and Savant data.

### How It Works

1. Clicking **Refresh Data** in the Sandbox (or `POST /api/sandbox/refresh`) triggers `Warehouse::Manager.refresh!`
2. The warehouse ingesters fetch CSVs from FanGraphs and Baseball Savant:
   - `Warehouse::BatterIngester` — FanGraphs standard batting + discipline + Savant bat-tracking (2010–present)
   - `Warehouse::PitcherIngester` — FanGraphs standard pitching + FIP components
   - `Warehouse::FgProjectionIngester` — FanGraphs Steamer/ZiPS projections (batting + pitching)
   - `Warehouse::TeamIngester` — FanGraphs team batting and pitching splits
3. Each ingester writes a CSV to `backend_rails/tmp/warehouse/`
4. `Warehouse::Manager` calls `script/warehouse_build.py` which reads those CSVs and writes a DuckDB file to `backend_rails/tmp/warehouse/baseball.duckdb`
5. SQL queries from the browser are executed by `script/sandbox_duckdb_query.py` against that DuckDB file

**Python is required** for steps 4 and 5. Install DuckDB: `pip install duckdb`

### Schema & Column Changes

If you add or remove columns from any ingester's `NAMED_COLUMNS` constant, the `schema_fingerprint` (an MD5 of all column lists) changes, and the warehouse is automatically treated as stale on the next request. Hit Refresh to rebuild.

### Notes

- Bat-speed tracking stats (`bat_speed`, `swing_length`, `hard_swing_rate`, `squared_up_per_swing`, `blast_per_swing`) are only available from Savant starting in **2024**. Rows before 2024 will have NULL for those columns.
- The warehouse covers seasons 2010–present for batters and pitchers.
- Refresh takes 1–3 minutes (many CSV fetches). The warehouse is cached for 6 hours; it won't re-fetch on every page load.
- The sandbox enforces read-only SELECT queries only. No mutations allowed.

---

## Pages & Features

| Route | Page | Description |
|-------|------|-------------|
| `/` | Today | Live schedule with game cards, scores, probable pitchers. Date-navigable. |
| `/game/:gamePk` | Game Details | Box score, play-by-play, win probability chart, AI insights, game picks |
| `/player/:id` | Player Profile | Full stat page with batting/pitching tabs, Statcast percentile cards, spray chart, pitch movement, career trends |
| `/team/:id` | Team Profile | Roster, stats, game log, historical records |
| `/leaderboards` | Leaderboards | Sortable batting, pitching, and teams tables from FanGraphs |
| `/teams` | Teams | 30-team grid with records and standings |
| `/sandbox` | Sandbox | SQL interface over DuckDB warehouse with pivot tables and charts |
| `/projections` | Projections | Player projections via internal engine; leaderboard; accuracy backtesting |
| `/projections/scenarios` | Scenario Builder | Create/edit projection parameter scenarios |
| `/fantasy` | Yahoo Fantasy | Roster, matchup, free agent analysis, AI insights |
| `/prospects` | Prospects | FanGraphs top-100 prospects by team |
| `/gambling` | Gambling | Daily odds (ESPN), AI picks |
| `/news` | News | MLB news feed |
| `/digest` | Daily Summary | AI-generated daily summary of previous day's action |
| `/transactions` | Transactions | Recent MLB transactions |
| `/live` | Live TV | Embedded MLB.TV stream links |
| `/stats-reference` | Stats Reference | Inline glossary for common sabermetric stats |

A floating **AI Assistant** is available on every page (click the icon in the navbar). It has access to player stats, game data, and the sandbox via tool-calling.

---

## Backend Architecture

### Controllers

All controllers live in `app/controllers/api/` and inherit from `Api::BaseController`. Controllers are intentionally thin — no business logic, just `render json: SomeService.call(...)`.

`BaseController` provides:
- `rescue_from StandardError` → returns `{ error: message }` with HTTP 502
- `mlb` helper that lazy-initializes `MlbApiService`

### Services

All business logic lives in `app/services/`. Services use class-level methods (`class << self`) — no instantiation needed except `MlbApiService`.

| Service | Purpose |
|---------|---------|
| `MlbApiService` | MLB Stats API: schedule, player info, stats, standings, team data |
| `StatcastService` | Baseball Savant (pitch-by-pitch CSVs) + FanGraphs leaderboards |
| `OpenAi::Client` | All OpenAI calls. Never call OpenAI directly — use this. |
| `AssistantService` | AI assistant with tool-calling (bypasses JSON mode intentionally) |
| `FactoidsService` | AI-generated player/game facts |
| `GameInsightsService` | AI narrative for a finished or in-progress game |
| `DailySummaryService` | AI summary of yesterday's games |
| `NewsService` | MLB news via RSS |
| `OddsService` | Live game odds via ESPN's unofficial API |
| `ProjectionEngine` | Marcel/regression-to-mean projection math |
| `ProjectionService` | Orchestrates runs, persists to SQLite |
| `ProspectService` | FanGraphs prospect board |
| `YahooFantasyService` | OAuth token management + Yahoo Fantasy API |
| `YahooFantasyDashboardService` | Aggregates roster + matchup data |
| `YahooFantasyInsightsService` | AI-powered fantasy insights |
| `HoverStatsService` | Quick stats for player hover cards |
| `Warehouse::*` | Data ingestion pipeline (see Sandbox section) |
| `Sandbox::QueryService` | Read-only SQL execution against DuckDB |

### OpenAI Integration

All AI calls (except the assistant) go through `OpenAi::Client#json_completion`:

```ruby
client = OpenAi::Client.new
result = client.json_completion(
  system_prompt:    "...",
  user_payload:     { player: ..., stats: ... },
  interaction_type: "factoids",   # labels the log entry
  temperature:      0.2           # 0.2 for structured, 0.7 for creative
)
result[:output]   # parsed JSON
```

Every call is automatically logged to `log/openai_requests.jsonl` with timing, token counts, and a redacted prompt/response preview.

### Caching

Services cache externally-fetched data in class-level hashes (`@@cache`, `@@cache_timestamps`) with a 6-hour TTL. The pattern to follow is in `StatcastService` and documented in `CLAUDE.md`. Error results are never cached.

### Models (SQLite)

SQLite is used only for projection persistence:
- `ProjectionScenario` — named parameter sets (regression weights, playing time, etc.)
- `PlayerProjection` — computed projection outputs, scoped to a `ProjectionRun`
- `ProjectionRun` — a batch projection job linked to a scenario

---

## Frontend Architecture

### Data Fetching

All API calls go through `frontend/src/api.js`. Never call `fetch` directly from a component. Use `useQuery` from `@tanstack/react-query` for all data fetching.

`staleTime` by convention:
- Live game data: 0–2 min
- Player stats: 15 min
- Leaderboards: 30+ min

Query keys follow `['resource', id, season, ...]`.

### Styling

Tailwind only — no inline styles, no CSS modules. Design tokens:

| Token class | Usage |
|-------------|-------|
| `text-content-primary` | Main text |
| `text-content-secondary` | Labels, secondary |
| `text-content-muted` | Timestamps, hints |
| `text-brand` / `text-brand-light` | Links, actions |
| `bg-bg-surface` | Card backgrounds |
| `bg-bg-elevated` | Elevated surfaces |
| `border-bg-border` | Dividers |

Reusable component classes are defined in `index.css` (`@layer components`): `.card`, `.btn-primary`, `.tab-active`, `.tab-inactive`, etc.

### Key Components

| Component | Purpose |
|-----------|---------|
| `StatCard` | Single numeric stat with optional percentile bar |
| `FactoidsPanel` | AI factoids — accepts `queryKey` + `queryFn`, handles loading/empty state |
| `FloatingAssistant` | Slide-in AI chat sidebar |
| `PlayerHoverCard` | Stat summary popup on player name hover |
| `SandboxCell` | Sandbox table cell with inline chart capability |
| `charts/PitchMovementChart` | H/V break scatter plot |
| `charts/SprayChart` | Hit location scatter on field diagram |
| `charts/WinProbabilityChart` | Game win probability over time |
| `charts/BeeswarmChart` | League distribution with player marker |
| `charts/RollingAverageChart` | Rolling stat trend over a season |

### Stat Glossary

`frontend/src/lib/statHelp.js` exports `STAT_HELP` (definitions keyed by camelCase name) and `STAT_ALIASES` (mapping raw column names to STAT_HELP keys). The sandbox uses these for tooltip explanations on column headers.

---

## Data Sources

| Source | What it provides | Auth |
|--------|-----------------|------|
| MLB Stats API (`statsapi.mlb.com`) | Schedule, scores, player bio, standard stats, standings, rosters | None |
| Baseball Savant (`baseballsavant.mlb.com`) | Pitch-by-pitch Statcast CSV, bat-tracking leaderboard (2024+) | None |
| FanGraphs (`fangraphs.com`) | Leaderboards, advanced metrics, projections, prospects | None |
| ESPN unofficial API | Live game odds | None |
| Yahoo Fantasy API | Fantasy roster, matchup, transactions | OAuth 2.0 |
| OpenAI | All AI features | API key |

---

## Adding New Endpoints

Follow these four steps every time:

1. **Route**: Add to `backend_rails/config/routes.rb` under `namespace :api`
2. **Controller**: Add an action in `app/controllers/api/` (inherit from `Api::BaseController`, keep it one line)
3. **Service**: Put all logic in `app/services/` using `class << self`
4. **Frontend**: Add the fetch call to `frontend/src/api.js`, then use `useQuery` in the component

The caching pattern to copy is in `StatcastService`:

```ruby
@@cache = {}
@@cache_timestamps = {}
CACHE_TTL = 6 * 3600

def some_data(id, season)
  key = "some_data_#{id}_#{season}"
  return @@cache[key] if cache_fresh?(key)
  result = fetch_something(id, season)
  cache_set(key, result) unless result[:error]
  result
end
```

External HTTP always uses Faraday with explicit timeouts and retry middleware:

```ruby
conn = Faraday.new do |f|
  f.request :retry, max: 2, interval: 1.0
  f.response :raise_error
  f.options.timeout      = 30
  f.options.open_timeout = 10
end
```

See `CLAUDE.md` at the repo root for the full set of project conventions.
