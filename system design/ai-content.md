# AI Content Generation

Four services that enrich the app with AI-generated narrative and analytical content. All use `OpenAi::Client#json_completion` and cache results in-memory with varying TTLs matched to how frequently the underlying data changes.

## Shared Pattern

All four services follow the same structure:
1. Build a rich context payload from live MLB data and/or stats
2. Call `OpenAi::Client#json_completion(system_prompt:, user_payload:, interaction_type:, temperature:)`
3. Extract the `output` from the response and cache it
4. Return the cached value on subsequent calls within the TTL

Every call is logged to `log/openai_requests.jsonl` by `OpenAi::RequestTracker` with request ID, model, latency, token usage, and a redacted prompt/response preview.

---

## FactoidsService

Generates 3–5 short, specific factoids for a player, team, or game.

**Context assembled:**
- *Player*: bio, season stats, recent game log (5 games), career context
- *Team*: standing, division, recent 5 games, top hitters/pitchers by WAR
- *Game*: matchup metadata, team records, boxscore (if final)

**Caching TTLs** (in-memory, class-level `@@cache`):
| Context | Status | TTL |
|---|---|---|
| Player / Team | — | 6 hours |
| Game | Preview | 5 minutes |
| Game | Live | 5 minutes |
| Game | Final | 24 hours |

`temperature: 0.7` — slightly higher for creative variety across repeated calls.

**Frontend**: `FactoidsPanel` component renders factoids as a collapsible section with sentiment-based bullet colors. Numbers in factoid text are highlighted automatically via regex.

---

## GameInsightsService

Generates structured analysis for a game with four fixed categories:
- `key_takeaways` — top-level narrative observations
- `matchup_edges` — which team has the advantage and why
- `risk_flags` — concerns or uncertainties
- `watch_list` — players to track

**Context assembled:** game metadata (status, teams, venue), team advanced stats (wOBA, FIP, K%, BB%), full boxscore.

**Caching:** 10-minute in-memory TTL. Supports a `refresh: true` parameter that bypasses the cache and forces a new generation. The response includes a `generatedAt` timestamp and `cacheHit` boolean.

`temperature: 0.2` — structured output, consistent formatting.

---

## DailySummaryService

Generates a daily editorial digest: stories from around the league plus statistical trend items.

**Context assembled:**
- Yesterday's game scores and key plays
- Current standings (all 6 divisions)
- FanGraphs batting and pitching leaderboard leaders (top 10)
- Recent news headlines (top 15)

**Output shape (from OpenAI):**
```json
{
  "stories": [
    { "type": "game|transaction|milestone|storyline", "headline": "...", "body": "...", "players": [...] }
  ],
  "trends": [
    { "label": "...", "hook": "...", "stat": "...", "direction": "up|down|neutral" }
  ]
}
```

After generation, player names in stories are cross-referenced against `NewsService` to resolve to player IDs (enabling frontend links).

**Caching:** Until end of day — the cache key includes the date (`YYYY-MM-DD`) so each calendar day gets exactly one generation. Supports `refresh: true` to regenerate.

`temperature: 0.4` — factual but with editorial voice.

---

## GemsService

Identifies investment opportunities (buy-low/sell-high candidates) using SQL queries against the DuckDB dataset rather than relying solely on OpenAI narrative.

**Categories:**
| Category | Signal | Logic |
|---|---|---|
| BABIP Unlucky | Expected regression buy | BABIP < .260, wRC+ > 100, min 200 PA |
| Emerging | Elite rate stats, low counting | High barrel%, K% < 22%, BB% > 9%, min 150 PA |
| Sell High | BABIP-inflated performance | BABIP > .370, xwOBA significantly < wOBA |
| FIP Divergence (pitching) | ERA > FIP, improvement incoming | ERA - FIP > 1.5, FIP < 3.80, min 30 IP |

Each category runs a DuckDB SQL query against the current season. Results are then summarized (optionally) or returned as structured data.

**Caching:** 30-minute in-memory TTL.

---

## OpenAI Client

All four services use `OpenAi::Client` which:
- Always uses JSON mode (`response_format: { type: "json_object" }`)
- Logs every request to `log/openai_requests.jsonl` (via `OpenAi::RequestTracker`) with file locking for concurrent writes
- Retries up to 2 times on transient Faraday errors (0.5s interval)
- 25s timeout, 8s open timeout
- Redacts API keys from logged previews
