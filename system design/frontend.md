# Frontend

React single-page application built with Vite, Tailwind, and React Query. Proxies all `/api` requests to the Rails backend on port 8000.

## Stack

| Layer | Technology |
|---|---|
| Build | Vite + React |
| Styling | Tailwind CSS (custom design tokens) |
| Data fetching | TanStack React Query |
| Routing | React Router v6 |
| Charts | Recharts |
| Markdown | react-markdown + remark-math + KaTeX |

## Pages

| Route | Page | Data sources |
|---|---|---|
| `/` | Today | Schedule, standings, factoids per game |
| `/game/:gamePk` | GameDetails | Game details, plays, insights, factoids |
| `/player/:id` | PlayerProfile | Player info, season/career stats, Statcast, projections, game log |
| `/team/:id` | TeamProfile | Team info, roster, standings, recent games |
| `/leaderboards` | Leaderboards | FanGraphs batting/pitching leaderboards |
| `/digest` | DailySummary | AI-generated stories and trends |
| `/news` | News | Aggregated feed with search/filter |
| `/sandbox` | Sandbox | SQL query interface |
| `/live/:gamePk` | LiveTV | MLB.TV embed |

## Data Fetching

All API calls go through `/frontend/src/api.js`. Components use `useQuery` from React Query — **never call `fetch` directly in a component**.

```js
// api.js — add new endpoints here
stats: {
  statcastPitching: (id, season) => fetchJSON(`/stats/${id}/statcast/pitching?season=${season}`),
}
```

```jsx
// component — use useQuery
const { data, isLoading } = useQuery({
  queryKey: ['statcast-pitching', playerId, season],
  queryFn: () => api.stats.statcastPitching(playerId, season),
  staleTime: 15 * 60 * 1000,
})
```

`staleTime` guidance: live game data 0–2 min, player stats 15 min, leaderboards 30+ min.

## Components

### `StatCard`
Displays a single numeric stat. Props:
- `label`, `value` — required
- `percentile` — shows a color-coded progress bar (red 0–33, yellow 34–66, green 67–100)
- `progress` — `{ current, target }` for pace-toward-projection bars
- `comparison` — `{ projectedLabel, status, color }` for above/below projection indicator
- `invert` — reverses percentile color scale (lower is better, e.g. ERA)
- `subtitle` — small text below the value

### `FactoidsPanel`
Reusable AI factoids display. Takes `queryKey` and `queryFn` — works for players, teams, and games. Numbers in factoid text are automatically highlighted. Renders as a collapsible section.

### `GameCard`
Compact game summary for the Today page. Shows matchup, score/status, probable pitchers. Clicking navigates to GameDetails.

### Charts (`components/charts/`)
| Component | Use |
|---|---|
| `PitchMixChart` | Donut chart of pitcher's pitch type usage |
| `PitchMovementChart` | Scatter plot of horizontal vs. vertical break |
| `SprayChart` | Hit location scatter on a field SVG |
| `DynamicChart` | Generic chart for assistant responses (bar, horizontal_bar, line, scatter) |

## Styling

Tailwind only — no inline styles. Design tokens are defined in `tailwind.config.js` as custom utilities:

| Class | Meaning |
|---|---|
| `card` | Surface card with border and rounded corners |
| `btn-primary` | Primary action button |
| `tab-active` / `tab-inactive` | Pill tab styles |
| `text-content-primary` | Main text |
| `text-content-secondary` | Secondary text |
| `text-content-muted` | Hint/label text |
| `text-brand` / `text-brand-light` | Brand accent |
| `bg-bg-surface` | Page background |
| `bg-bg-elevated` | Elevated card surface |
| `border-bg-border` | Standard border |

## Shared Libraries (`src/lib/`)

- **`teamMeta.js`** — All 30 team ID/abbreviation/name mappings plus aliases. Used for team logo URLs and display names throughout the app.
- **`statHelp.js`** — Definitions, formulas, and interpretations for 80+ baseball stats. Powers the `StatHelpTooltip` component (hover-over stat labels to see explanations with optional LaTeX formulas).

## Theme

The app supports light and dark themes. Theme state lives in `App.jsx` and is toggled by a button in `Navbar`. The current theme class (`dark` or `light`) is applied to the root `<html>` element.

## Proxy Config

`vite.config.js` proxies `/api` and `/mlb` to `http://localhost:8000`. No CORS issues in development. In production, deploy the Rails API to the same origin or configure CORS in `config/initializers/cors.rb`.
