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

      Rails.cache.fetch(cache_key, expires_in: expires_in) do
        generate(parsed_date)
      end
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
      result  = client.json_completion(
        system_prompt:    system_prompt(date),
        user_payload:     context,
        interaction_type: "daily_summary",
        metadata:         { date: date.to_s },
        temperature:      0.75
      )

      enrich(result[:output]).merge(generated_at: Time.current.iso8601)
    end

    def enrich(output)
      resolve = ->(item) {
        players = NewsService.resolve_players(item["player_names"])
        item.merge("players" => players)
      }

      output.merge(
        "stories" => Array(output["stories"]).map(&resolve),
        "trends"  => Array(output["trends"]).map(&resolve)
      )
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
        You are a sharp, opinionated baseball analyst writing a daily digest for serious fans.
        Today is #{date.strftime("%B %d, %Y")}.

        You will receive a JSON payload with:
        - "games": today's game results with scores and probable pitchers
        - "standings": all 6 divisions with W-L records, last-10, streaks, and GB
        - "batting_leaders": FanGraphs season batting leaderboard (top #{TOP_N} by WAR)
        - "pitching_leaders": FanGraphs season pitching leaderboard (top #{TOP_N} by ERA)
        - "news_headlines": recent headlines from MLB.com, FanGraphs, MLB Trade Rumors, and r/baseball

        Your job is to produce two sections:

        1. "stories" — 3 to 5 of today's most compelling narratives. These may come from game
           results, news, transactions, or milestones. A story is compelling if it has stakes,
           context, or consequence. Do not flatly summarize box scores.

        2. "trends" — 4 to 6 statistical observations that would surprise a knowledgeable fan.
           Do NOT default to "X player is hot" or "Y team is winning." Dig for contradictions,
           anomalies, and hidden stories:
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
        teams on a single stat (e.g. top HR leaders, ERA comparison, wRC+ leaderboard), include
        an optional "chart" field using only data points already present in the provided context.
        Never invent numbers. Limit chart data to 6–8 items. Use "horizontal_bar" for ranked
        player lists, "bar" for team comparisons, "scatter" for two-stat correlations, "line"
        for a trend over time. Omit "chart" entirely if no real data supports it.

        Return ONLY valid JSON matching this exact schema — no extra keys, no markdown:
        {
          "stories": [
            { "headline": string, "body": string, "category": "game|transaction|milestone|storyline", "player_names": [string] }
          ],
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
  end
end
