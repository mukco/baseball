class GameInsightsService
  CACHE_TTL = 10.minutes

  class << self
    def call(game_pk:, refresh: false)
      cache_key = "game_insights:#{game_pk}"

      unless refresh
        cached = Rails.cache.read(cache_key)
        return cached.merge(cached: true) if cached.present?
      end

      generated = generate(game_pk)
      Rails.cache.write(cache_key, generated, expires_in: CACHE_TTL)
      generated
    end

    private

    def generate(game_pk)
      game = MlbApiService.new.game_details(game_pk)
      client = OpenAi::Client.new

      ai_result = client.json_completion(
        system_prompt: system_prompt,
        user_payload: build_payload(game),
        interaction_type: "game_insights",
        metadata: { game_pk: game_pk }
      )

      {
        gamePk: game_pk,
        generatedAt: Time.current.utc.iso8601,
        model: ai_result[:model],
        cached: false,
        insights: normalize_insights(ai_result[:output])
      }
    end

    def build_payload(game)
      {
        game: {
          gamePk: game[:gamePk],
          gameDate: game[:gameDate],
          status: game[:status],
          venue: game[:venue],
          teams: {
            away: game.dig(:teams, :away),
            home: game.dig(:teams, :home)
          }
        },
        advanced: {
          teamBatting: game.dig(:advanced, :teamBatting),
          teamPitching: game.dig(:advanced, :teamPitching),
          edges: game.dig(:advanced, :edges)
        },
        boxscore: {
          teamTotals: game.dig(:boxscore, :teamTotals),
          batting: game.dig(:boxscore, :batting),
          pitching: game.dig(:boxscore, :pitching)
        }
      }
    end

    def system_prompt
      <<~PROMPT
        You are a baseball analytics assistant.
        Analyze the provided game context and return JSON only.

        Required JSON object shape:
        {
          "key_takeaways": ["..."],
          "matchup_edges": ["..."],
          "risk_flags": ["..."],
          "watch_list": ["..."]
        }

        Rules:
        - Keep each bullet concise (max 1 sentence).
        - Use only evidence from the provided payload.
        - If data is missing, mention uncertainty briefly.
        - Return between 2 and 5 bullets per section.
      PROMPT
    end

    def normalize_insights(raw)
      {
        key_takeaways: normalize_array(raw, "key_takeaways"),
        matchup_edges: normalize_array(raw, "matchup_edges"),
        risk_flags: normalize_array(raw, "risk_flags"),
        watch_list: normalize_array(raw, "watch_list")
      }
    end

    def normalize_array(raw, key)
      values = raw[key] || raw[key.to_sym]
      array = Array(values).map { |v| v.to_s.strip }.reject(&:blank?).first(5)
      array.presence || ["Not enough reliable signal from available game data."]
    end
  end
end
