# Statline — Baseball Stats App

A clean, modern baseball analytics app that pulls data from Statcast, the MLB Stats API, and FanGraphs. Designed to surface the stats that matter without the visual noise of traditional sites like FanGraphs.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Data Sources](#data-sources)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Backend Setup](#backend-setup)
  - [Frontend Setup](#frontend-setup)
  - [Running the App](#running-the-app)
- [Backend API Reference](#backend-api-reference)
  - [Schedule Endpoints](#schedule-endpoints)
  - [Player Endpoints](#player-endpoints)
  - [Stats Endpoints](#stats-endpoints)
  - [Leaderboard Endpoints](#leaderboard-endpoints)
- [Frontend Structure](#frontend-structure)
  - [Pages](#pages)
  - [Components](#components)
  - [Charts](#charts)
- [Design System](#design-system)
- [Caching](#caching)
- [Extending the App](#extending-the-app)

---

## Overview

Statline has three primary views:

| View | Description |
|------|-------------|
| **Schedule** | Today's MLB games with team logos, scores, game status, and probable pitchers. Date-navigable. |
| **Player Profile** | Full player page with batting, pitching, and fielding tabs. Stat cards show percentile context using a Baseball Savant-style color scale. Pitchers get a pitch movement scatter chart and pitch mix breakdown. Batters get a spray chart. |
| **Leaderboards** | Sortable batting and pitching leaderboards pulled from FanGraphs via pybaseball. |

Player search is available globally via the navbar autocomplete.

---

## Architecture

```
baseball/
├── backend/                  # FastAPI Python service
│   ├── main.py               # App entry point, CORS config, router registration
│   ├── requirements.txt      # Python dependencies
│   ├── routers/
│   │   ├── schedule.py       # /api/schedule/* endpoints
│   │   ├── players.py        # /api/players/* endpoints
│   │   └── stats.py          # /api/stats/* and /api/leaderboards/* endpoints
│   └── services/
│       ├── mlb_api.py        # MLB Stats API client (schedule, player info, standard stats)
│       └── statcast.py       # pybaseball client (Statcast, FanGraphs leaderboards)
│
└── frontend/                 # React + Vite + Tailwind
    ├── index.html
    ├── vite.config.js        # Vite config with /api proxy to :8000
    ├── tailwind.config.js    # Custom color tokens
    ├── src/
    │   ├── main.jsx          # React root, QueryClient, BrowserRouter
    │   ├── App.jsx           # Route definitions
    │   ├── api.js            # Typed fetch wrappers for all backend endpoints
    │   ├── index.css         # Tailwind base + component layer
    │   ├── pages/
    │   │   ├── Today.jsx         # Date-navigable schedule view
    │   │   ├── PlayerProfile.jsx # Player stat page with tabs
    │   │   └── Leaderboards.jsx  # Sortable FanGraphs leaderboards
    │   └── components/
    │       ├── Navbar.jsx        # Sticky nav with live player search
    │       ├── GameCard.jsx      # Individual game card
    │       ├── StatCard.jsx      # Stat value card with percentile bar
    │       └── charts/
    │           ├── PitchMovementChart.jsx  # H/V break scatter (Recharts)
    │           ├── PitchMixChart.jsx       # Usage horizontal bar chart
    │           └── SprayChart.jsx          # Hit location scatter
```

The frontend uses Vite's dev-server proxy so all `/api/*` requests are forwarded to the FastAPI backend on port 8000 — no CORS issues during development, and no environment variables needed for the API URL.

---

## Data Sources

| Source | What it provides | Auth required |
|--------|-----------------|---------------|
| [MLB Stats API](https://statsapi.mlb.com/api/v1) | Schedule, scores, lineups, probable pitchers, player bios, standard season stats | None |
| [Baseball Savant / Statcast](https://baseballsavant.mlb.com) | Pitch-by-pitch data (velocity, spin, movement, exit velocity, launch angle, barrel rate, etc.) via pybaseball | None |
| [FanGraphs](https://fangraphs.com) | Advanced metrics (wRC+, FIP, xFIP, SIERA, WAR) via pybaseball leaderboards | None |

All three sources are free and require no API key.

---

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- npm 9+

### Backend Setup

```bash
cd backend
pip install -r requirements.txt
```

**requirements.txt** installs:
- `fastapi` — web framework
- `uvicorn[standard]` — ASGI server
- `httpx` — async HTTP client for MLB Stats API calls
- `pybaseball` — wrapper for Statcast and FanGraphs data
- `pandas` — DataFrame processing for Statcast aggregation
- `numpy` — numeric operations
- `python-dotenv` — `.env` file support (optional)

### Frontend Setup

```bash
cd frontend
npm install
```

**package.json** installs:
- `react` + `react-dom` — UI framework
- `react-router-dom` — client-side routing
- `@tanstack/react-query` — data fetching, caching, and loading states
- `recharts` — chart library (scatter, bar)
- `clsx` — conditional class name utility
- `date-fns` — date formatting for the schedule header
- `tailwindcss` — utility-first CSS
- `vite` + `@vitejs/plugin-react` — build tooling

### Running the App

Start the backend in one terminal:

```bash
cd backend
uvicorn main:app --reload --port 8000
```

The `--reload` flag enables hot reloading during development. The interactive API docs are available at [http://localhost:8000/docs](http://localhost:8000/docs).

Start the frontend in a second terminal:

```bash
cd frontend
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## Backend API Reference

The FastAPI app exposes interactive Swagger docs at `/docs` and ReDoc at `/redoc` when running locally.

### Schedule Endpoints

#### `GET /api/schedule/today`

Returns games for today's date (UTC).

**Response:**
```json
{
  "date": "2024-09-15",
  "games": [
    {
      "gamePk": 745528,
      "gameDate": "2024-09-15T17:10:00Z",
      "status": "Final",
      "abstractState": "Final",
      "venue": "Fenway Park",
      "away": {
        "id": 147,
        "name": "New York Yankees",
        "abbreviation": "NYY",
        "score": 3
      },
      "home": {
        "id": 111,
        "name": "Boston Red Sox",
        "abbreviation": "BOS",
        "score": 5
      },
      "awayProbable": { "id": 694973, "name": "Gerrit Cole", "handedness": "R" },
      "homeProbable": { "id": 605397, "name": "Brayan Bello", "handedness": "R" },
      "currentInning": 9,
      "inningHalf": "Bottom"
    }
  ]
}
```

#### `GET /api/schedule/{game_date}`

Returns games for a specific date. `game_date` must be in `YYYY-MM-DD` format.

```bash
GET /api/schedule/2024-07-04
```

---

### Player Endpoints

#### `GET /api/players/search?q={query}`

Searches active MLB players by name. Returns up to 20 results.

**Query parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `q` | string | Yes | Player name (min 2 characters) |

**Response:**
```json
[
  {
    "id": 660271,
    "name": "Shohei Ohtani",
    "team": "Los Angeles Dodgers",
    "teamId": 119,
    "position": "DH",
    "active": true
  }
]
```

#### `GET /api/players/{player_id}`

Returns biographical information for a player.

**Response:**
```json
{
  "id": 660271,
  "name": "Shohei Ohtani",
  "firstName": "Shohei",
  "lastName": "Ohtani",
  "number": "17",
  "position": "DH",
  "positionName": "Designated Hitter",
  "team": "Los Angeles Dodgers",
  "teamId": 119,
  "teamAbbrev": "LAD",
  "birthDate": "1994-07-05",
  "height": "6' 4\"",
  "weight": 210,
  "batSide": "L",
  "pitchHand": "R",
  "active": true,
  "headshotUrl": "https://img.mlbstatic.com/mlb-photos/..."
}
```

---

### Stats Endpoints

#### `GET /api/stats/{player_id}/season?season={year}`

Returns standard MLB season stats (hitting, pitching, fielding) from the MLB Stats API.

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `season` | int | `2024` | MLB season year |

**Response:**
```json
{
  "hitting": {
    "gamesPlayed": 159,
    "avg": ".310",
    "obp": ".390",
    "slg": ".654",
    "ops": "1.044",
    "homeRuns": 44,
    "rbi": 96,
    "stolenBases": 20,
    "strikeOuts": 98,
    "baseOnBalls": 81
  },
  "pitching": null,
  "fielding": {
    "fielding": ".987",
    "errors": 2,
    "putOuts": 143
  }
}
```

#### `GET /api/stats/{player_id}/career?group={group}`

Returns year-by-year career stats.

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `group` | string | `hitting` | `hitting`, `pitching`, or `fielding` |

Returns an array of season objects, each containing the season year and all standard stats for that group.

#### `GET /api/stats/{player_id}/statcast/pitching?season={year}`

Fetches and aggregates Statcast pitch-by-pitch data for a pitcher. **Note: the first call for a player+season will fetch from Baseball Savant and may take 10–30 seconds. Results are cached in memory for the lifetime of the server process.**

**Response:**
```json
{
  "pitchTypes": [
    {
      "type": "FF",
      "name": "4-Seam Fastball",
      "usage": 42.3,
      "avgVelo": 95.1,
      "avgSpin": 2284,
      "hBreak": 9.2,
      "vBreak": 14.1,
      "whiffRate": 21.4,
      "count": 892
    }
  ],
  "movementData": [
    { "type": "FF", "name": "4-Seam Fastball", "hBreak": 9.4, "vBreak": 14.3 }
  ],
  "summary": {
    "avgFastballVelo": 95.1,
    "xwOBA": 0.305,
    "avgExitVelo": 87.2,
    "hardHitPct": 34.1
  },
  "totalPitches": 2108
}
```

`hBreak` and `vBreak` are in inches (converted from Statcast feet).

#### `GET /api/stats/{player_id}/statcast/batting?season={year}`

Fetches and aggregates Statcast batted-ball data for a hitter.

**Response:**
```json
{
  "summary": {
    "avgExitVelo": 93.2,
    "maxExitVelo": 116.4,
    "hardHitPct": 52.1,
    "barrelPct": 18.3,
    "avgLaunchAngle": 14.2,
    "sweetSpotPct": 36.4,
    "xBA": 0.298,
    "xwOBA": 0.392,
    "sprintSpeed": 27.8
  },
  "sprayData": [
    { "x": 123.4, "y": 87.2, "result": "home_run", "exitVelo": 110.2 }
  ]
}
```

`sprayData` uses raw Statcast field coordinates (`hc_x`, `hc_y`) suitable for plotting on a field diagram.

---

### Leaderboard Endpoints

Both leaderboard endpoints call FanGraphs via pybaseball. **The first request for a given season may take 15–30 seconds.** Results are cached in memory.

#### `GET /api/leaderboards/batting?season={year}&min_pa={pa}`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `season` | int | `2024` | Season year |
| `min_pa` | int | `100` | Minimum plate appearances qualifier |

Returns up to 200 qualified batters with columns: `Name`, `Team`, `G`, `PA`, `HR`, `RBI`, `SB`, `AVG`, `OBP`, `SLG`, `OPS`, `wRC+`, `WAR`, `BB%`, `K%`, `BABIP`, `ISO`.

#### `GET /api/leaderboards/pitching?season={year}&min_ip={ip}`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `season` | int | `2024` | Season year |
| `min_ip` | int | `30` | Minimum innings pitched qualifier |

Returns up to 200 qualified pitchers with columns: `Name`, `Team`, `G`, `GS`, `IP`, `W`, `L`, `SV`, `ERA`, `WHIP`, `K/9`, `BB/9`, `FIP`, `xFIP`, `SIERA`, `WAR`, `K%`, `BB%`.

---

## Frontend Structure

### Pages

#### `Today.jsx`

The default landing page. Uses `@tanstack/react-query` to fetch `GET /api/schedule/{date}`.

- Games are split into three sections: **Live**, **Upcoming**, and **Final**
- A date navigation header allows stepping backward/forward by one day
- A "Back to today" shortcut appears when viewing a non-current date
- While loading, a skeleton grid of placeholder cards is shown

#### `PlayerProfile.jsx`

Rendered at `/player/:id`. Fetches player info, season stats, and (lazily) Statcast data.

Statcast data is only requested when the relevant tab is active, preventing slow requests from firing unless the user navigates to that tab.

Three tabs:

| Tab | MLB Stats | Statcast |
|-----|-----------|---------|
| **Batting** | AVG, OBP, SLG, OPS, HR, RBI, SB, K, BB | Exit velo, barrel%, hard hit%, xwOBA, xBA, launch angle, sweet spot%, sprint speed, spray chart |
| **Pitching** | ERA, WHIP, K, BB, W, L, SV, IP, K/9, BB/9 | Pitch arsenal table, movement scatter chart, pitch mix bar chart |
| **Fielding** | Fielding%, errors, putouts, assists, double plays | — |

Percentile color coding on stat cards uses hardcoded 2024 MLB percentile thresholds (see `approxPercentile()` in `PlayerProfile.jsx`). Stats where lower is better (ERA, WHIP, K, BB/9) pass `invert={true}` to `StatCard`.

#### `Leaderboards.jsx`

Rendered at `/leaderboards`. Sortable table for batting and pitching, with a season selector. Click any column header to sort; click again to reverse direction.

---

### Components

#### `Navbar.jsx`

Sticky top navigation bar with:
- Logo linking to `/`
- **Today** and **Leaderboards** nav links (active state highlighted)
- Live player search input with debounced autocomplete dropdown

The search dropdown shows player headshots (from MLB's CDN), name, position, and team. Selecting a result navigates to `/player/:id` and clears the input.

#### `GameCard.jsx`

Displays a single game. Adapts based on game state:
- **Preview**: shows game time and probable pitchers
- **Live**: shows live score, inning/half indicator with a pulsing green dot
- **Final**: shows final score, winner bolded

Probable pitcher names are links to their player profile page.

#### `StatCard.jsx`

Displays a single stat with optional percentile indicator. Exports two components:

**`StatCard`** — full card with label, value, percentile bar, and percentile rank:
```jsx
<StatCard
  label="ERA"
  value="2.84"
  percentile={82}
  invert={true}       // lower is better; inverts the color scale
  subtitle="2024 Season"
/>
```

**`InlineStatRow`** — compact horizontal list of label/value pairs:
```jsx
<InlineStatRow stats={[
  { label: 'AVG', value: '.310' },
  { label: 'OBP', value: '.390' },
]} />
```

---

### Charts

All charts use [Recharts](https://recharts.org) and are wrapped in `<ResponsiveContainer>` for fluid sizing. Each chart has a custom `Tooltip` component styled to match the dark theme.

#### `PitchMovementChart.jsx`

Scatter chart of horizontal break (pfx_x) vs. vertical break (pfx_z) for every sampled pitch. Points are colored by pitch type using a fixed color map:

| Code | Pitch | Color |
|------|-------|-------|
| FF | 4-Seam Fastball | Red |
| SI | Sinker | Orange |
| FC | Cutter | Amber |
| SL | Slider | Green |
| CU | Curveball | Blue |
| CH | Changeup | Purple |
| FS | Splitter | Pink |

A reference line at (0,0) divides arm-side/glove-side and rise/drop quadrants.

Props: `data` (array of `{ type, name, hBreak, vBreak }`), `pitchTypes` (array of pitch type objects for the legend).

#### `PitchMixChart.jsx`

Horizontal bar chart of pitch usage percentages. Each bar is colored to match the pitch type. The tooltip shows velocity, spin rate, and whiff rate on hover.

Props: `pitchTypes` (array from the `/statcast/pitching` endpoint).

#### `SprayChart.jsx`

Scatter chart of batted ball locations using raw Statcast field coordinates. Points are colored by outcome (single=green, double=blue, triple=amber, home_run=red, out=gray).

Props: `data` (array from the `/statcast/batting` endpoint's `sprayData` field).

---

## Design System

Colors are defined as custom Tailwind tokens in `tailwind.config.js`:

| Token | Hex | Usage |
|-------|-----|-------|
| `bg-base` | `#07101F` | Page background |
| `bg-surface` | `#0D1A2D` | Card backgrounds |
| `bg-elevated` | `#142236` | Elevated cards, hover states |
| `bg-border` | `#1C3050` | Borders, dividers |
| `content-primary` | `#E8EDF5` | Main text |
| `content-secondary` | `#7A90AF` | Labels, secondary text |
| `content-muted` | `#4A5A7A` | Timestamps, hints |
| `brand` | `#2563EB` | Links, focus rings, primary actions |
| `brand-light` | `#60A5FA` | Hover states for brand elements |

**Percentile colors** (matches Baseball Savant scale):

| Range | Color | Token |
|-------|-------|-------|
| 90–100th | Red-orange | `stat-elite` (`#FF4500`) |
| 70–89th | Orange | `stat-great` (`#F97316`) |
| 30–69th | Gray | `stat-avg` (`#9CA3AF`) |
| 10–29th | Light blue | `stat-below` (`#60A5FA`) |
| 0–9th | Blue | `stat-poor` (`#2563EB`) |

**Reusable CSS classes** are defined in `index.css` using Tailwind's `@layer components`:

| Class | Description |
|-------|-------------|
| `.card` | Standard surface card |
| `.card-elevated` | Higher-elevation card |
| `.stat-value` | Large monospace stat number |
| `.stat-label` | Small uppercase label |
| `.btn-primary` | Filled blue button |
| `.btn-ghost` | Transparent button |
| `.tab-active` | Active tab pill |
| `.tab-inactive` | Inactive tab pill |

Typography uses **Inter** for UI text and **JetBrains Mono** for all numeric stat values (loaded from Google Fonts in `index.html`).

---

## Caching

**Backend** — Statcast and FanGraphs results are cached in a module-level Python dictionary (`_cache` in `services/statcast.py`) keyed by `{type}_{player_id}_{season}`. This cache lives for the lifetime of the server process. To clear it, restart the server.

For persistent caching across restarts, replace the dict with Redis or a simple SQLite cache.

**Frontend** — TanStack Query is configured with a 5-minute `staleTime` globally. Statcast data uses a 15-minute `staleTime` since it rarely changes. Leaderboard data uses 10 minutes. The query cache persists for the browser session.

---

## Extending the App

### Add a new stat to a player profile

1. Add the stat key to the appropriate section in `PlayerProfile.jsx` (e.g., `BattingTab`)
2. Add a `StatCard` with the value and an optional `percentile` call
3. If you want percentile color coding, add a thresholds entry to `BATTING_THRESHOLDS` or `PITCHING_THRESHOLDS` at the top of `PlayerProfile.jsx`

### Add a new data source

1. Add a new function to `services/mlb_api.py` or `services/statcast.py`
2. Add a new route to the appropriate router file in `routers/`
3. Add a matching fetch function to `frontend/src/api.js`
4. Use `useQuery` in the relevant page component to load and display the data

### Add a new page

1. Create `frontend/src/pages/MyPage.jsx`
2. Add a `<Route path="/my-page" element={<MyPage />} />` in `App.jsx`
3. Optionally add a link to `Navbar.jsx`
4. Add any needed backend endpoints following the pattern in the existing routers

### Add FanGraphs advanced batting stats to player profiles

The FanGraphs leaderboards already include wRC+, FIP, xFIP, etc. To surface these on individual player profiles, add a lookup by player name against the leaderboard data, or use `pybaseball.playerid_lookup(last, first)` to get the FanGraphs ID and then call `pybaseball.batting_stats_bref()` directly.
