# Statline — Baseball Analytics Platform

A full-featured baseball analytics application built on a Rails 8 API backend, a React/Vite frontend, and a Python ML service. It aggregates data from MLB's Stats API, Baseball Savant (Statcast), FanGraphs, ESPN, and Yahoo Fantasy into a single interface with player profiles, sortable leaderboards, AI-powered insights, a SQL sandbox, a custom projection engine, Yahoo Fantasy integration, and an interactive ML model builder.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Prerequisites](#prerequisites)
- [Environment Variables & Credentials](#environment-variables--credentials)
- [Running the App](#running-the-app)
- [Yahoo Fantasy Setup (OAuth + Tunnel)](#yahoo-fantasy-setup-oauth--tunnel)
- [Data Warehouse & Sandbox](#data-warehouse--sandbox)
- [ML Builder](#ml-builder)
- [Pages & Features](#pages--features)
- [Backend Architecture](#backend-architecture)
- [Frontend Architecture](#frontend-architecture)
- [Data Sources](#data-sources)
- [Adding New Endpoints](#adding-new-endpoints)

---

## Architecture Overview

```
baseball/
├── start.sh                         # One-command startup script (Rails + ML service + Vite)
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
│   │   │   ├── ml_service.rb        # HTTP client calling the Python ML service
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
├── ml_service/                      # Python ML service — runs on :8002
│   ├── main.py                      # FastAPI app: /health, /columns/:table, /train
│   ├── data_loader.py               # Reads from DuckDB warehouse with filter support
│   ├── trainer.py                   # Dispatches to the right model, returns unified result
│   ├── models/
│   │   ├── neural_network.py        # PyTorch MLP — configurable layers, activations, dropout
│   │   └── sklearn_models.py        # Linear Reg, Logistic Reg, Random Forest, Gradient Boosting
│   └── requirements.txt
│
└── frontend/                        # React 18 + Vite + Tailwind — runs on :5173
    ├── vite.config.js               # /api proxy → :8000
    └── src/
        ├── App.jsx                  # Routes
        ├── api.js                   # All fetch() calls (never call fetch directly in components)
        ├── pages/                   # One file per page/route
        ├── components/              # Shared UI components
        │   ├── ml/                  # ML Builder components
        │   └── charts/              # Chart components (Recharts + ECharts)
        └── lib/
            ├── statHelp.js          # STAT_HELP glossary + STAT_ALIASES
            └── gamblingHelp.js
```

The Vite dev server proxies all `/api/*` requests to the Rails backend at `localhost:8000`. The Rails backend calls the ML service directly at `localhost:8002` — the frontend never talks to the ML service directly.

---

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Ruby | 3.3+ | Use rbenv or rvm |
| Bundler | 2.x | `gem install bundler` |
| Node.js | 18+ | |
| npm | 9+ | |
| Python | 3.9+ | Required for Sandbox and ML Builder |
| DuckDB Python package | latest | `pip install duckdb` — required for Sandbox |
| PyTorch + scikit-learn | latest | `pip install -r ml_service/requirements.txt` — required for ML Builder |

`start.sh` checks for missing Python packages and installs them automatically.

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
Used by the floating AI assistant, game insights, factoids, daily digest, fantasy insights, the "Picks" feature, and the ML Builder assistant tools. Get one at [platform.openai.com](https://platform.openai.com/).

The model defaults to `gpt-4.1`. All AI calls go through `OpenAi::Client#json_completion`, which logs every request to `log/openai_requests.jsonl`.

#### `YAHOO_CLIENT_ID` + `YAHOO_CLIENT_SECRET` — **Required for /fantasy**
Yahoo Fantasy uses OAuth 2.0. See the [Yahoo Fantasy Setup](#yahoo-fantasy-setup-oauth--tunnel) section.

#### `YAHOO_LEAGUE_ID` — **Required for /fantasy**
The numeric ID from your league URL. For `baseball.fantasysports.yahoo.com/b1/211665`, the league ID is `211665`.

#### `YAHOO_REDIRECT_URI` — **Managed automatically by start.sh**
OAuth callback URL. Must be HTTPS — handled via localtunnel. See Yahoo section.

#### No key required
MLB Stats API, Baseball Savant, FanGraphs, and ESPN are free public endpoints.

---

## Running the App

```bash
./start.sh
```

This script starts three services:
1. Rails API on `:8000`
2. Python ML service on `:8002`
3. Vite dev server on `:5173`

It also checks and installs Ruby gems, npm packages, and Python ML dependencies automatically.

Open **http://localhost:5173** in your browser.

To start services manually:

```bash
# Terminal 1 — backend
cd backend_rails && bundle exec rails server -p 8000

# Terminal 2 — ML service
cd ml_service && python main.py

# Terminal 3 — frontend
cd frontend && npm run dev
```

---

## Yahoo Fantasy Setup (OAuth + Tunnel)

### The Problem

Yahoo's OAuth requires the redirect URI to be HTTPS, but the backend runs on plain HTTP locally. You need a tunnel to bridge this.

### The Solution: localtunnel

`start.sh` automatically starts a localtunnel (`npx localtunnel --port 8000`) giving you a temporary HTTPS URL like `https://happy-tiger-12.loca.lt`. This is written to `.env` as `YAHOO_REDIRECT_URI`.

**The tunnel URL changes on every restart.** Each time it changes you must update the Redirect URI in your Yahoo app settings.

### One-Time Setup Steps

1. Go to [developer.yahoo.com/apps](https://developer.yahoo.com/apps/) → **Create App**
2. Fill in:
   - **Application Type**: Web Application
   - **Callback Domain**: `loca.lt`
   - **API Permissions**: Fantasy Sports → Read
3. Copy **Client ID** and **Client Secret** into `backend_rails/.env`
4. Run `./start.sh` — it prints the current tunnel URL
5. Paste that URL into your Yahoo app's **Redirect URI(s)** field
6. Open http://localhost:5173/fantasy → click **Connect Yahoo Fantasy**
7. Tokens are saved to `backend_rails/tmp/yahoo_tokens.json` — tunnel not needed again until tokens expire

### Alternatives to localtunnel

- **ngrok**: `ngrok http 8000` — set `YAHOO_REDIRECT_URI` manually in `.env`
- **Cloudflare Tunnel**: `cloudflared tunnel --url http://localhost:8000` — free and stable

To re-authorize: delete `backend_rails/tmp/yahoo_tokens.json` and re-run `./start.sh`.

---

## Data Warehouse & Sandbox

The **Sandbox** (`/sandbox`) is an in-browser SQL interface backed by a DuckDB warehouse.

### How It Works

1. **Refresh Data** (button in Sandbox, or `POST /api/sandbox/refresh`) triggers `Warehouse::Manager.refresh!`
2. Ingesters fetch CSVs from FanGraphs and Baseball Savant:
   - `BatterIngester` — FanGraphs batting + discipline + Savant bat-tracking (2010–present)
   - `PitcherIngester` — FanGraphs pitching + FIP components
   - `FgProjectionIngester` — Steamer/ZiPS projections
   - `TeamIngester` — team batting and pitching splits
3. Each ingester writes a CSV to `backend_rails/tmp/warehouse/`
4. `warehouse_build.py` loads those CSVs into `backend_rails/tmp/warehouse/baseball.duckdb`
5. SQL queries run via `sandbox_duckdb_query.py` against that file

**Python + `pip install duckdb` required** for steps 4–5.

### Notes

- Bat-tracking stats (`bat_speed`, `swing_length`, `hard_swing_rate`, `squared_up_per_swing`, `blast_per_swing`) only available from **2024** onward — earlier rows have NULL.
- Warehouse covers seasons 2010–present.
- Refresh takes 1–3 minutes. Cached for 6 hours.
- Only read-only SELECT queries allowed.
- If you add/remove columns from any ingester's `NAMED_COLUMNS`, the schema fingerprint changes and the warehouse is treated as stale automatically.

---

## ML Builder

The **ML Builder** (`/ml`) lets you train machine learning models on warehouse stats directly from the browser — no code required.

### Architecture

The ML service is a separate FastAPI process (`ml_service/`) on port **8002**. The Rails backend proxies requests to it via `MlService` (Faraday client, 180s timeout). The frontend never calls the ML service directly.

```
Browser → Rails :8000/api/ml/train → MlService → ml_service :8002/train → DuckDB warehouse
```

The ML service reads training data directly from the DuckDB file — no row serialization over HTTP.

### Supported Models

| Model | Task |
|-------|------|
| Linear Regression | Regression |
| Logistic Regression | Classification |
| Random Forest | Both |
| Gradient Boosting | Both |
| Neural Network (PyTorch MLP) | Both |

### What You Can Configure

- **Data source** — any warehouse table (batters, pitchers, teams, projections)
- **Feature columns** — multi-select; hover for stat definitions
- **Target column** — what you're predicting
- **Task** — regression (continuous) or classification (categorical)
- **One-hot encoding** — bins a continuous target into quantile-based classes (e.g. tier_1 through tier_4)
- **Test split** — fraction of rows held back for evaluation
- **Hyperparameters** — per-model panel:
  - **NN**: hidden layers (add/remove, set neuron count), activation function, learning rate, epochs, dropout
  - **RF / GB**: n_estimators, max_depth, learning rate
  - **Linear / Logistic**: regularization type and strength

### Neural Network Features

- **Live parameter count** — displayed in the UI as you adjust layers, computed in JavaScript before training starts
- **Architecture diagram** — layered boxes showing Input → Dense layers → Output
- **Loss curve** — per-epoch training loss chart after training completes

### Results

| Output | When shown |
|--------|-----------|
| R², RMSE, MAE | Regression |
| Accuracy, F1, Precision, Recall | Classification |
| Confusion matrix (color-coded) | Classification |
| Feature importance chart | All models except NN |
| Training loss curve | Neural network only |
| Parameter count + architecture string | Neural network only |

### Educational Explainer

Click **"How it works"** in the header to open an inline panel covering:
- What a neural network is (neurons, weights, backpropagation)
- What a parameter is (with the math)
- Regression vs. Classification
- Activation functions (ReLU, Tanh, Sigmoid, Leaky ReLU)
- Overfitting and dropout
- Random Forest vs. Gradient Boosting

Every hyperparameter input also has a tooltip explaining what it does.

### Assistant Integration

The floating AI assistant has two ML tools:
- `get_ml_columns` — lists available columns for a table
- `train_ml_model` — trains a model and returns results conversationally

Example: *"Train a random forest to predict ERA using k_pct, bb_pct, and gb_pct"* — the assistant will call the tool and explain the results.

### Requirements

```bash
pip install -r ml_service/requirements.txt
# fastapi, uvicorn, scikit-learn, torch, numpy, pandas, duckdb
```

The warehouse must be built first (hit Refresh in Sandbox). If the warehouse doesn't exist, the ML service returns a clear error.

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
| `/ml` | ML Builder | Train ML models on warehouse stats; configure features, hyperparameters, NN layers |
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

A floating **AI Assistant** is available on every page with access to player stats, game data, the SQL sandbox, and the ML Builder via tool-calling.

---

## Backend Architecture

### Controllers

All controllers live in `app/controllers/api/` and inherit from `Api::BaseController`. Controllers are thin — no business logic, just `render json: SomeService.call(...)`.

`BaseController` provides:
- `rescue_from StandardError` → returns `{ error: message }` with HTTP 502
- `mlb` helper that lazy-initializes `MlbApiService`

### Services

| Service | Purpose |
|---------|---------|
| `MlbApiService` | MLB Stats API: schedule, player info, stats, standings, team data |
| `StatcastService` | Baseball Savant (pitch-by-pitch CSVs) + FanGraphs leaderboards |
| `MlService` | HTTP client calling the Python ML service on :8002 |
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
| `HoverStatsService` | Quick stats for player hover cards |
| `Warehouse::*` | Data ingestion pipeline |
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

Every call is logged to `log/openai_requests.jsonl` with timing, token counts, and a redacted preview.

### Caching

Services cache externally-fetched data in class-level hashes (`@@cache`, `@@cache_timestamps`) with a 6-hour TTL. Error results are never cached. The pattern is in `StatcastService` and documented in `CLAUDE.md`.

### Models (SQLite)

SQLite is used only for projection persistence: `ProjectionScenario`, `PlayerProjection`, `ProjectionRun`.

---

## Frontend Architecture

### Data Fetching

All API calls go through `frontend/src/api.js`. Never call `fetch` directly from a component. Use `useQuery` from `@tanstack/react-query` for all data fetching.

`staleTime` by convention: live game data 0–2 min · player stats 15 min · leaderboards 30+ min.

### Styling

Tailwind only — no inline styles, no CSS modules.

| Token class | Usage |
|-------------|-------|
| `text-content-primary` | Main text |
| `text-content-secondary` | Labels, secondary |
| `text-content-muted` | Timestamps, hints |
| `text-brand` / `text-brand-light` | Links, actions |
| `bg-bg-surface` | Card backgrounds |
| `bg-bg-elevated` | Elevated surfaces |
| `border-bg-border` | Dividers |

Reusable component classes in `index.css`: `.card`, `.btn-primary`, `.tab-active`, `.tab-inactive`, etc.

### Key Components

| Component | Purpose |
|-----------|---------|
| `StatCard` | Single numeric stat with optional percentile bar |
| `FactoidsPanel` | AI factoids — accepts `queryKey` + `queryFn` |
| `FloatingAssistant` | Slide-in AI chat sidebar |
| `ml/LayerBuilder` | NN layer configuration with live architecture diagram |
| `ml/ModelResults` | Training results: metrics, loss curve, feature importance, confusion matrix |
| `ml/NNExplainer` | Educational explainer for ML concepts |
| `charts/PitchMovementChart` | H/V break scatter plot |
| `charts/SprayChart` | Hit location scatter on field diagram |
| `charts/WinProbabilityChart` | Game win probability over time |

---

## Data Sources

| Source | What it provides | Auth |
|--------|-----------------|------|
| MLB Stats API (`statsapi.mlb.com`) | Schedule, scores, player bio, standard stats, standings, rosters | None |
| Baseball Savant (`baseballsavant.mlb.com`) | Pitch-by-pitch Statcast CSV, bat-tracking leaderboard (2024+) | None |
| FanGraphs (`fangraphs.com`) | Leaderboards, advanced metrics, projections, prospects | None |
| ESPN unofficial API | Live game odds | None |
| Yahoo Fantasy API | Fantasy roster, matchup, transactions | OAuth 2.0 |
| OpenAI | All AI features + ML assistant tools | API key |

---

## Adding New Endpoints

Follow these four steps every time:

1. **Route**: Add to `backend_rails/config/routes.rb` under `namespace :api`
2. **Controller**: Add an action in `app/controllers/api/` (inherit `Api::BaseController`, one line)
3. **Service**: Put all logic in `app/services/` using `class << self`
4. **Frontend**: Add the fetch call to `frontend/src/api.js`, then use `useQuery` in the component

The caching pattern to copy is in `StatcastService`. External HTTP always uses Faraday with explicit timeouts and retry middleware. See `CLAUDE.md` at the repo root for the full set of project conventions.
