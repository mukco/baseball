# Statline — Baseball Analytics Platform

A full-featured baseball analytics application built on a Rails 8 API backend, a React/Vite frontend, and a Python ML service. It aggregates data from MLB's Stats API, Baseball Savant (Statcast), FanGraphs, ESPN, and Yahoo Fantasy into a single interface.

---

## Features

### Live Games & Scores
- Date-navigable schedule with live game cards, scores, and probable pitchers
- Per-game box scores, inning-by-inning linescores, and play-by-play
- Live win probability chart updated each half-inning
- AI-generated game narratives and betting picks
- Real-game result sync into simulations

### Player & Team Profiles
- Full batting and pitching stat pages with career trend charts
- Statcast percentile cards (exit velocity, spin rate, barrel rate, etc.)
- Spray chart (hit location scatter), pitch movement scatter, rolling averages
- Team rosters, game logs, and historical records

### Leaderboards & Stats
- Sortable batting, pitching, and team tables sourced from FanGraphs advanced metrics
- Sabermetric glossary with definitions for every stat (wRC+, FIP, xFIP, SIERA, BABIP, etc.)
- Bat-tracking leaderboard (bat speed, swing length, blast rate) — available 2024+

### Season Simulation
Full game-by-game simulation engine driven by FanGraphs projections.

- **League setup** — pick a season, scenario, and batter/pitcher projection blend
- **Day-by-day control** — simulate one day, simulate through a date, or sim the whole season
- **Real-result sync** — pull actual MLB scores in place of simulated ones for the current season
- **Live schedule view** — date-navigable game list with win probability for each matchup
- **Standings** — show all games, real only, or simulated only, with full division breakdowns
- **Roster editor** — drag-and-drop batting order and rotation; assign bullpen roles
- **Box scores** — inning-by-inning linescore, batting + pitching box, real vs. sim score toggle
- **Season leaderboards** — batting and pitching stats accumulated across all simulated games
- **Player profiles** — per-player sim stats, trend charts, and AI-generated insights
- **Team pages** — standings, roster, and team-level sim stats
- **Injuries** — simulated injury tracker with severity and return timelines
- **Transactions** — free agent signings and trades generated during simulation
- **Season Calendar** — month-by-month view of simulated days with AI-generated daily stories and game links
- **Playoff bracket** — seed and simulate the postseason round by round (Wild Card → LCS → World Series)
- **Playoff stat leaders** — batting and pitching leaderboards across all postseason games
- **Playoff insights** — AI-generated postseason narrative and key storylines once the bracket is complete
- **Playoff awards** — AI committee selects WS MVP, ALCS MVP, and NLCS MVP with written rationale
- **Season awards** — Silver Slugger, Gold Glove, Cy Young, and MVP voting
- **Player ratings** — league-relative 1–3 star ratings (contact/power/discipline for batters; stuff/control/HR prevention for pitchers) displayed on roster and player pages

### Multi-Season Franchises
- Create a franchise to run continuous multi-year simulations
- Advance completed seasons → new season inherits rosters and clones or fetches the schedule
- Per-franchise season history with champion tracking and completion progress
- All franchise data flows into the DuckDB warehouse for cross-season SQL analysis

### SQL Sandbox
- In-browser SQL editor backed by a DuckDB warehouse
- 9 queryable tables: batters, pitchers, FG batting/pitching projections, team batting/pitching, sim player stats, sim team standings, sim season log
- Column glossary with stat definitions and data types
- Pivot table view and chart visualization (bar, line, scatter)
- Stale-detection: warehouse auto-invalidates when ingester schemas change
- CodeMirror editor with SQL autocomplete (table names + column names)

### ML Builder
- Train ML models on warehouse data directly from the browser — no code required
- Supported models: Linear Regression, Logistic Regression, Random Forest, Gradient Boosting, Neural Network (PyTorch MLP)
- Configure features, target, test split, and all hyperparameters from the UI
- Neural network layer builder with live parameter count and architecture diagram
- Results: R², RMSE, accuracy, F1, confusion matrix, feature importance, training loss curve
- Educational explainer panel covering neural networks, overfitting, activation functions, and more

