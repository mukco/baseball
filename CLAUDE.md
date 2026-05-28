# CLAUDE.md

## Explanations

When explaining how something works, always include relevant code snippets when they are available. Pull from the actual source files rather than writing illustrative pseudocode.

---

## Project Guidance

### Use Global Claude Skills

- In addition to the repo-local guidance in this file, also consult and follow any applicable global Claude skills available under `~/.claude/skills/` (and related global skill directories) whenever they match the task at hand.
- Prefer repo-specific conventions when they conflict with global guidance.

- For Ruby/Rails code changes, follow conventions from `/home/mukco/Documents/code/tools/ruby`.
- Treat those docs as the source of truth for Rails controller, service object, Active Record, Active Job, and testing patterns.
- Prefer existing project style when it conflicts with generic defaults.

## Quick Start

```bash
cd backend_rails && bundle exec rails s -p 8000
cd frontend && npm run dev
```

## Project Overview

Baseball analytics app: Rails 8 API backend + React/Vite frontend.

- Backend: `backend_rails/` — runs on port 8000
- Frontend: `frontend/` — runs on port 5173, proxies `/api` to port 8000

System design docs for each major system are in `system design/`.

---

## Testing

Every service, model, and controller change **must** ship with RSpec specs. This is non-negotiable:

- New service → `spec/services/<name>_spec.rb`
- New model → `spec/models/<name>_spec.rb`
- New controller / route → `spec/requests/<name>_spec.rb`
- New factory required for each new model

Use FactoryBot for AR objects. Stub external calls (MLB API, OpenAI, ProjectionService) with `allow(...).to receive(...)` — specs must not make real HTTP requests. Follow the style of existing specs: `RSpec.describe`, `let`, `subject`, `expect(...).to`.

---

## Backend Conventions

### Controllers

- All API controllers inherit from `Api::BaseController`
- Controllers are thin — all logic lives in services
- `BaseController` provides `rescue_from StandardError` → 502 JSON and a `mlb` helper that lazy-initializes `MlbApiService`
- Render JSON directly: `render json: result`
- No `before_action` authentication — this is an internal app

### Services

- Services use class methods (`class << self`) — no instantiation needed except `MlbApiService` (which takes no meaningful constructor state)
- Copy the caching pattern from `StatcastService` when adding in-memory caching:

```ruby
@@cache = {}
@@cache_timestamps = {}
CACHE_TTL = 6 * 3600  # seconds

def cache_fresh?(key)
  @@cache.key?(key) && @@cache_timestamps[key].to_i > Time.now.to_i - CACHE_TTL
end

def cache_set(key, value)
  @@cache[key] = value
  @@cache_timestamps[key] = Time.now.to_i
end
```

- **Do not cache error results.** Check for `:error` key before calling `cache_set`:

```ruby
result = fetch_something(id)
cache_set(key, result) unless result[:error]
result
```

- External HTTP always uses Faraday with explicit timeouts and the retry middleware:

```ruby
conn = Faraday.new do |f|
  f.request :retry, max: 2, interval: 1.0
  f.response :raise_error
  f.options.timeout      = 30
  f.options.open_timeout = 10
end
```

- Services `rescue => e` at the outermost level and return `{ error: e.message }` — callers check for the `:error` key

### OpenAI Integration

- All AI calls go through `OpenAi::Client#json_completion` — never call the OpenAI API directly
- Pass `interaction_type:` to label log entries (e.g. `"factoids"`, `"game_insights"`)
- `temperature: 0.2` for structured/factual output; `0.7` for creative variety
- Every call is auto-logged to `log/openai_requests.jsonl`
- The assistant (`AssistantService`) bypasses `OpenAi::Client` because it needs tool-calling, not JSON mode — this is intentional

### Adding a New Endpoint

1. Add the route to `config/routes.rb` under `namespace :api`
2. Create or extend a controller in `app/controllers/api/` that inherits from `Api::BaseController`
3. Put all logic in a service in `app/services/`
4. Add the frontend API call to `frontend/src/api.js`

---

## Frontend Conventions

### Data Fetching

- All API calls go through `frontend/src/api.js` — add new endpoints there, never call `fetch` directly in components
- Use `useQuery` from `@tanstack/react-query` for all data fetching
- Always set `staleTime`: live game data 0–2 min, player stats 15 min, leaderboards 30+ min
- Query keys follow the pattern `['resource-name', id, season, ...]`

### Visual Language — Reuse First

> Full design system reference: `system design/ui-design-system.md` — consult it before building any new UI.

**Before building any new UI, find the closest existing component and copy its structure exactly.** Do not invent new layouts for things the app already renders.

Key patterns to reuse:

| What you're building | Copy from |
|---|---|
| **Non-compact player card** (trade target, FA rec, analysis result) | `PlayerCardHeader` — see below |
| Compact list row (trade builder, stat tables, league stats list) | `TradeSidePlayerList` `PlayerRow` — w-9 avatar, name+pos left, `divide-x` columns right |
| Single stat metric column | The `px-3 text-right min-w-[56px]` block: large number + small label + optional percentile bar |
| Salary badge | `salaryBadge()` helper |
| PPD color | `ppdColor()` helper |
| Surplus color | inline: green ≥10, primary ≥0, amber ≥-10, red below |
| Factoid / AI insight | `FactoidsPanel` |
| Tab bar | `tab-active` / `tab-inactive` token classes |

#### `PlayerCardHeader` — canonical non-compact player card

Use `PlayerCardHeader` for **any player shown outside of a dense list** (trade target results, free-agent recommendations, compare cards, analysis cards, etc.). Never hand-roll a player card layout.

```jsx
<PlayerCardHeader
  playerId={player.player_id}   // MLB ID for headshot
  name={player.name}
  mlbTeam={player.mlb_team}
  positions={player.positions}
  isPitcher={player.group === 'pitcher'}
  warehouseStats={{ avg, ops }}           // or { era, fip, k_per_9 } for pitchers — optional
  salary={player.salary}
  pts={player.approx_fg_pts}
  ppd={player.ppd}
  surplus={player.surplus}
  actions={<button>+ Trade</button>}      // optional right-side action slot
/>
```

Renders: w-9 circular avatar · bold name · `mlbTeam · positions` · optional inline stat chips · `divide-x` salary/pts/PPD/surplus columns with percentile bars · optional `actions` slot.

The `divide-x divide-bg-border/50` metrics block is the canonical way to show side-by-side stat columns. Every player list, picker, and card must use this pattern — not custom flex rows with ad-hoc spacing.

When in doubt: open the existing page that looks most like what you need, read its JSX, and replicate the structure. Never approximate from memory.

### Components

- `StatCard` for any single numeric stat — supports `percentile`, `progress`, `comparison`, and `invert` props
- `FactoidsPanel` for AI factoids — accepts `queryKey` and `queryFn`, handles loading/empty states itself
- Charts live in `components/charts/` — use existing chart components before creating new ones
- New shared UI goes in `components/`; page-specific layout stays in the page file

### Styling

- Tailwind only — no inline styles, no CSS modules
- Use design token classes: `card`, `btn-primary`, `tab-active`, `tab-inactive`
- Text color roles: `text-content-primary`, `text-content-secondary`, `text-content-muted`, `text-brand`, `text-brand-light`
- Surface roles: `bg-bg-surface`, `bg-bg-elevated`, `border-bg-border`

### Adding a New Page

1. Create `frontend/src/pages/MyPage.jsx`
2. Add the route in `frontend/src/App.jsx`
3. Add any new API methods to `frontend/src/api.js`
4. Add any new stat definitions to `frontend/src/lib/statHelp.js`
