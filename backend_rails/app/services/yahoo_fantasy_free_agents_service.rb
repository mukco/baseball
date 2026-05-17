class YahooFantasyFreeAgentsService
  CACHE_TTL = 30.minutes
  MAX_CANDIDATES = 6

  class << self
    def call(refresh: false)
      cache_key = 'yahoo_fantasy_free_agents'
      Rails.cache.delete(cache_key) if refresh

      Rails.cache.fetch(cache_key, expires_in: CACHE_TTL) do
        generate
      end
    rescue => e
      { error: e.message }
    end

    private

    def generate
      agents_result = YahooFantasyService.free_agents(limit: 12)
      return agents_result if agents_result[:error]

      roster_result = YahooFantasyService.roster
      return roster_result if roster_result[:error]

      settings = YahooFantasyService.scoring_settings
      return settings if settings[:error]

      candidates = Array(agents_result[:players]).first(MAX_CANDIDATES)
      client = OpenAi::Client.new
      result = client.json_completion(
        system_prompt: system_prompt,
        user_payload: {
          scoring_type: settings[:scoring_type],
          scoring_weights: scoring_weights(settings),
          roster_snapshot: roster_snapshot(roster_result[:roster]),
          free_agents: candidates
        },
        interaction_type: 'yahoo_fantasy_free_agents',
        metadata: { candidate_count: candidates.size, team_key: roster_result[:team_key] },
        temperature: 0.2
      )

      {
        players: candidates,
        factoids: normalize_factoids(result[:output]),
        generated_at: Time.current.iso8601
      }
    end

    def scoring_weights(settings)
      stat_categories = settings[:stat_categories] || {}
      modifiers = settings[:stat_modifiers] || {}

      modifiers.filter_map do |stat_id, value|
        category = stat_categories[stat_id]
        next unless category

        [category[:display_name] || category[:abbr] || category[:name], value]
      end.to_h
    end

    def roster_snapshot(roster)
      Array(roster).group_by { |player| player[:selected_position].to_s }.transform_values(&:size)
    end

    def normalize_factoids(output)
      Array(output['factoids'] || output[:factoids]).map(&:to_s).map(&:strip).reject(&:blank?).first(6)
    end

    def system_prompt
      <<~PROMPT
        You are a sharp fantasy baseball analyst. Return only valid JSON: { "factoids": ["string", ...] }.

        You will receive the roster shape for one Yahoo fantasy team, the league's points weights, and a set of true free agents from that league.
        Generate 4 to 6 concise pickup recommendations.

        Rules:
        - Every factoid must mention the recommended player by name.
        - Focus on why the player matters in this head-to-head points format.
        - Reference only numbers present in the payload.
        - Mention lineup spot or starting-today signal when useful.
        - Keep each factoid to one sentence.
        - Prefer actionable recommendations over generic praise.
      PROMPT
    end
  end
end