### Projections
- Internal projection engine (Marcel + regression-to-mean)
- Configurable scenario builder — tune weights, aging curves, and regression factors
- Season leaderboard view of projected stats
- Projection accuracy backtesting against final stats

### Fantasy Baseball (Yahoo + Ottoneu)

**Yahoo Fantasy:**
- OAuth 2.0 integration with token persistence
- Roster, matchup, and free agent views
- AI-generated lineup recommendations and waiver wire analysis

**Ottoneu Fantasy (FanGraphs H2H Points):**
- Full league roster browser — all 12 teams, every player with salary, positions, and MLB team
- Salary efficiency metrics: PPD (Points Per Dollar), surplus (pts − salary × 10), fair value salary
- League stats tab — sortable batting/pitching table with salary, PPD, and surplus for every rostered player; position and team filters
- Free agent finder — unrostered players ranked by FanGraphs projected pts, enriched with Steamer projection comparison and fair value salary
- AI-generated insights: waiver wire targets, league trends, and cap strategy recommendations
- Transactions — live auction bids and waiver claims in progress
- Standings with record, total points, and points scored/against
- Player analysis — per-player AI analysis combining season stats, Steamer projections, IL status, and Ottoneu salary context
- Cap overview — all teams' base salary, penalties, and remaining cap space
- Loans tracker — salary loan agreements between teams

### AI Assistant
- Floating chat sidebar available on every page
- Tools: player stats lookup, game data, SQL sandbox queries, ML model training, full Ottoneu league data
- Context-aware — knows what page you're on; defaults to Ottoneu tools on the fantasy page
- Ottoneu tools: roster, standings, transactions, free agents, cap overview, and `ottoneu_salaries` SQL for cross-league analysis

