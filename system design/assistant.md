# AI Assistant

A conversational baseball analytics copilot that answers natural-language questions using real-time data via tool calling. Embedded in the frontend as a floating sidebar.

## Overview

Two layers:
- **Backend**: `AssistantService` — manages the tool-calling loop and executes tools
- **Frontend**: `FloatingAssistant` component — chat UI with context awareness and localStorage history

## Tool-Calling Loop (`AssistantService`)

The service uses the OpenAI chat completions API directly (not through `OpenAi::Client`) because it needs streaming tool calls rather than a single JSON response.

```
POST /api/assistant/ask
  ↓
AssistantService.call(question:, context:, prior_messages:)
  ↓
  Loop (max 6 steps):
    chat_completion → if tool_calls present:
      execute_tool(name, args) for each call
      append tool results to messages
    else:
      final_text = content, break
  ↓
  Return { answer:, tools: (trace), charts: }
```

### Tool Definitions (14 tools)

| Tool | What it calls |
|---|---|
| `query_players_sql` | `Sandbox::QueryService.run` |
| `search_players` | `MlbApiService#search_players` |
| `get_player_profile` | `MlbApiService#player_info` + `player_season_stats` |
| `get_player_game_log` | `MlbApiService#player_game_log` |
| `get_player_career_stats` | `MlbApiService#player_career_stats` |
| `get_statcast` | `StatcastService.pitcher` / `.batter` |
| `get_team_profile` | `MlbApiService#team_info` |
| `get_standings` | `MlbApiService#standings` |
| `get_schedule` | `MlbApiService#schedule` |
| `get_game_details` | `MlbApiService#game_details` |
| `get_leaderboards` | `StatcastService.batting_leaderboard` / `.pitching_leaderboard` |
| `get_news` | `NewsService.fetch` |
| `create_chart` | Returns chart spec (type, title, xKey, yKey, data) |

Each `execute_tool` call is wrapped in `rescue StandardError => e` — tool failures return `{ error: e.message }` and do not abort the loop.

### Chart Data Injection

GPT occasionally calls `create_chart` in the same batch as a data-fetch tool, before the data is available. The service works around this by tracking `last_batch_rows` — the extracted rows from the most recent data tool result — and injecting them into `create_chart` if its `data` argument is blank:

```ruby
if name == "create_chart" && args["data"].blank? && last_batch_rows.present?
  args = args.merge("data" => last_batch_rows)
end
```

`extract_rows` normalizes different result shapes (arrays, SQL `{columns, rows}` pairs) into a flat array of hashes.

### System Prompt

Built dynamically at call time. Includes:
- Today's date and current season
- Descriptions of all 14 tools with guidance on when to use each
- Explicit instructions to always call `create_chart` after returning leaderboard/rankings/comparison data
- Available seasons from `Sandbox::PlayersDatasetBuilder.metadata`

## Frontend (`FloatingAssistant`)

A slide-in sidebar that appears on every page. Key behaviors:

- **Context awareness**: Sends `{ pageType, gamePk, playerId, teamId, pathname }` from the current route to every request. The backend system prompt surfaces this so the assistant knows what the user is looking at.
- **Conversation history**: Prior messages are stored in `localStorage` (key: `statline_assistant_messages`) and sent as `prior_messages` on each request, giving the model multi-turn memory across page navigations.
- **Chart rendering**: The response `charts` array is rendered inline in the assistant's message via `DynamicChart`. Chart specs (`type`, `title`, `xKey`, `yKey`, `data`) come directly from the `create_chart` tool result.
- **Markdown rendering**: Responses render via `react-markdown` with KaTeX for LaTeX formulas and syntax highlighting for code blocks.
- **Tool trace**: Each tool call is shown as a collapsed `<details>` block with the tool name and a preview of the result.

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | (required) | Auth |
| `OPENAI_MODEL` | `gpt-4.1` | Model used for all assistant calls |
| `OPENAI_BASE_URL` | `https://api.openai.com` | Allows routing to a proxy or compatible API |
| `OPENAI_PROJECT` | (optional) | OpenAI project ID for usage tracking |

## Limits

- Max 6 tool-calling steps per request (prevents runaway loops)
- If the loop exhausts 6 steps without a final text response, returns a fallback message
- No server-side conversation storage — history is managed entirely by the client
