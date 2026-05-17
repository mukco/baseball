require "json"

class AssistantService
  MAX_TOOL_STEPS = 6

  TOOL_DEFS = [
    {
      type: "function",
      function: {
        name: "query_players_sql",
        description: <<~DESC.strip,
          Run read-only SQL (DuckDB dialect) against the baseball warehouse. Four tables are available — join them on player_id (integer), fg_id (text), or name + season.

          TABLE: batters
            Seasons 2010–present. Season-level FanGraphs/Statcast batting data.
            Key columns: player_id, fg_id, name, team, league, position, season,
              g, pa, ab, h, hr, r, rbi, sb, bb, k,
              avg, obp, slg, ops, iso, woba, wrc_plus, babip, war,
              k_pct, bb_pct, ld_pct, gb_pct, fb_pct, hr_fb_pct,
              barrel_pct, hard_hit_pct, exit_velocity, sprint_speed.

          TABLE: pitchers
            Seasons 2010–present. Season-level FanGraphs/Statcast pitching data.
            Key columns: player_id, fg_id, name, team, league, season,
              g, gs, w, l, sv, ip, tbf, h, er, hr, bb, k,
              era, fip, xfip, siera, war, whip,
              k_per_9, bb_per_9, k_pct, bb_pct, k_minus_bb_pct,
              babip, gb_pct, ld_pct, fb_pct.

          TABLE: fg_projections_batting
            Current season only. FanGraphs Steamer batting projections.
            Key columns: player_id, fg_id, name, team, season, projection_system,
              g, pa, hr, r, rbi, sb, bb, k,
              avg, obp, slg, ops, iso, woba, wrc_plus, babip, war, k_pct, bb_pct.

          TABLE: fg_projections_pitching
            Current season only. FanGraphs Steamer pitching projections.
            Key columns: player_id, fg_id, name, team, season, projection_system,
              g, gs, w, l, sv, ip, tbf, k, bb, hr,
              era, fip, xfip, siera, war, whip,
              k_per_9, bb_per_9, k_pct, bb_pct, k_minus_bb_pct, babip, gb_pct.

          JOIN PATTERN (projection vs. actual):
            SELECT b.name, b.season, b.war AS actual_war, p.war AS proj_war
            FROM batters b
            JOIN fg_projections_batting p ON b.player_id = p.player_id AND b.season = p.season
            WHERE b.season = 2024 AND b.pa >= 300
            ORDER BY actual_war - proj_war DESC

          Always alias tables when joining. Use player_id for joins when possible (most reliable); fall back to name only as a last resort.
        DESC
        parameters: {
          type: "object",
          properties: {
            sql: { type: "string" },
            limit: { type: "integer" }
          },
          required: ["sql"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "search_teams",
        description: "Search MLB teams by name, city, or abbreviation. Returns team IDs needed by team tools.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string" }
          },
          required: ["query"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "search_players",
        description: "Search MLB players by name fragment. Returns player IDs needed by other tools.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string" }
          },
          required: ["query"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "get_player_profile",
        description: "Get a player's bio, current team, this season's traditional stats (AVG, HR, ERA, etc.), contract details (salary, AAV, years), and award history from the live MLB API.",
        parameters: {
          type: "object",
          properties: {
            player_id: { type: "integer" },
            season: { type: "integer" }
          },
          required: ["player_id"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "get_player_game_log",
        description: "Get a player's game-by-game log for a season. Use this for recent performance, streaks, slumps, or last-N-games questions.",
        parameters: {
          type: "object",
          properties: {
            player_id: { type: "integer" },
            season: { type: "integer" },
            group: { type: "string", enum: ["hitting", "pitching"], description: "Defaults to hitting." },
            limit: { type: "integer", description: "Number of recent games to return. Defaults to 15." }
          },
          required: ["player_id"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "get_player_career_stats",
        description: "Get a player's year-by-year career stats. Use for career trajectory, peak seasons, or historical context.",
        parameters: {
          type: "object",
          properties: {
            player_id: { type: "integer" },
            group: { type: "string", enum: ["hitting", "pitching"], description: "Defaults to hitting." }
          },
          required: ["player_id"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "get_statcast",
        description: "Get detailed Statcast data for a player: exit velocity, barrel%, hard-hit%, launch angle, spin rates, pitch movement, whiff rates. Use for deep Statcast analysis.",
        parameters: {
          type: "object",
          properties: {
            player_id: { type: "integer" },
            season: { type: "integer" },
            group: { type: "string", enum: ["hitting", "pitching"] }
          },
          required: ["player_id", "group"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "get_team_profile",
        description: "Get a team's record, standing, division context, recent game results, roster, and available leadership/finance data.",
        parameters: {
          type: "object",
          properties: {
            team_id: { type: "integer" }
          },
          required: ["team_id"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "get_team_financials",
        description: "Get a team's payroll and competitive balance tax data, including estimated payroll, CBT payroll, threshold, and remaining space.",
        parameters: {
          type: "object",
          properties: {
            team_id: { type: "integer" },
            season: { type: "integer" }
          },
          required: ["team_id"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "get_fantasy_roster",
        description: "Get your Yahoo Fantasy roster with daily scores, weekly totals, current matchup context, and player status. Returns an error if Yahoo is not connected.",
        parameters: {
          type: "object",
          properties: {
            date: { type: "string", description: "Date for score context in YYYY-MM-DD format. Defaults to today." }
          },
          required: []
        }
      }
    },
    {
      type: "function",
      function: {
        name: "get_fantasy_free_agents",
        description: "Get recommended free agents from your Yahoo league with season points, stats, AI analysis, and playing time context. Returns candidates + AI-generated pickup advice. Only works if Yahoo is connected.",
        parameters: {
          type: "object",
          properties: {
            refresh: { type: "boolean", description: "Force refresh to bypass cache." }
          },
          required: []
        }
      }
    },
    {
      type: "function",
      function: {
        name: "get_standings",
        description: "Get current MLB standings for all divisions including W-L, GB, last-10 record, and streak.",
        parameters: {
          type: "object",
          properties: {
            season: { type: "integer", description: "Defaults to current season." }
          },
          required: []
        }
      }
    },
    {
      type: "function",
      function: {
        name: "get_schedule",
        description: "Get the MLB schedule for a specific date including scores, status, and probable pitchers. Defaults to today.",
        parameters: {
          type: "object",
          properties: {
            date: { type: "string", description: "Date in YYYY-MM-DD format. Omit for today." }
          },
          required: []
        }
      }
    },
    {
      type: "function",
      function: {
        name: "get_game_picks",
        description: "Get AI-generated betting picks for a specific game including moneyline, over/under, and player props.",
        parameters: {
          type: "object",
          properties: {
            game_pk: { type: "integer" }
          },
          required: ["game_pk"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "get_game_odds",
        description: "Get real betting lines from ESPN for a specific game: moneyline, spread, over/under with odds. Use this for live odds rather than AI analysis.",
        parameters: {
          type: "object",
          properties: {
            game_pk: { type: "integer" },
            home_team: { type: "string", description: "Home team full name (e.g. 'New York Yankees')" },
            away_team: { type: "string", description: "Away team full name (e.g. 'Boston Red Sox')" },
            game_date: { type: "string", description: "Game date (YYYY-MM-DD)" }
          },
          required: ["game_pk"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "get_game_details",
        description: "Get full box score, advanced metrics, and play context for a specific game by gamePk.",
        parameters: {
          type: "object",
          properties: {
            game_pk: { type: "integer" }
          },
          required: ["game_pk"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "get_leaderboards",
        description: "Get FanGraphs season leaderboards with advanced stats. Use for league-wide rankings of batting (wRC+, OPS, WAR, barrel%) or pitching (ERA, FIP, xFIP, K%).",
        parameters: {
          type: "object",
          properties: {
            group: { type: "string", enum: ["batting", "pitching"], description: "Which leaderboard to fetch." },
            season: { type: "integer" },
            limit: { type: "integer", description: "Number of players to return. Defaults to 25." }
          },
          required: ["group"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "get_news",
        description: "Get recent baseball news from MLB.com, FanGraphs, MLB Trade Rumors, and r/baseball. Optionally filter by player name to find stories about a specific player.",
        parameters: {
          type: "object",
          properties: {
            topic: { type: "string", description: "Filter by source: 'mlb', 'fangraphs', 'mlbtr', 'reddit', or 'all'. Defaults to 'all'." },
            limit: { type: "integer", description: "Number of articles to return. Defaults to 15." },
            player_name: { type: "string", description: "Search for stories mentioning a specific player by name. Returns articles where the player is mentioned." }
          },
          required: []
        }
      }
    },
    {
      type: "function",
      function: {
        name: "create_chart",
        description: "Render a chart inline. Call this every time you have ranked, comparative, or time-series data to show. Choose type: horizontal_bar for leaderboards/rankings, bar for team comparisons, line for trends over time, scatter for two-stat correlations. xKey must exactly match a key present in every data object. yKey must be a numeric key in every data object. data must be the actual array of objects — never use placeholder values.",
        parameters: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: ["bar", "horizontal_bar", "line", "scatter"]
            },
            title: { type: "string" },
            xKey: { type: "string" },
            yKey: { type: "string" },
            data: {
              type: "array",
              items: { type: "object" }
            }
          },
          required: ["type", "title", "xKey", "yKey", "data"]
        }
      }
    }
  ].freeze

  class << self
    def call(question:, context: {}, prior_messages: [])
      raise "Question is required" if question.to_s.strip.blank?

      model = ENV["OPENAI_MODEL"].presence || OpenAi::Client::DEFAULT_MODEL
      base_url = ENV["OPENAI_BASE_URL"].presence || OpenAi::Client::DEFAULT_BASE_URL
      api_key = ENV["OPENAI_API_KEY"].to_s
      raise "OPENAI_API_KEY is not configured" if api_key.blank?

      history = prior_messages.filter_map do |m|
        role = m[:role].to_s
        text = m[:text].to_s
        next if text.blank? || !%w[user assistant].include?(role)
        { role: role, content: text }
      end

      messages = [
        { role: "system", content: system_prompt },
        *history,
        { role: "user", content: JSON.generate({ question: question, page_context: context }) }
      ]

      tool_trace = []
      step = 0
      final_text = nil
      last_batch_rows = nil  # persists across steps so create_chart can use rows from a prior step

      while step < MAX_TOOL_STEPS
        response = chat_completion(api_key:, model:, base_url:, messages:, tools: TOOL_DEFS)
        message = response.dig("choices", 0, "message") || {}
        content = message["content"].to_s
        tool_calls = message["tool_calls"] || []

        if tool_calls.any?
          messages << {
            role: "assistant",
            content: content,
            tool_calls: tool_calls
          }

          tool_calls.each do |call|
            name = call.dig("function", "name")
            args = begin
              JSON.parse(call.dig("function", "arguments").to_s.presence || "{}")
            rescue JSON::ParserError
              {}
            end

            # GPT sometimes batches create_chart alongside a data-fetch call, leaving data empty.
            # Inject the rows from the most recent data tool in this batch.
            if name == "create_chart"
              Rails.logger.info "[AssistantService] create_chart check: data_blank=#{args["data"].blank?} last_rows_class=#{last_batch_rows.class} last_rows_size=#{last_batch_rows&.size}"
              if args["data"].blank? && last_batch_rows.present?
                args = args.merge("data" => last_batch_rows)
                Rails.logger.info "[AssistantService] injected #{last_batch_rows.size} rows into create_chart"
              end
            end

            Rails.logger.info "[AssistantService] tool=#{name} args=#{args.to_json[0, 200]}"
            result = execute_tool(name, args)

            # Harvest rows so create_chart can use them if called in the same batch
            last_batch_rows = extract_rows(result)
            Rails.logger.info "[AssistantService] harvested tool=#{name} result_class=#{result.class} last_rows=#{last_batch_rows&.size}"

            tool_trace << {
              tool: name,
              args: args,
              preview: preview_tool_result(result)
            }

            messages << {
              role: "tool",
              tool_call_id: call["id"],
              content: JSON.generate(result)
            }
          end
        else
          final_text = content
          break
        end

        step += 1
      end

      charts = tool_trace
        .select { |t| t[:tool] == "create_chart" }
        .map    { |t| t[:args].transform_keys(&:to_s) }

      Rails.logger.info "[AssistantService] steps=#{step} tool_trace=#{tool_trace.map { |t| t[:tool] }.inspect} charts_count=#{charts.size}"

      {
        answer: final_text.presence || "I could not complete that request. Try rephrasing with a specific stat, position, and season.",
        context: context,
        tools: tool_trace,
        charts: charts
      }
    end

    private

    def chat_completion(api_key:, model:, base_url:, messages:, tools:)
      connection = Faraday.new(url: base_url) do |f|
        f.request :retry, max: 2, interval: 0.5
        f.response :raise_error
        f.options.timeout = 30
        f.options.open_timeout = 8
      end

      body = {
        model: model,
        messages: messages,
        tools: tools,
        tool_choice: "auto",
        temperature: 0.2
      }

      resp = connection.post("/v1/chat/completions") do |req|
        req.headers["Authorization"] = "Bearer #{api_key}"
        req.headers["Content-Type"] = "application/json"
        req.body = JSON.generate(body)
      end

      JSON.parse(resp.body)
    end

    def execute_tool(name, args)
      mlb    = MlbApiService.new
      season = (args["season"].presence || Date.today.year).to_i

      case name
      when "query_players_sql"
        Sandbox::QueryService.run(sql: args["sql"].to_s, limit: args["limit"].to_i.nonzero? || 200)

      when "search_teams"
        mlb.search_teams(args["query"].to_s)

      when "search_players"
        mlb.search_players(args["query"].to_s)

      when "get_player_profile"
        {
          profile: mlb.player_info(args["player_id"].to_i),
          season_stats: mlb.player_season_stats(args["player_id"].to_i, season)
        }

      when "get_player_game_log"
        group = args["group"].presence || "hitting"
        limit = args["limit"].to_i.nonzero? || 15
        mlb.player_game_log(args["player_id"].to_i, season, group: group, limit: limit)

      when "get_player_career_stats"
        group = args["group"].presence || "hitting"
        mlb.player_career_stats(args["player_id"].to_i, group: group)

      when "get_statcast"
        player_id = args["player_id"].to_i
        group     = args["group"].to_s
        group == "pitching" ? StatcastService.pitcher(player_id, season) : StatcastService.batter(player_id, season)

      when "get_team_profile"
        mlb.team_info(args["team_id"].to_i)

      when "get_fantasy_roster"
        YahooFantasyDashboardService.call(date: args["date"].presence&.to_date || Date.current)

      when "get_fantasy_free_agents"
        YahooFantasyFreeAgentsService.call(refresh: args["refresh"] == true)

      when "get_team_financials"
        TeamFinanceService.fetch(team_id: args["team_id"].to_i, season: season)

      when "get_standings"
        mlb.standings(season)

      when "get_schedule"
        date = args["date"].presence || Date.today.to_s
        mlb.schedule(date)

      when "get_game_picks"
        PicksService.call(game_pk: args["game_pk"].to_i)

      when "get_game_odds"
        date = args["game_date"].presence
        odds = OddsService.today(date: date)
        if args["home_team"] && args["away_team"]
          match = Array(odds[:games]).find { |g|
            g[:home_team] == args["home_team"] && g[:away_team] == args["away_team"]
          }
          match || odds
        else
          odds
        end

      when "get_game_details"
        mlb.game_details(args["game_pk"].to_i)

      when "get_leaderboards"
        group = args["group"].to_s
        limit = args["limit"].to_i.nonzero? || 25
        rows  = group == "pitching" \
          ? StatcastService.pitching_leaderboard(season) \
          : StatcastService.batting_leaderboard(season)
        rows.first(limit)

      when "get_news"
        topic = args["topic"].presence || "all"
        limit = args["limit"].to_i.nonzero? || 15
        if args["player_name"].present?
          NewsService.search_by_player(name: args["player_name"])
        else
          result = NewsService.fetch(topic: topic, limit: limit)
          result[:items].map { |i| i.slice(:source, :title, :summary, :url, :publishedAt) }
        end

      when "create_chart"
        { type: args["type"], title: args["title"], xKey: args["xKey"], yKey: args["yKey"], data: args["data"] }

      else
        { error: "Unknown tool: #{name}" }
      end
    rescue StandardError => e
      { error: e.message }
    end

    # Convert various tool result shapes into a flat array of hashes for create_chart injection.
    def extract_rows(result)
      case result
      when Array
        # get_leaderboards, get_news, get_player_game_log — already an array of hashes
        result.select { |r| r.is_a?(Hash) }.first(50)
      when Hash
        if result[:rows].is_a?(Array) && result[:columns].is_a?(Array)
          # query_players_sql — {columns: [...], rows: [[...], ...]}
          cols = result[:columns]
          result[:rows].map { |row| cols.zip(row).to_h }
        elsif result["rows"].is_a?(Array) && result["columns"].is_a?(Array)
          cols = result["columns"]
          result["rows"].map { |row| cols.zip(row).to_h }
        end
      end
    end

    def preview_tool_result(result)
      str = JSON.generate(result)
      str.length > 280 ? "#{str[0, 280]}..." : str
    rescue StandardError
      result.to_s[0, 280]
    end

    def system_prompt
      meta = Sandbox::PlayersDatasetBuilder.metadata
      available_seasons = Array(meta[:seasons]).sort
      current_season = available_seasons.last || Date.today.year

      <<~PROMPT
        You are Statline Assistant, a sharp baseball analytics copilot embedded in a live MLB stats app.
        Today is #{Date.today.strftime("%B %d, %Y")}. Current season: #{current_season}.

        ## What you can do

        You have a full suite of tools covering live data, historical stats, and analysis:

        **Live MLB data (always current):**
        - get_schedule — today's games, scores, probable pitchers (or any date)
        - get_standings — all division standings with W-L, GB, last-10, streak
        - get_game_details — full box score and advanced metrics for any game
        - get_game_picks — AI betting picks (moneyline, O/U, player props) for a specific game
        - get_game_odds — real betting lines from ESPN (moneyline, spread, total odds) for a game; pass home_team, away_team, game_date for best results
        - get_news — recent headlines from MLB.com, FanGraphs, MLBTR, r/baseball; pass player_name to find stories about a specific player

        **Player data:**
        - search_teams — find a team ID from a team name, city, or abbreviation
        - search_players — find a player ID from a name fragment (do this first if you don't have the ID)
        - get_player_profile — bio, position, current team, contract (salary, AAV, summary), award history, and this season's traditional stats
        - get_player_game_log — game-by-game log; use for streaks, slumps, last-N-games questions
        - get_player_career_stats — year-by-year career breakdown
        - get_statcast — deep Statcast: exit velo, barrel%, spin rate, pitch movement, whiff rates

        **Fantasy (Yahoo):**
        - get_fantasy_roster — your roster with daily scores, weekly totals, matchup context, and player status. Only works if Yahoo is connected.
        - get_fantasy_free_agents — league-aware free-agent candidates with AI recommendations. Only works if Yahoo is connected.

        **Team data:**
        - get_team_profile — standing, recent results, full roster, and available leadership/finance data
        - get_team_financials — payroll, CBT payroll, CBT threshold, and CBT space remaining

        **League-wide analysis:**
        - query_players_sql — DuckDB SQL across four tables (seasons #{available_seasons.first}–#{available_seasons.last}). Use for rankings, comparisons, year-over-year trends, and projection vs. actuals. Join on `player_id`. Tables:
          - `batters` — season batting stats. Key columns: player_id, fg_id, name, team, league, position, season, pa, hr, avg, obp, slg, ops, iso, wrc_plus, woba, babip, war, k_pct, bb_pct, gb_pct, fb_pct, hr_fb_pct, barrel_pct, hard_hit_pct, exit_velocity, sprint_speed.
          - `pitchers` — season pitching stats. Key columns: player_id, fg_id, name, team, league, season, g, gs, ip, tbf, era, fip, xfip, siera, war, whip, k_per_9, bb_per_9, k_pct, bb_pct, k_minus_bb_pct, babip, gb_pct, fb_pct.
          - `fg_projections_batting` — current-season Steamer batting projections. Same key batting columns as `batters` (no Statcast fields).
          - `fg_projections_pitching` — current-season Steamer pitching projections. Same key pitching columns as `pitchers`.
          - Join example: `SELECT b.name, b.war AS actual, p.war AS projected FROM batters b JOIN fg_projections_batting p ON b.player_id = p.player_id AND b.season = p.season`
        - get_leaderboards — FanGraphs batting or pitching leaderboard for quick top-N queries

        **Visualisation (mandatory):**
        - create_chart — **Call this every time you return ranked lists, comparisons, or time-series data.** Never reply with a table or bullet list of stats when a chart would communicate it better. Call it in the same tool-call batch as your last data fetch whenever possible.
          - horizontal_bar → leaderboards, top-N player rankings
          - bar → team comparisons, side-by-side stats
          - line → trends over time (career stats by year, rolling stats)
          - scatter → two-stat correlations (e.g. exit velo vs. HR)
          - xKey must match an actual key in every data object. yKey must be the numeric stat key.

        ## How to behave

        - **Chain tools naturally.** Don't know the player ID? Call search_players first, then the data tool. Got data that could be visualised? Call create_chart before replying.
        - **When a user types @PlayerName or @TeamName in their question, the page_context will include mentionedPlayers or mentionedTeams arrays with name and id.** Use those IDs directly instead of searching again.
        - **Always call create_chart** after fetching leaderboard, rankings, career, game-log, or comparison data. The app renders the chart automatically — don't describe the chart in text, just call the tool.
        - **Use live tools for live questions.** "How did the Yankees do last night?" → get_schedule or get_game_details, not the SQL dataset.
        - **For MLB cap questions, explain that MLB uses the competitive balance tax, not a hard cap.** When a user asks about "cap spend" or "cap space," use get_team_financials and answer with CBT payroll / CBT space unless they clearly want plain payroll.
        - **For contract value questions ("best value contracts", "most underpaid players"), you CAN access individual player contracts via get_player_profile.** However, for cross-player comparisons you need to look up players one at a time since there is no bulk salary query tool. For team-level payroll context, use get_team_financials. If the question covers many players, suggest a focus on specific players or teams rather than trying to scan the whole league.
        - **Use SQL for analytical questions.** "Who leads the NL in wRC+?" → query_players_sql, then create_chart.
        - **Answer general baseball questions directly** (history, rules, records) without needing tools.
        - **Always default to season #{current_season}** unless the user specifies otherwise.
        - Be concise, specific, and cite actual numbers. If a question is ambiguous, pick a sensible interpretation and say so.

        ## SQL Sandbox page

        When `page_context.pageType` is `"sandbox"`, the user is on the DuckDB SQL Sandbox. Additional context may be provided:
        - `page_context.currentSql` — the SQL currently in the editor (may be empty)
        - `page_context.currentError` — the last query error message (if any)

        When on the sandbox page:
        - Help debug or improve the user's `currentSql` if they ask about it.
        - If `currentError` is present, diagnose the cause and suggest a corrected query.
        - When suggesting or correcting SQL, **always output it in a fenced ```sql``` code block** so the user can load it into the editor with one click.
        - The sandbox has four tables (DuckDB dialect):
          - `batters` — season batting stats, 2010–present. Columns: player_id, fg_id, name, team, league, position, season, g, pa, ab, h, hr, r, rbi, sb, bb, k, avg, obp, slg, ops, iso, woba, wrc_plus, babip, war, k_pct, bb_pct, ld_pct, gb_pct, fb_pct, hr_fb_pct, barrel_pct, hard_hit_pct, exit_velocity, sprint_speed.
          - `pitchers` — season pitching stats, 2010–present. Columns: player_id, fg_id, name, team, league, season, g, gs, w, l, sv, ip, tbf, h, er, hr, bb, k, era, fip, xfip, siera, war, whip, k_per_9, bb_per_9, k_pct, bb_pct, k_minus_bb_pct, babip, gb_pct, ld_pct, fb_pct.
          - `fg_projections_batting` — current-season Steamer batting projections. Columns: player_id, fg_id, name, team, season, projection_system, g, pa, hr, r, rbi, sb, bb, k, avg, obp, slg, ops, iso, woba, wrc_plus, babip, war, k_pct, bb_pct.
          - `fg_projections_pitching` — current-season Steamer pitching projections. Columns: player_id, fg_id, name, team, season, projection_system, g, gs, w, l, sv, ip, tbf, k, bb, hr, era, fip, xfip, siera, war, whip, k_per_9, bb_per_9, k_pct, bb_pct, k_minus_bb_pct, babip, gb_pct.
          - Join on `player_id` (preferred) or `fg_id`. Always alias tables when joining. Example cross-table query: `SELECT b.name, b.war AS actual_war, p.war AS proj_war FROM batters b JOIN fg_projections_batting p ON b.player_id = p.player_id AND b.season = p.season WHERE b.season = #{Date.today.year - 1} AND b.pa >= 300 ORDER BY actual_war - proj_war DESC`.
      PROMPT
    end
  end
end
