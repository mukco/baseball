# News Aggregation

Aggregates baseball news from four sources into a unified feed with player and team mention extraction.

## Overview

`NewsService` is a class-only service that fetches, normalizes, deduplicates, and enriches news items on each request. No persistent caching — the controller calls it fresh each time, and the client uses React Query's `staleTime` for browser-side caching.

## Sources

| Source | Format | URL |
|---|---|---|
| MLB.com | RSS | `https://www.mlb.com/feeds/news/rss.xml` |
| FanGraphs | RSS | `https://www.fangraphs.com/blogs/feed/` |
| MLB Trade Rumors | RSS | `https://www.mlbtraderumors.com/feed` |
| r/baseball | JSON | `https://www.reddit.com/r/baseball.json?limit=25` |

Each source is fetched with a 10-second timeout. Source failures are caught individually so a single unavailable source doesn't fail the whole response.

## Processing Pipeline

1. **Fetch**: Parallel Faraday requests to all four sources
2. **Parse**: RSS feeds parsed as XML; Reddit parsed as JSON
3. **Normalize**: Each item shaped into `{ source, title, url, summary, publishedAt }`
4. **Sanitize**: HTML tags stripped from titles and summaries; XML entities decoded
5. **Deduplicate**: Items with the same URL are collapsed (keeps first occurrence)
6. **Sort**: All items sorted descending by `publishedAt`
7. **Limit**: Max 100 items returned (configurable per request, default 50)
8. **Mention extraction**: Player and team names matched against a pre-loaded CSV index

## Player and Team Mention Extraction

After aggregation, each item's title and summary are scanned for player and team name matches:
- Player names are matched against a name index built from `mlb_players.csv`
- Team names and abbreviations matched against a static mapping
- Matches are returned as `{ players: [{ id, name }], teams: [{ id, abbreviation }] }` arrays on each item

The frontend uses these to render clickable player/team links inline within news items.

## API

```
GET /api/news?topic=<source>&limit=<n>
```

`topic` filters to a single source (`mlb`, `fangraphs`, `mlbtr`, `reddit`) or returns all sources (`all`, the default).

The assistant's `get_news` tool calls this endpoint and slims the response to just `source`, `title`, `summary`, `url`, `publishedAt` (no mention arrays needed for the LLM context).
