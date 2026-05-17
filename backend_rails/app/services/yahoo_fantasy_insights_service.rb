class YahooFantasyInsightsService
  CACHE_TTL = 15.minutes
  MAX_PLAYERS = 6
  PITCHER_POSITIONS = %w[SP RP P].freeze
  BENCH_POSITIONS = %w[BN IL NA].freeze

  class << self
    def call(refresh: false)
      cache_key = 'yahoo_fantasy_insights'
      Rails.cache.delete(cache_key) if refresh

      Rails.cache.fetch(cache_key, expires_in: CACHE_TTL) do
        generate
      end
    rescue => e
      { error: e.message }
    end

    private

    def generate
      dashboard = YahooFantasyDashboardService.call
      return dashboard if dashboard[:error]

      featured_players = build_featured_players(Array(dashboard[:roster]))
      return { factoids: [], generated_at: Time.current.iso8601 } if featured_players.empty?

      client = OpenAi::Client.new
      result = client.json_completion(
        system_prompt: system_prompt,
        user_payload: {
          scoring_date: dashboard[:scoring_date],
          current_matchup: dashboard[:current_matchup],
          featured_players: featured_players
        },
        interaction_type: 'yahoo_fantasy_insights',
        metadata: { team_key: dashboard[:team_key], player_count: featured_players.size },
        temperature: 0.2
      )

      {
        factoids: normalize_factoids(result[:output]),
        generated_at: Time.current.iso8601
      }
    end

    def build_featured_players(roster)
      mlb = MlbApiService.new

      featured_candidates(roster).first(MAX_PLAYERS).map do |player|
        resolved_id = resolve_mlb_player_id(mlb, player)
        group = pitcher?(player) ? 'pitching' : 'hitting'
        recent = resolved_id ? mlb.player_game_log(resolved_id, Date.current.year, group: group, limit: 5) : nil

        {
          name: player[:name],
          team: player[:team],
          team_abbr: player[:team_abbr],
          fantasy_position: player[:selected_position],
          eligible_positions: player[:eligible_positions],
          daily_points: player[:daily_points],
          daily_stats: Array(player[:daily_stats]).first(5),
          game_today: player[:game_today],
          matchup: player[:matchup],
          recent_games: Array(recent&.dig(:games)).first(5).map do |game|
            game.slice(:date, :opponent, :ab, :h, :hr, :rbi, :bb, :so, :ops, :ip, :er, :whip, :era)
          end
        }
      end
    end

    def featured_candidates(roster)
      starters = roster.reject { |player| BENCH_POSITIONS.include?(player[:selected_position].to_s) }

      starters.sort_by do |player|
        [
          player[:game_today] ? 0 : 1,
          -(player[:daily_points] || 0).to_f,
          pitcher?(player) ? 1 : 0,
          player[:name].to_s
        ]
      end
    end

    def resolve_mlb_player_id(mlb, player)
      results = mlb.search_players(player[:name].to_s, limit: 10)
      return nil unless results.is_a?(Array)

      name = normalize(player[:name])
      team_abbr = normalize(player[:team_abbr])
      team_name = normalize(player[:team])

      exact_name_matches = results.select { |result| normalize(result[:name]) == name }
      team_match = exact_name_matches.find do |result|
        result_team = normalize(result[:team])
        result_team == team_name || result_team.include?(team_abbr)
      end

      team_match&.dig(:id) || exact_name_matches.first&.dig(:id)
    rescue => e
      Rails.logger.warn("YahooFantasyInsightsService resolve_mlb_player_id #{player[:name]}: #{e.message}")
      nil
    end

    def normalize(value)
      value.to_s.strip.downcase
    end

    def pitcher?(player)
      PITCHER_POSITIONS.include?(player[:selected_position].to_s)
    end

    def normalize_factoids(output)
      Array(output['factoids'] || output[:factoids]).map(&:to_s).map(&:strip).reject(&:blank?).first(6)
    end

    def system_prompt
      <<~PROMPT
        You are a sharp fantasy baseball analyst. Return only valid JSON: { "factoids": ["string", ...] }.

        You will receive a current Yahoo fantasy matchup plus a small set of roster players.
        Generate 4 to 6 concise roster insights for today.

        Rules:
        - Every factoid must mention the player by name.
        - Prioritize actionable fantasy context: hot start, empty box score, live matchup leverage, role-based risk, or recent trend.
        - Use only numbers present in the payload.
        - Keep each factoid to one sentence.
        - Write for a serious fantasy player, not a casual recap reader.
        - Do not mention missing data unless it materially affects the advice.
      PROMPT
    end
  end
end
