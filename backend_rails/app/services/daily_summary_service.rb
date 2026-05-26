class DailySummaryService
  BATTING_FIELDS  = %w[Name Team PA AVG OBP SLG OPS wRC+ BB% K% HR BABIP WAR].freeze
  PITCHING_FIELDS = %w[Name Team IP ERA FIP xFIP K/9 BB/9 WHIP K% BB% HR/9 WAR].freeze
  TOP_N           = 30

  class << self
    def call(date: nil, refresh: false)
      parsed_date = parse_date(date)
      cache_key   = "daily_summary_#{parsed_date}"
      expires_in  = Time.current.end_of_day - Time.current

      Rails.cache.delete(cache_key) if refresh

      normalize_output(
        Rails.cache.fetch(cache_key, expires_in: expires_in) do
          generate(parsed_date)
        end
      )
    end

    private

    def parse_date(raw)
      raw.present? ? Date.parse(raw.to_s) : Date.today
    rescue ArgumentError
      Date.today
    end

    def generate(date)
      context = assemble_context(date)
      client  = OpenAi::Client.new

      # Step 1: Generate trends — pure analysis, no SQL distraction
      result = client.json_completion(
        system_prompt:    system_prompt(date),
        user_payload:     context,
        interaction_type: "daily_summary",
        metadata:         { date: date.to_s },
        temperature:      0.75,
        timeout:          90
      )

      trends = Array(result[:output]["trends"])

      # Step 2: Generate a targeted explore query for each trend
      trends_with_sql = attach_explore_queries(trends, date.year, client)

      enrich({ "trends" => trends_with_sql }).merge(generated_at: Time.current.iso8601)
    end

    def attach_explore_queries(trends, season, client)
      return trends if trends.empty?

      payload = trends.each_with_index.map do |t, i|
        { index: i, headline: t["headline"], body: t["body"], stat_hook: t["stat_hook"] }
      end

      result = client.json_completion(
        system_prompt:    sql_prompt(season),
        user_payload:     { trends: payload },
        interaction_type: "daily_summary_sql",
        metadata:         { season: season },
        temperature:      0,
        timeout:          60
      )

      query_map = Array(result[:output]["queries"])
        .each_with_object({}) { |q, h| h[q["index"].to_i] = q["sql"].to_s.strip }

      trends.each_with_index.map do |trend, i|
        sql = query_map[i]
        sql.present? ? trend.merge("explore_sql" => sql) : trend
      end
    rescue StandardError => e
      Rails.logger.warn "[DailySummaryService] SQL generation failed: #{e.message}"
      trends
    end

    def enrich(output)
      resolve = ->(item) {
        players = NewsService.resolve_players(item["player_names"])
        item.merge("players" => players)
      }

      normalize_output(
        output.merge(
          "trends" => Array(output["trends"]).map(&resolve)
        )
      )
    end

    def normalize_output(output)
      return output unless output.is_a?(Hash)

      output.merge(
        "trends" => Array(output["trends"]).map { |trend| normalize_trend_chart(trend) }
      )
    end

    def normalize_trend_chart(trend)
      return trend unless trend.is_a?(Hash)

      chart = trend["chart"]
      return trend unless chart.is_a?(Hash)

      data  = Array(chart["data"]).select { |row| row.is_a?(Hash) }
      type  = chart["type"].to_s
      x_key = chart["xKey"].to_s
      y_key = chart["yKey"].to_s

      return trend.except("chart") if data.empty? || x_key.blank? || y_key.blank?

      x_numeric = numeric_series?(data, x_key)
      y_numeric = numeric_series?(data, y_key)

      normalized_chart = case type
      when "bar", "horizontal_bar", "line"
        if y_numeric
          chart.merge("data" => data)
        elsif x_numeric
          chart.merge("xKey" => y_key, "yKey" => x_key, "data" => data)
        end
      when "scatter"
        chart.merge("data" => data) if x_numeric && y_numeric
      end

      normalized_chart ? trend.merge("chart" => normalized_chart) : trend.except("chart")
    end

    def numeric_series?(data, key)
      return false if key.blank?

      data.all? { |row| numeric_value?(row[key]) }
    end

    def numeric_value?(value)
      Float(value)
      true
    rescue ArgumentError, TypeError
      false
    end

    def assemble_context(date)
      mlb    = MlbApiService.new
      season = date.year

      {
        date:             date.to_s,
        games:            games_context(mlb, date),
        standings:        standings_context(mlb, season),
        batting_leaders:  batting_leaders_context(season),
        pitching_leaders: pitching_leaders_context(season),
        news_headlines:   news_context
      }
    end

    def games_context(mlb, date)
      schedule = mlb.schedule(date.to_s)
      (schedule[:games] || []).map do |g|
        {
          status:      g[:status],
          away:        "#{g.dig(:away, :name)} (#{g.dig(:away, :score)})",
          home:        "#{g.dig(:home, :name)} (#{g.dig(:home, :score)})",
          awayPitcher: g.dig(:awayProbable, :name),
          homePitcher: g.dig(:homeProbable, :name)
        }
      end
    end

    def standings_context(mlb, season)
      mlb.standings(season).map do |div|
        {
          division: div[:divisionName],
          teams: div[:teams].map do |t|
            {
              name:    t[:teamName],
              record:  "#{t[:wins]}-#{t[:losses]}",
              gb:      t[:gamesBack],
              lastTen: t[:lastTen],
              streak:  t[:streak]
            }
          end
        }
      end
    end

    def batting_leaders_context(season)
      StatcastService.batting_leaderboard(season)
                     .first(TOP_N)
                     .map { |r| r.slice(*BATTING_FIELDS) }
    end

    def pitching_leaders_context(season)
      StatcastService.pitching_leaderboard(season)
                     .first(TOP_N)
                     .map { |r| r.slice(*PITCHING_FIELDS) }
    end

    def news_context
      NewsService.fetch(topic: "all", limit: 20)[:items].map do |item|
        {
          source:  item[:source],
          title:   item[:title],
          summary: item[:summary]&.first(200)
        }
      end
    end

    def system_prompt(date)
      <<~PROMPT.strip
        You are a sharp, opinionated baseball analyst writing a daily statistical digest for serious fans.
        Today is #{date.strftime("%B %d, %Y")}.

        You will receive a JSON payload with:
        - "games": today's game results with scores and probable pitchers
        - "standings": all 6 divisions with W-L records, last-10, streaks, and GB
        - "batting_leaders": FanGraphs season batting leaderboard (top #{TOP_N} by WAR)
        - "pitching_leaders": FanGraphs season pitching leaderboard (top #{TOP_N} by ERA)
        - "news_headlines": recent headlines from MLB.com, FanGraphs, MLB Trade Rumors, and r/baseball

        Your job is to produce 6 to 10 statistical "trends" — observations that would surprise a
        knowledgeable fan. Do NOT default to "X player is hot" or "Y team is winning." Dig for
        contradictions, anomalies, and hidden stories:
        - A hitter leading the league in barrel% but batting .220 (contact problem, not power)
        - A closer with elite K/9 but a swollen BB/9 that signals trouble ahead
        - A team with a top-5 run differential but a .500 record
        - A pitcher whose FIP is 1.5+ runs below their ERA (better than they look)
        - A player quietly chasing a meaningful milestone
        - A statistical contradiction that tells a hidden story

        Every trend MUST include a "stat_hook" — the specific number, comparison, or anomaly
        that makes it interesting. Vague observations are not acceptable.

        Tone: confident, analytical, slightly irreverent. Write for fans who know what wRC+ means.
        Be concise — each body 2–3 sentences max.

        Some trends lend themselves to a small chart. When a trend compares multiple players or
        teams on a single stat, include an optional "chart" field using only data points already
        present in the provided context. Never invent numbers. Limit chart data to 6–8 items.
        Use "horizontal_bar" for ranked player lists, "bar" for team comparisons, "scatter" for
        two-stat correlations, "line" for a trend over time. Omit "chart" entirely if no real data
        supports it. For "bar" and "horizontal_bar", xKey must be the label field and yKey the
        numeric field. Example: xKey="Name", yKey="HR".

        Return ONLY valid JSON matching this exact schema — no extra keys, no markdown:
        {
          "trends": [
            {
              "headline": string,
              "body": string,
              "stat_hook": string,
              "player_names": [string],
              "chart": {
                "type": "bar|horizontal_bar|line|scatter",
                "title": string,
                "xKey": string,
                "yKey": string,
                "data": [object]
              }
            }
          ]
        }
      PROMPT
    end

    def sql_prompt(season)
      <<~PROMPT.strip
        You are a DuckDB SQL expert. You will receive a list of baseball statistical trends —
        each has a headline, a body, and a stat_hook describing a specific anomaly or finding.

        Write one SQL query per trend that lets the user explore the exact data behind that finding.
        The query must:
        - SELECT only the columns relevant to the trend's stat_hook (never SELECT *)
        - Surface the specific players or teams that illustrate the phenomenon
        - Apply WHERE conditions that target the phenomenon (e.g. minimum PA/IP, stat thresholds)
        - ORDER BY the column that puts the most interesting rows first
        - Filter to season = #{season}
        - LIMIT 25
        - Use ONLY the exact column names listed below — no invented or aliased source names

        Available tables and columns (DuckDB, snake_case):

        batters(name, team, season, pa, hr, r, rbi, sb, avg, obp, slg, ops, iso, wrc_plus, war,
                woba, babip, k_pct, bb_pct, gb_pct, fb_pct, hr_fb_pct, o_swing_pct, z_swing_pct,
                bat_speed, swing_length, hard_swing_rate, blast_per_swing)

        pitchers(name, team, season, gs, ip, sv, era, fip, xfip, siera, war, whip,
                 k_per_9, bb_per_9, k_pct, bb_pct, k_minus_bb_pct, babip, gb_pct, fb_pct)

        teams_batting(name, abbr, season, avg, obp, slg, ops, hr, r, rbi, sb, k_pct, bb_pct, woba)

        teams_pitching(name, abbr, season, era, whip, fip, k_per_9, bb_per_9, k_minus_bb_pct)

        Return ONLY valid JSON — no extra keys, no markdown:
        {
          "queries": [
            { "index": 0, "sql": "SELECT ..." },
            { "index": 1, "sql": "SELECT ..." }
          ]
        }
      PROMPT
    end
  end
end
