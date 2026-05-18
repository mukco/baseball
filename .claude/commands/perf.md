---
description: Analyze backend_rails/log/perf.jsonl for slow queries, HTTP calls, and request timings. Usage: /perf [question or filter]
---

Read `backend_rails/log/perf.jsonl` (JSONL — one JSON object per line) and answer: $ARGUMENTS

## Log entry shapes

```
{"type":"query",   "duration_ms":N, "sql":"...",    "name":"...",        "ts":"..."}
{"type":"http",    "duration_ms":N, "method":"GET", "url":"...",         "status":N, "ts":"..."}
{"type":"request", "duration_ms":N, "method":"GET", "path":"...",        "status":N,
                   "controller":"...", "action":"...", "ts":"..."}
```

## Common analyses (use when $ARGUMENTS matches or is empty)

| Phrase | What to compute |
|--------|----------------|
| `slowest queries` / empty | Top 10 `type=query` by `duration_ms` desc — show duration, truncated SQL (120 chars), name |
| `slowest requests` | Top 10 `type=request` by `duration_ms` desc — show duration, method, path, status |
| `slowest http` | Top 10 `type=http` by `duration_ms` desc — show duration, method, url (truncate query string), status |
| `summary` | Count + p50/p95/p99 for each type; total entries; earliest and latest ts |
| `by endpoint` | Group `type=request` by path, show count, avg, max duration — sort by avg desc |
| `by url` | Group `type=http` by host+path (strip query string), show count, avg, max |
| `over Nms` | All entries with `duration_ms > N` across all types, sorted by duration desc |
| `recent [N]` | Last N (default 50) entries across all types, in time order |
| `errors` | All `type=http` entries with `status >= 400` or `error` key present |
| `queries for <path>` | Correlate by ts — show queries within ±2s of requests matching that path |

## Output format

- Lead with a one-line answer summary (e.g. "Slowest query: 1 240ms — SELECT simulation_games…")
- Follow with a compact table (no more than 15 rows unless asked for more)
- Round durations to the nearest ms
- If the file does not exist, say so and tell the user to boot the Rails server (`bin/rails s`) to start generating entries
- If the file is empty, say so
- If $ARGUMENTS is empty, default to `summary` then `slowest queries`