### News & Content
- Live MLB news feed
- Daily AI-generated digest of previous day's action
- Recent MLB transactions feed
- Gambling picks with AI analysis of daily odds

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Prerequisites](#prerequisites)
- [Environment Variables & Credentials](#environment-variables--credentials)
- [Running the App](#running-the-app)
- [Yahoo Fantasy Setup](#yahoo-fantasy-setup-oauth--tunnel)
- [Data Warehouse & Sandbox](#data-warehouse--sandbox)
- [Simulation System](#simulation-system)
- [ML Builder](#ml-builder)
- [All Routes](#all-routes)
- [Backend Architecture](#backend-architecture)
- [Frontend Architecture](#frontend-architecture)
- [Data Sources](#data-sources)
- [Adding New Endpoints](#adding-new-endpoints)

---

## Architecture Overview

```
baseball/
├── start.sh                         # One-command startup (Rails + ML service + Vite)
├── backend_rails/                   # Rails 8 API — port 8000
│   ├── .env                         # API keys (git-ignored)
│   ├── app/
│   │   ├── controllers/api/         # Thin controllers — one per resource
│   │   ├── services/                # All business logic
│   │   │   ├── mlb_api_service.rb
│   │   │   ├── statcast_service.rb
│   │   │   ├── simulation_service.rb
│   │   │   ├── game_simulation_engine.rb
│   │   │   ├── bullpen_manager.rb   # Rest/workload-aware bullpen state
│   │   │   ├── manager_strategy.rb  # In-game decision interface
│   │   │   ├── player_rating_service.rb  # 1-3 star percentile ratings
│   │   │   ├── league_constants_service.rb  # Baseline rates from DuckDB
│   │   │   ├── cache_warming_service.rb  # Background cache pre-warming
│   │   │   ├── franchise_service.rb
│   │   │   ├── playoff_simulation_service.rb
│   │   │   ├── open_ai/client.rb    # All AI calls go here
│   │   │   ├── warehouse/           # Data ingestion → CSV → DuckDB
│   │   │   └── sandbox/             # SQL execution layer
│   │   ├── models/                  # SQLite: projections + simulation state
│   │   └── jobs/                    # Background jobs (simulate season, news generation)
│   ├── db/                          # SQLite migrations
│   └── script/
│       ├── warehouse_build.py       # CSV → DuckDB
│       └── sandbox_duckdb_query.py  # SQL runner
│
├── ml_service/                      # Python FastAPI — port 8002
│   ├── main.py                      # /health, /columns/:table, /train
│   ├── data_loader.py               # Reads DuckDB warehouse
│   ├── trainer.py                   # Model dispatch
│   └── models/
│       ├── neural_network.py        # PyTorch MLP
│       └── sklearn_models.py        # Linear, Logistic, RF, GB
│
└── frontend/                        # React 18 + Vite + Tailwind — port 5173
    ├── vite.config.js               # /api proxy → :8000
    └── src/
        ├── App.jsx                  # All routes
        ├── api.js                   # All fetch() calls
        ├── pages/                   # One file per route
        ├── components/
        │   ├── sim/                 # Simulation UI primitives
        │   ├── ml/                  # ML Builder components
        │   └── charts/              # Recharts + ECharts wrappers
        └── lib/
            ├── statHelp.js          # Stat glossary + aliases
            └── gamblingHelp.js
```

The Vite dev server proxies all `/api/*` requests to the Rails backend. The frontend never calls the ML service directly — Rails proxies those too.

---

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Ruby | 3.3+ | Use rbenv or rvm |
| Bundler | 2.x | `gem install bundler` |
| Node.js | 18+ | |
| npm | 9+ | |
| Python | 3.9+ | Required for Sandbox and ML Builder |
| DuckDB Python package | latest | `pip install duckdb` |
| PyTorch + scikit-learn | latest | `pip install -r ml_service/requirements.txt` |

`start.sh` checks and installs Python packages automatically.

---

## Environment Variables & Credentials

Create `backend_rails/.env` (git-ignored):

```bash
# Required for all AI features
OPENAI_API_KEY=sk-...

# Optional overrides
# OPENAI_MODEL=gpt-4.1
# OPENAI_BASE_URL=https://api.openai.com

# Required for Yahoo Fantasy
YAHOO_CLIENT_ID=...
YAHOO_CLIENT_SECRET=...
YAHOO_LEAGUE_ID=211665
YAHOO_REDIRECT_URI=https://xxxx.loca.lt/api/yahoo/callback

# Required for Ottoneu Fantasy
OTTONEU_LEAGUE_ID=...   # Numeric league ID from your Ottoneu URL
```

- **`OPENAI_API_KEY`** — Used by the AI assistant, game insights, factoids, daily digest, picks, simulation news/awards/insights, and the ML Builder assistant. All calls logged to `log/openai_requests.jsonl`.
- **`YAHOO_CLIENT_ID` / `YAHOO_CLIENT_SECRET`** — Yahoo OAuth 2.0. See setup section below.
- **`YAHOO_LEAGUE_ID`** — Numeric ID from your league URL.
- **`OTTONEU_LEAGUE_ID`** — Numeric ID from your Ottoneu league URL. Used for all Ottoneu scraping.
- **No key required** — MLB Stats API, Baseball Savant, FanGraphs, ESPN, and Ottoneu are free public endpoints.

---

## Running the App

```bash
./start.sh
```

Starts Rails on `:8000`, the ML service on `:8002`, and Vite on `:5173`. Open **http://localhost:5173**.

To start manually:

```bash
# Terminal 1
cd backend_rails && bundle exec rails server -p 8000

# Terminal 2
cd ml_service && python main.py

# Terminal 3
cd frontend && npm run dev
```

---

## Yahoo Fantasy Setup (OAuth + Tunnel)

Yahoo OAuth requires HTTPS. `start.sh` automatically starts a localtunnel (`npx localtunnel --port 8000`) to provide one.

**One-time setup:**
1. Go to [developer.yahoo.com/apps](https://developer.yahoo.com/apps/) → Create App
2. Set Application Type: Web Application, Callback Domain: `loca.lt`, API Permissions: Fantasy Sports → Read
3. Copy Client ID and Secret to `.env`
4. Run `./start.sh` — it prints the tunnel URL
5. Paste the tunnel URL into your Yahoo app's Redirect URI field
6. Open `/fantasy` → Connect Yahoo Fantasy

Tokens are saved to `backend_rails/tmp/yahoo_tokens.json`. The tunnel URL changes on every restart — update it in Yahoo's app settings each time.

To re-authorize: delete `backend_rails/tmp/yahoo_tokens.json`.

---

## Data Warehouse & Sandbox

The **Sandbox** (`/sandbox`) is an in-browser SQL interface over a DuckDB warehouse.

### Tables

| Table | Source | Description |
|-------|--------|-------------|
| `batters` | FanGraphs + Savant | Season batting stats + Statcast bat-tracking, 2010–present |
| `pitchers` | FanGraphs | Season pitching stats + FIP components, 2010–present |
| `fg_projections_batting` | FanGraphs Steamer | Current-season batting projections |
| `fg_projections_pitching` | FanGraphs Steamer | Current-season pitching projections |
| `teams_batting` | MLB Stats API | Team-level batting stats, 2010–present |
| `teams_pitching` | MLB Stats API | Team-level pitching stats, 2010–present |
| `ottoneu_salaries` | Ottoneu scraper | All rostered players across every team in the Ottoneu league — salary, positions, team; refreshed on warehouse rebuild |
| `sim_player_stats` | Simulation | Per-player stats across all simulated league seasons |
| `sim_team_standings` | Simulation | Per-team final standings across all simulated league seasons |
| `sim_season_log` | Simulation | One row per league season — completion, champion, configuration |

### Workflow

1. Click **Refresh** in Sandbox (or `POST /api/sandbox/refresh`)
2. Ingesters fetch data and write CSVs to `backend_rails/tmp/warehouse/`
3. `warehouse_build.py` loads the CSVs into `baseball.duckdb`
4. SQL queries run via `sandbox_duckdb_query.py`

Warehouse refresh takes 2–10 minutes and is cached for 6 hours. The schema fingerprint auto-invalidates the cache if any ingester's column list changes.

Bat-tracking stats (`bat_speed`, `swing_length`, `blast_per_swing`, etc.) are only available from **2024** onward.

---

## Simulation System

### Game Engine

`GameSimulationEngine` simulates one game at a time using FanGraphs projections:

- Each at-bat draws a hit/walk/strikeout/out outcome from the batter's projected rates
- Hit type (single/double/triple/HR) is weighted from the batter's power profile
- **`BullpenManager`** tracks rest days (SP: 5, CL/SU: 1, LR: 2), consecutive-appearance limits, and seasonal workload caps per role; falls back to legacy rotation logic for rosters without pitcher state
- **`ManagerStrategy`** is the decision interface for in-game events — currently a deterministic stub; designed to support `basic` (rule-based) and `sharp` (optimization-based) difficulty levels without touching the engine
- Spray direction (pull/center/oppo tendency) is sourced from FanGraphs batted-ball data and affects fielder assignment
- Injuries can pull a player mid-game; replacement logic fills from roster

Stats accumulate into `SimulationPlayerStat` and `SimulationGame` (full box score JSON).

### Simulation Service

`SimulationService` orchestrates everything above:

- `setup_league` — creates 30 rosters from projections, imports the MLB schedule
- `simulate_game` / `simulate_day` / `simulate_through` / `simulate_season` — game simulation entry points (all run as background jobs for the full-season path)
- `compute_standings` — calculates W/L/PCT/GB from simulated game results
- `import_real_results` — syncs actual MLB scores for a date range
- Roster management: update lineup order, rotation, bullpen roles

### Franchises

`FranchiseService` wraps multi-season simulation:

- Creates a franchise + first-season league in one transaction
- `advance_season` — marks current season complete, creates next season, clones rosters, fetches or clones the schedule
- Schedule fallback: if the MLB API doesn't have a schedule for a future year, dates are shifted from the previous season

### Background Jobs

Long-running operations (simulate season, generate daily news, generate awards) run as `SolidQueue` background jobs with status polling via `SimulationJobRun`.

**Scheduled jobs** (`config/recurring.yml`, production only):

| Job | Schedule | Purpose |
|-----|----------|---------|
| `WarmSimulationCacheJob` | Every 30 minutes | Pre-warms Statcast + projection caches for all active sim league roster players |
| `WarmLeaderboardCacheJob` | Every 6 hours | Pre-warms FanGraphs batting/pitching leaderboard caches (the 30–89 s HTTP outliers) |
| `WarmOttoneuCacheJob` | Every 50 minutes | Pre-warms Ottoneu league data (rosters → league stats → insights → free agents, in dependency order) |
| `clear_solid_queue_finished_jobs` | Every hour | Prunes completed SolidQueue job records |

### Playoff Simulation

`PlayoffSimulationService` seeds and simulates the postseason:

- Wild Card → Division Series → LCS → World Series
- Each series simulates game by game using the same engine
- Home-field advantage applied based on regular-season record
- `PlayoffAwardService` calls the AI to select MVP winners with rationale

---

## ML Builder

The ML service is a separate FastAPI process on port **8002**. Rails proxies to it — the frontend never talks to it directly.

### Supported Models

| Model | Tasks |
|-------|-------|
| Linear Regression | Regression |
| Logistic Regression | Classification |
| Random Forest | Both |
| Gradient Boosting | Both |
| Neural Network (PyTorch MLP) | Both |

### Configuration

- **Data source** — any warehouse table
- **Features** — multi-select with stat definition tooltips
- **Target** — any column; one-hot encoding bins continuous targets into quantile classes
- **Hyperparameters** — per-model: layers/neurons/activation/dropout for NN; n_estimators/max_depth for RF/GB; regularization for linear models

### Results

Regression: R², RMSE, MAE. Classification: accuracy, F1, precision, recall, confusion matrix. All models: feature importance chart. Neural network: training loss curve, parameter count, architecture diagram.

---

## All Routes

| Route | Page |
|-------|------|
| `/` | Today — live schedule |
| `/game/:gamePk` | Game details — box score, win probability, AI insights |
| `/player/:id` | Player profile |
| `/team/:id` | Team profile |
| `/teams` | 30-team grid |
| `/leaderboards` | FanGraphs batting/pitching leaderboards |
| `/projections` | Projection leaderboard + accuracy backtesting |
| `/projections/scenarios` | Scenario builder |
| `/sandbox` | SQL sandbox |
| `/ml` | ML Builder |
| `/fantasy` | Fantasy dashboard — Yahoo Fantasy + Ottoneu league (roster, stats, insights, free agents, transactions) |
| `/prospects` | Top-100 prospects |
| `/gambling` | Daily odds + AI picks |
| `/news` | MLB news |
| `/digest` | AI daily summary |
| `/transactions` | Recent transactions |
| `/live` | MLB.TV stream links |
| `/stats-reference` | Sabermetric glossary |
| `/gambling-reference` | Gambling terms glossary |
| `/baseball-reference` | Baseball rules reference |
| `/simulation` | Simulation hub — manage leagues and franchises |
| `/franchise/:id` | Franchise detail — season history and advance controls |
| `/simulation/:id` | League command center — schedule, standings, sim controls |
| `/simulation/:id/game/:gameId` | Sim box score |
| `/simulation/:id/roster/:teamId` | Roster editor — drag-and-drop lineup and rotation |
| `/simulation/:id/leaders` | Season stat leaderboards |
| `/simulation/:id/teams` | All-team standings grid |
| `/simulation/:id/team/:teamId` | Individual team page |
| `/simulation/:id/player/:playerId` | Individual player sim stats |
| `/simulation/:id/playoffs` | Playoff bracket, stat leaders, awards, and AI insights |
| `/simulation/:id/awards` | Season awards (MVP, Cy Young, Silver Slugger, Gold Glove) |
| `/simulation/:id/injuries` | Injury tracker |
| `/simulation/:id/news` | Season calendar with AI daily stories |
| `/simulation/:id/config` | League configuration |

---

## Backend Architecture

### Controllers

All controllers in `app/controllers/api/` inherit from `Api::BaseController`. Controllers are thin — no business logic. `BaseController` provides `rescue_from StandardError` → `{ error: message }` with HTTP 502 and a `mlb` lazy helper.

### Services

| Service | Purpose |
|---------|---------|
| `MlbApiService` | MLB Stats API: schedule, scores, players, standings |
| `StatcastService` | Baseball Savant + FanGraphs leaderboards (Statcast, bat-tracking, spray direction) |
| `SimulationService` | League setup, game/day/season simulation, standings, roster management |
| `GameSimulationEngine` | At-bat engine: hit rates, lineup cycling, rotation/bullpen |
| `BullpenManager` | Per-roster pitcher state: rest days, consecutive appearances, seasonal workload caps by role |
| `ManagerStrategy` | In-game decision interface (injury rates, substitution logic); stub today, extensible to difficulty levels |
| `PlayerRatingService` | League-relative 1–3 star ratings: contact/power/discipline (batters), stuff/control/HR prevention (pitchers) |
| `LeagueConstantsService` | Derives MLB baseline rates (K%, BB%, BABIP, ISO, etc.) from DuckDB warehouse at runtime |
| `CacheWarmingService` | Three-tier pre-warming: simulation players (Statcast + projections), FanGraphs leaderboards, and Ottoneu league data |
| `FranchiseService` | Multi-season franchise create/advance |
| `PlayoffSimulationService` | Postseason bracket simulation |
| `AwardService` | Season award voting (MVP, Cy Young, SS, GG) |
| `PlayoffAwardService` | AI-selected playoff MVP awards |
| `SimulationNewsService` | AI-generated daily game stories |
| `SimulationGameInsightsService` | AI insights for individual sim game box scores |
| `SimulationPlayerInsightService` | AI insights for individual player sim seasons |
| `SimulationTeamInsightService` | AI insights for individual team sim seasons |
| `SimulationSeasonInsightService` | AI insights for the full simulated season |
| `SimulationPlayoffInsightService` | AI narrative and bullets for the completed postseason |
| `OpenAi::Client` | All OpenAI calls — never call OpenAI directly |
| `AssistantService` | AI assistant with tool-calling |
| `ProjectionEngine` | Marcel projection math |
| `ProjectionService` | Orchestrates projection runs |
| `ProjectionDataService` | Fetches player data (Statcast, FanGraphs) for projection inputs |
| `YahooFantasyService` | OAuth + Yahoo Fantasy API |
| `OttoneuService` | Scrapes Ottoneu league data: rosters, standings, auctions, waivers, cap, IL status, loans |
| `OttoneuInsightsService` | AI-generated league insights: trends, value targets, cap strategy |
| `OttoneuFreeAgentsService` | FA candidates from warehouse with projection enrichment and AI pickup recommendations |
| `OttoneuLeagueStatsService` | League-wide sortable stats table from DuckDB with salary/PPD/surplus |
| `OttoneuPlayerStatsService` | Per-player warehouse stats lookup (by fg_id or name) |
| `OttoneuPlayerAnalysisService` | Per-player AI analysis: season stats + Steamer projection + IL status + Ottoneu salary context |
| `Warehouse::Manager` | Orchestrates all ingesters + DuckDB build |
| `Warehouse::BatterIngester` | FanGraphs batting → CSV |
| `Warehouse::PitcherIngester` | FanGraphs pitching → CSV |
| `Warehouse::FgProjectionIngester` | Steamer projections → CSV |
| `Warehouse::TeamIngester` | MLB team stats → CSV |
| `Warehouse::OttoneuSalaryIngester` | Ottoneu league salaries → `ottoneu_salaries` CSV |
| `Warehouse::SimulationIngester` | Sim player stats, standings, season log → CSV |
| `Sandbox::DatasetRegistry` | Dataset metadata (columns, row counts, default SQL) |
| `Sandbox::QueryService` | Read-only SQL execution against DuckDB |

### OpenAI Integration

All AI calls go through `OpenAi::Client#json_completion`:

```ruby
result = client.json_completion(
  system_prompt:    "...",
  user_payload:     { ... },
  interaction_type: "game_insights",  # labels the log entry
  temperature:      0.2               # 0.2 structured / 0.7 creative
)
```

Every call is logged to `log/openai_requests.jsonl`. Error results are never cached.

### Models (SQLite)

**Projection**: `ProjectionScenario`, `PlayerProjection`, `ProjectionRun`

**Simulation**: `SimulationLeague`, `SimulationFranchise`, `SimulationGame`, `SimulationRoster`, `SimulationPlayerStat`, `SimulationPlayoffSeries`, `SimulationPlayoffPlayerStat`, `SimulationJobRun`, `SimulationNewsStory`, `SimulationInjury`, `SimulationTransaction`, `SimulationInsight`, `SimulationConfig`

---

## Frontend Architecture

### Conventions

- All API calls go through `frontend/src/api.js` — never `fetch` in components
- `useQuery` from `@tanstack/react-query` for all data fetching
- `staleTime`: live data 0–2 min · player stats 15 min · leaderboards 30+ min
- Tailwind only — no inline styles, no CSS modules
- Drag-and-drop via `@dnd-kit/core` + `@dnd-kit/sortable`

### Design Tokens

| Class | Role |
|-------|------|
| `text-content-primary` | Main text |
| `text-content-secondary` | Labels |
| `text-content-muted` | Hints, timestamps |
| `text-brand` | Actions, links |
| `bg-bg-surface` | Card background |
| `bg-bg-elevated` | Elevated surfaces |
| `border-bg-border` | Dividers |
| `.card` | Standard card container |
| `.btn-primary` | Primary action button |

### Key Components

| Component | Purpose |
|-----------|---------|
| `StatCard` | Single stat with optional percentile bar |
| `FactoidsPanel` | AI factoids — pass `queryKey` + `queryFn` |
| `FloatingAssistant` | Slide-in AI chat sidebar |
| `sim/SimUI` | Shared sim primitives: `TeamLogo`, `SimPlayerAvatar` |
| `sim/SimStatsTable` | Reusable sortable stats table for sim pages |
| `SimInsightPanel` | AI insight cards for simulation context |
| `ml/LayerBuilder` | NN layer editor with live parameter count |
| `ml/ModelResults` | Training results: metrics, charts, confusion matrix |
| `charts/WinProbabilityChart` | Win probability over game time |
| `charts/SprayChart` | Hit location on field diagram |

---

## Data Sources

| Source | What | Auth |
|--------|------|------|
| MLB Stats API | Schedule, scores, rosters, player bio, standings | None |
| Baseball Savant | Pitch-by-pitch Statcast, bat-tracking (2024+) | None |
| FanGraphs | Leaderboards, advanced metrics, projections, prospects | None |
| ESPN unofficial API | Live odds | None |
| Yahoo Fantasy API | Fantasy roster, matchup, transactions | OAuth 2.0 |
| OpenAI | All AI features | API key |

---

## Adding New Endpoints

1. **Route** — add to `config/routes.rb` under `namespace :api`
2. **Controller** — add action in `app/controllers/api/`, inherit `Api::BaseController`
3. **Service** — put logic in `app/services/` using `class << self`
4. **Frontend** — add fetch call to `api.js`, use `useQuery` in the component

External HTTP always uses Faraday with explicit timeouts and retry middleware. The caching pattern (class-level `@@cache` with 6-hour TTL, never cache errors) is in `StatcastService`. See `CLAUDE.md` for full project conventions.
