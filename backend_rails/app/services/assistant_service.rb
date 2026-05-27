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

          TABLE: ottoneu_salaries
            Current season only. Every rostered player across all teams in the Ottoneu league.
            Key columns: season, ottoneu_league_id, ottoneu_team_id, team_name,
              ottoneu_id, fg_id (TEXT — join to batters/pitchers on CAST(fg_id AS VARCHAR)),
              player_name, mlb_team, positions, salary (integer, dollars).
            Use cases: salary efficiency (wOBA per dollar), overpaid/underpaid players,
              cross-team salary comparisons, total league cap usage.
            Join example:
              SELECT s.player_name, s.salary, b.woba, ROUND(s.salary / b.woba, 1) AS dollars_per_woba
              FROM ottoneu_salaries s
              JOIN batters b ON CAST(b.fg_id AS VARCHAR) = s.fg_id AND b.season = s.season
              WHERE b.woba IS NOT NULL AND s.salary > 0
              ORDER BY dollars_per_woba ASC

          JOIN PATTERN (projection vs. actual):
            SELECT b.name, b.season, b.war AS actual_war, p.war AS proj_war
            FROM batters b
            JOIN fg_projections_batting p ON b.player_id = p.player_id AND b.season = p.season
            WHERE b.season = 2024 AND b.pa >= 300
            ORDER BY actual_war - proj_war DESC

          Always alias tables when joining. Use player_id for joins when possible (most reliable); fall back to fg_id (cast to VARCHAR) when joining with ottoneu_salaries.
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
        name: "get_ottoneu_roster",
        description: "Get the Dingers and Dugouts Ottoneu roster: all rostered players with salary, positions, MLB team, season FG points (where available), approximate FG pts from warehouse stats, and MLB IL status. Use for questions about your Ottoneu team, cap situation, overpaid/underpaid players, or who's on the injured list.",
        parameters: {
          type: "object",
          properties: {},
          required: []
        }
      }
    },
    {
      type: "function",
      function: {
        name: "get_ottoneu_standings",
        description: "Get the current Ottoneu league standings including record, total points, average points scored, and average points against for each team.",
        parameters: {
          type: "object",
          properties: {},
          required: []
        }
      }
    },
    {
      type: "function",
      function: {
        name: "get_ottoneu_transactions",
        description: "Get active Ottoneu auctions and waiver claims in progress. Returns player name, current bid or salary, MLB team, and deadline. Use for questions about who's being bid on, what waivers are available, or what's happening in the transaction wire.",
        parameters: {
          type: "object",
          properties: {},
          required: []
        }
      }
    },
    {
      type: "function",
      function: {
        name: "get_ottoneu_free_agents",
        description: "Get Ottoneu free agent candidates — players not rostered by any team in the league — with season stats, approximate FanGraphs points, projection comparison, fair value salary, and AI-generated pickup recommendations. Use for questions about who to pick up, best available free agents, or waiver wire targets.",
        parameters: {
          type: "object",
          properties: {},
          required: []
        }
      }
    },
    {
      type: "function",
      function: {
        name: "get_ottoneu_cap_overview",
        description: "Get every team's cap situation in the Ottoneu league: team name, base salary, penalties, and remaining cap space. Use for trade analysis (which teams are buyers/sellers), identifying cap-constrained teams, or comparing cap flexibility across the league.",
        parameters: {
          type: "object",
          properties: {},
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
        name: "get_ml_columns",
        description: "List the numeric columns available in a warehouse table that can be used as ML features or targets.",
        parameters: {
          type: "object",
          properties: {
            table: {
              type: "string",
              enum: %w[batters pitchers teams_batting teams_pitching fg_projections_batting fg_projections_pitching],
              description: "Which warehouse table to inspect."
            }
          },
          required: ["table"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "train_ml_model",
        description: "Train a machine learning model on warehouse stats and return evaluation metrics, feature importances, and (for neural networks) the training loss curve and total parameter count. Use this when the user asks to build a model, find predictors of a stat, or explore relationships between stats.",
        parameters: {
          type: "object",
          properties: {
            table:      { type: "string", enum: %w[batters pitchers teams_batting teams_pitching fg_projections_batting fg_projections_pitching] },
            features:   { type: "array", items: { type: "string" }, description: "Column names to use as input features." },
            target:     { type: "string", description: "Column name to predict." },
            task:       { type: "string", enum: %w[regression classification], description: "regression for continuous targets, classification for categorical or binned targets." },
            model_type: { type: "string", enum: %w[linear_regression logistic_regression random_forest gradient_boosting neural_network] },
            hyperparams: {
              type: "object",
              description: "Optional hyperparameters. For neural_network: layers (array of ints), activation, learning_rate, epochs, dropout. For random_forest/gradient_boosting: n_estimators, max_depth, learning_rate.",
              additionalProperties: true
            },
            one_hot_target: { type: "boolean", description: "If true, bin a continuous target column into quartile classes for classification." }
          },
          required: %w[table features target task model_type]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "get_news",
        description: "Get recent baseball news from MLB.com, FanGraphs, MLB Trade Rumors, r/baseball, and Rotowire (player injuries and transactions). Optionally filter by player name to find stories about a specific player.",
        parameters: {
          type: "object",
          properties: {
            topic: { type: "string", description: "Filter by source: 'mlb', 'fangraphs', 'mlbtr', 'reddit', 'rotowire', or 'all'. Use 'rotowire' for injury reports and player transaction news. Defaults to 'all'." },
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
        name: "save_obsidian_note",
        description: "Save a note or analysis to the user's Obsidian vault as a Markdown file. Use when the user explicitly asks to save, note down, or record something to their vault or notes. Only works if the Obsidian vault path is configured in Settings.",
        parameters: {
          type: "object",
          properties: {
            title:     { type: "string", description: "Note title used as the filename (no .md extension)." },
            content:   { type: "string", description: "Full Markdown content of the note body (everything after the frontmatter)." },
            subfolder: { type: "string", description: "Subfolder within the vault, e.g. 'Baseball/Players' or 'Baseball/Trades'. Defaults to 'Baseball'." },
            tags:      { type: "array", items: { type: "string" }, description: "Frontmatter tags. Always include 'baseball'. Add topic tags like 'simulation', 'trade', 'analysis', 'scouting', 'fantasy', 'log', etc. as relevant." },
            type:      { type: "string", enum: %w[reference how-to concept log scratch], description: "Note type. Use 'reference' for facts/stats/analysis, 'log' for session or event notes, 'concept' for explanations of ideas, 'how-to' for step-by-step, 'scratch' for quick informal saves." },
            status:    { type: "string", enum: %w[draft active stable], description: "Note status. Use 'draft' for a one-off snapshot, 'active' for a note you expect to update over time, 'stable' for complete settled reference material." },
            source:    { type: "string", description: "Optional URL or source title if the note is based on an external resource." }
          },
          required: %w[title content type status tags]
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

      when "get_ottoneu_roster"
        roster    = OttoneuService.my_roster
        il_status = OttoneuService.my_il_status
        prod      = OttoneuService.my_production
        cap       = OttoneuService.cap_overview
        my_cap    = Array(cap).find { |t| t[:team_name].to_s.include?("Dingers") }
        prod_ok   = prod.is_a?(Hash) && !prod[:error]
        players   = Array(roster[:players]).map do |p|
          production = prod_ok ? prod[p[:name]] : nil
          il         = il_status[p[:name]] || {}
          p.merge(
            season_points: production&.dig(:season_points),
            pts_per_game:  production&.dig(:pts_per_game),
            mlb_il:        il[:mlb_il] || false,
            mlb_il_desc:   il[:mlb_il_desc]
          ).compact
        end
        {
          team_name:  roster[:team_name],
          cap_space:  my_cap&.dig(:cap_space),
          base_salary: my_cap&.dig(:base_salary),
          players:    players
        }

      when "get_ottoneu_standings"
        OttoneuService.standings

      when "get_ottoneu_transactions"
        {
          auctions: OttoneuService.auctions,
          waivers:  OttoneuService.waivers
        }

      when "get_ottoneu_free_agents"
        OttoneuFreeAgentsService.call

      when "get_ottoneu_cap_overview"
        OttoneuService.cap_overview

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

      when "get_ml_columns"
        MlService.columns(table: args["table"].to_s)

      when "train_ml_model"
        config = {
          table:          args["table"].to_s,
          features:       Array(args["features"]).map(&:to_s),
          target:         args["target"].to_s,
          task:           args["task"].to_s,
          model_type:     args["model_type"].to_s,
          hyperparams:    args["hyperparams"] || {},
          one_hot_target: args["one_hot_target"] || false,
        }
        MlService.train(config)

      when "save_obsidian_note"
        ObsidianService.save_note(
          title:     args["title"].to_s,
          content:   args["content"].to_s,
          subfolder: args["subfolder"].presence,
          tags:      args["tags"],
          type:      args["type"].presence,
          status:    args["status"].presence,
          source:    args["source"].presence
        )

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
        - get_news — recent headlines from MLB.com, FanGraphs, MLBTR, r/baseball, and Rotowire (injury reports, IL moves, transactions); pass player_name to find stories about a specific player; pass topic='rotowire' to filter to injury/transaction news only

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

        **Fantasy (Ottoneu — always available):**
        - get_ottoneu_roster — full Dingers and Dugouts roster with salary, positions, MLB team, season FG pts, and MLB IL status. Use for cap questions, overpaid/underpaid analysis, IL stashes, and trade targets.
        - get_ottoneu_standings — league standings with record, total points, avg pts scored/against.
        - get_ottoneu_transactions — active auctions (current bid, deadline) and waiver claims in progress.
        - get_ottoneu_free_agents — players not rostered by any team in the league, with stats, projected FG pts, fair value salary, and AI pickup recommendations. Use for "who should I pick up", "best available", or "is X a free agent in Ottoneu".
        - get_ottoneu_cap_overview — cap situation for every team: base salary, penalties, and cap space remaining. Use for trade analysis ("which teams are buyers?"), identifying cap-constrained teams, or any cross-league cap comparison.
        - query_players_sql with the `ottoneu_salaries` table — join salary data against stats for cross-league value analysis (see SQL section).

        **Checking if a specific player is rostered in Ottoneu:**
        Use query_players_sql: `SELECT team_name, salary, positions FROM ottoneu_salaries WHERE player_name ILIKE '%<player name>%'`
        If the query returns rows, the player is rostered (shows which team owns them and at what salary). If no rows return, they are a free agent in your Ottoneu league and available to bid on.

        **Team data:**
        - get_team_profile — standing, recent results, full roster, and available leadership/finance data
        - get_team_financials — payroll, CBT payroll, CBT threshold, and CBT space remaining

        **Machine learning (ML Builder):**
        - get_ml_columns — list numeric columns available in a warehouse table (batters, pitchers, etc.)
        - train_ml_model — train a model (linear regression, logistic regression, random forest, gradient boosting, or neural network) on warehouse stats. Returns metrics (R², accuracy, F1, etc.), feature importances, confusion matrix, and for neural networks: parameter count, architecture, and per-epoch loss history.

        **League-wide analysis:**
        - query_players_sql — DuckDB SQL across four tables (seasons #{available_seasons.first}–#{available_seasons.last}). Use for rankings, comparisons, year-over-year trends, and projection vs. actuals. Join on `player_id`. Tables:
          - `batters` — season batting stats. Key columns: player_id, fg_id, name, team, league, position, season, pa, hr, avg, obp, slg, ops, iso, wrc_plus, woba, babip, war, k_pct, bb_pct, gb_pct, fb_pct, hr_fb_pct, barrel_pct, hard_hit_pct, exit_velocity, sprint_speed.
          - `pitchers` — season pitching stats. Key columns: player_id, fg_id, name, team, league, season, g, gs, ip, tbf, era, fip, xfip, siera, war, whip, k_per_9, bb_per_9, k_pct, bb_pct, k_minus_bb_pct, babip, gb_pct, fb_pct.
          - `fg_projections_batting` — current-season Steamer batting projections. Same key batting columns as `batters` (no Statcast fields).
          - `fg_projections_pitching` — current-season Steamer pitching projections. Same key pitching columns as `pitchers`.
          - Join example: `SELECT b.name, b.war AS actual, p.war AS projected FROM batters b JOIN fg_projections_batting p ON b.player_id = p.player_id AND b.season = p.season`
        - get_leaderboards — FanGraphs batting or pitching leaderboard for quick top-N queries

        **Notes (Obsidian):**
        - save_obsidian_note — Write a note to the user's Obsidian vault. Trigger when the user says "save this", "note that down", "add to my vault", "keep this", etc.

          **Required frontmatter fields — always set all four:**
          - `tags`: always include `"baseball"` plus topic tags relevant to the content (e.g. `"simulation"`, `"trade"`, `"fantasy"`, `"analysis"`, `"scouting"`, `"log"`)
          - `type`: pick one — `reference` (stats/facts/lookup), `log` (session or event note), `concept` (explanation of an idea), `how-to` (step-by-step), `scratch` (quick informal save)
          - `status`: `draft` for a one-off snapshot; `active` for a living note the user will return to; `stable` for complete reference material
          - `tags`, `type`, `status` are all required fields in the tool call — never omit them

          **Content formatting rules:**
          - Use a single `# Title` H1 at the top of the content (matches the note title)
          - Use `## Section` H2 headers to organise longer notes
          - Use `[[Note Name]]` wikilink syntax for cross-references to other notes (e.g. `[[baseball]]`, `[[Simulation]]`)
          - Bullet lists with `-` for enumerations; tables for structured comparisons or stat rows
          - Inline code with backticks for stat names, column names, file paths, or code symbols
          - Fenced ` ```sql ``` ` blocks for any SQL; ` ``` ` blocks for any other code
          - No inline `#tags` — tags belong in frontmatter only
          - Keep the content dense and informative, not a transcript of the chat — write it as a reference the user will read again later

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

        ## Fantasy page

        When `page_context.pageType` is `"fantasy"`, the user is on the fantasy baseball page with both Yahoo Fantasy and Ottoneu tabs. **All player and roster questions default to Ottoneu unless the user explicitly says "Yahoo."**

        ### Ottoneu vs Yahoo — how to tell apart
        - Mentions of "salary", "cap", "auction", "bid", "PPD", "surplus", "Ottoneu", "FanGraphs points", or "Dingers" → Ottoneu.
        - Mentions of "waiver priority", "FAAB", "weekly lineup", "Yahoo", or "matchup" → Yahoo.
        - Ambiguous questions ("can I use X?", "should I pick up X?", "is X available?") → **treat as Ottoneu**.

        ### FanGraphs Points — the lens for all Ottoneu analysis
        Everything in Ottoneu flows through FG pts. Traditional stats (WAR, wRC+, FIP, wOBA) are valuable — but only as explanations for why a player is scoring what they score. The Ottoneu verdict is always FG pts + PPD + surplus.

        FG Points formula:
        - **Batters:** (AB × −1.0) + (H × 5.6) + (2B × 2.9) + (3B × 5.7) + (HR × 9.4) + (BB × 3.0) + (HBP × 3.0) + (SB × 1.9) + (CS × −2.8)
        - **Pitchers:** (IP × 7.4) + (K × 2.0) + (H × −2.6) + (BB × −3.0) + (HBP × −3.0) + (HR × −12.3) + (SV × 5.0) + (HLD × 4.0)
        - **PPD** = FG pts ÷ salary. Fair value = 10. Good = 15+. Elite = 20+.
        - **Surplus** = FG pts − (salary × 10). Positive = underpriced. Negative = overpaid.
        - **Fair value salary** = FG pts ÷ 10.

        When you fetch stats from the warehouse, compute approximate FG pts yourself. Then use traditional stats to explain the score:
        - A low HR total explains a low FG pts ceiling (HR = +9.4 each, the highest single-event value).
        - A high BB% explains why a low-AVG hitter still scores well (BB = +3.0, only costs −1.0 AB).
        - A high WHIP / HR-allowed rate explains poor pitcher FG pts (HR allowed = −12.3, the worst event).
        - Low IP pace explains why a strong-ERA pitcher isn't accumulating pts (IP × 7.4 is the pitcher's floor).
        - wOBA, wRC+, FIP are great for projecting future FG pts — use them to argue whether current scoring is sustainable.

        The right structure: **FG pts + PPD + surplus = verdict. Traditional stats = the "why" behind the verdict.**
        Wrong: "0.31 WAR, so cut." Right: "65 FG pts (~9.3 PPD, −$5 surplus at $7) — just below fair value. His 96 wRC+ and lack of HR (2 in 187 PA) cap his FG ceiling since HR is worth +9.4 each. At 34 with no power uptick in projection, this is a modest overpay. Cut or trade for a younger, higher-upside slot."

        ### Required behavior for every player question on this page
        Every response about a specific player MUST include Ottoneu context. Always do ALL of the following:

        1. **Check Ottoneu roster status.** Run `query_players_sql`: `SELECT team_name, salary, positions FROM ottoneu_salaries WHERE player_name ILIKE '%<name>%'`.
        2. **Fetch season stats and compute FG pts.** Query `batters` or `pitchers`, compute approximate FG pts, then derive PPD and surplus.
        3. **Get cap situation.** Call `get_ottoneu_roster` before any add/drop/cut recommendation.
        4. **Lead with the Ottoneu verdict.** Open with the FG pts / PPD / surplus number, then use traditional stats to explain and support it.

        ### How to handle the three ownership states — CRITICAL

        **Player is on D&D's roster (team_name includes "Dingers"):**
        The user ALREADY KNOWS this. Do NOT state "he's on your team" — that is obvious and wastes space.
        Instead, skip straight to the decision they're asking about: keep/cut/trade analysis.
        Open with the value verdict immediately: "At $7, McNeil is generating X pts (~Y PPD). Fair value is $Z. That means..."
        Use the salary and stats as the basis for a cut/keep/trade recommendation without narrating what the user already knows.

        **Player is on another team's roster:**
        This IS useful — the user may not know who owns them or at what salary.
        State: "[Player] is owned by [Team] at $[salary]." Then discuss trade value, whether that team might be selling, and what a fair trade price would be.

        **Player is a free agent (no rows in ottoneu_salaries):**
        State they're available, estimate a realistic auction price given their stats, and give a PPD/surplus projection at that price.

        ### Example framing
        "Should I cut Jeff McNeil?" → McNeil is on D&D, so DO NOT say "he's on your team."
        Instead open with: "At $7, McNeil has produced X FG pts this year (~Y PPD). Fair value for $7 is 70 pts. He's [above/below] that threshold. [Cut/Keep] because..."
        Then support with: age, projection pace, roster flexibility, better alternatives on the wire.

        "Can Clay Holmes help me at SP?" → Check salaries first.
        If FA: "Holmes is a free agent. He's on the 60-day IL so unavailable now, but at a likely auction price of $X he'd project for Y FG pts (~Z PPD). With $W cap space you could stash him — here's whether that makes sense vs your current SP depth."

        ### For general Ottoneu questions (not about a specific player)
        - "How is my team doing?" / "What should I focus on this week?" → call `get_ottoneu_roster` + `get_ottoneu_insights`
        - "Who should I add?" / "Who's available?" → call `get_ottoneu_free_agents`
        - "What's happening on waivers?" → call `get_ottoneu_transactions`
        - "How does my cap look?" → call `get_ottoneu_cap_overview`

        ### When the question is about Yahoo
        Use `get_fantasy_roster` and `get_fantasy_free_agents` instead. Do not mix Ottoneu salary/cap data into Yahoo responses.

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

        ## ML Builder page

        When `page_context.pageType` is `"ml_run"`, the user has opened the assistant from the ML Model Builder after training a model. The run details are in `page_context.mlRun`:
        - `model_type` — e.g. "random_forest", "neural_network", "gradient_boosting"
        - `task` — "regression" or "classification"
        - `target` — the column being predicted (e.g. "hr", "era")
        - `table` — the warehouse table used (e.g. "batters", "pitchers")
        - `features` — array of input column names
        - `metrics` — evaluation metrics: r2, rmse, mae for regression; accuracy, f1, precision, recall for classification
        - `train_samples` / `test_samples` — number of training and test rows
        - `feature_importance` — array of { name, importance } for the top-5 features (if available)

        When responding to this context, write a thorough, educational interpretation — aim for 4–6 substantive paragraphs. Do not be terse. Repeat and explain every metric by name; never assume the user already knows what R², RMSE, F1, or precision/recall mean.

        **Always define every metric you mention, inline, in plain English:**
        - **R²** (coefficient of determination): the fraction of variance in the target the model explains. "R² of 0.71 means 71% of the differences in {target} values across players are captured by this model." Characterize: ≥ 0.85 excellent, 0.70–0.84 good, 0.50–0.69 moderate, < 0.50 weak.
        - **RMSE** (root mean squared error): the typical size of the model's prediction error, in the same units as the target. "RMSE of 3.9 means the model's predictions are off by roughly ±4 {target} units on average."
        - **MAE** (mean absolute error): the average absolute error, less sensitive to large outliers than RMSE. Compare to RMSE — if they are close, errors are evenly distributed; if RMSE is much larger, a few big mispredictions are pulling it up.
        - **Accuracy** (classification): the percentage of test samples the model correctly classified. Explain that high accuracy can be misleading if classes are imbalanced.
        - **F1 score**: the harmonic mean of precision and recall. Explain precision ("of all the times the model predicted class X, what fraction were actually X") and recall ("of all actual class X samples, what fraction did the model catch"). F1 below 0.50 suggests the model is struggling to distinguish between classes.
        - **Precision** and **Recall**: define each separately even if you have already described them as part of F1.

        **Structure each response as:**
        1. A brief summary sentence (model type, target, features, outcome in one line).
        2. A paragraph walking through every reported metric with inline definitions and judgment on what each number means for this specific prediction task.
        3. A paragraph discussing *why* the result makes statistical or baseball sense — relate the features to the target, note any mathematical relationships (e.g. SLG is a component of OPS; ISO = SLG − AVG), and flag if good performance is likely due to data leakage rather than real predictive power.
        4. A paragraph covering weaknesses or caveats — sample size, class imbalance, overfitting risk, features that may be collinear.
        5. A concrete next-experiment paragraph: suggest a specific change (different model type, add/remove a named feature, bin the target, adjust a hyperparameter) and explain what you would expect to learn from that change.

        Always use the actual numbers from `metrics` and actual feature/model names — never use placeholders.
      PROMPT
    end
  end
end
