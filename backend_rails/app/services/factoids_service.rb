class FactoidsService
  CACHE_TTLS = {
    player:       6.hours,
    team:         6.hours,
    game_final:   24.hours,
    game_live:    5.minutes,
    game_preview: 1.hour
  }.freeze

  SUMMARIES_DIR = Rails.root.join("storage", "game_summaries").freeze

  class << self
    def player(player_id:, season:)
      Rails.cache.fetch("factoids_player_#{player_id}_#{season}", expires_in: CACHE_TTLS[:player]) do
        generate(:player, player_context(player_id, season))
      end
    end

    def team(team_id:)
      Rails.cache.fetch("factoids_team_#{team_id}_#{Date.today}", expires_in: CACHE_TTLS[:team]) do
        generate(:team, team_context(team_id))
      end
    end

    def game(game_pk:)
      # Final summaries are written once and never regenerated
      persisted = load_persisted(game_pk)
      return persisted if persisted

      context = game_context(game_pk)
      ttl     = game_ttl(context[:status].to_s)

      result = Rails.cache.fetch("factoids_game_#{game_pk}", expires_in: ttl) do
        generate(:game, context)
      end

      persist_final(game_pk, result) if context[:status].to_s.include?("Final")
      result
    end

    private

    def load_persisted(game_pk)
      path = SUMMARIES_DIR.join("#{game_pk}.json")
      return nil unless path.exist?
      JSON.parse(path.read, symbolize_names: true)
    rescue => e
      Rails.logger.warn("FactoidsService load_persisted #{game_pk}: #{e.message}")
      nil
    end

    def persist_final(game_pk, result)
      FileUtils.mkdir_p(SUMMARIES_DIR)
      SUMMARIES_DIR.join("#{game_pk}.json").write(result.to_json)
    rescue => e
      Rails.logger.warn("FactoidsService persist_final #{game_pk}: #{e.message}")
    end

    def generate(type, context)
      client = OpenAi::Client.new
      result = client.json_completion(
        system_prompt:    system_prompt(type),
        user_payload:     context,
        interaction_type: "#{type}_factoids",
        metadata:         { type: type },
        temperature:      0.7
      )

      {
        factoids:     normalize(result[:output]),
        generated_at: Time.current.iso8601
      }
    end

    def normalize(raw)
      arr = raw["factoids"] || raw[:factoids] || []
      Array(arr).map { |v| v.to_s.strip }.reject(&:blank?).first(5)
    end

    def game_ttl(status)
      return CACHE_TTLS[:game_live]    if status.include?("Progress")
      return CACHE_TTLS[:game_final]   if status.include?("Final")
      CACHE_TTLS[:game_preview]
    end

    # ------------------------------------------------------------------ #
    # Context builders
    # ------------------------------------------------------------------ #

    def player_context(player_id, season)
      mlb   = MlbApiService.new
      info  = mlb.player_info(player_id) || {}
      stats = mlb.player_season_stats(player_id, season)
      log   = mlb.player_game_log(player_id, season)

      {
        name:         info[:name],
        position:     info[:positionName] || info[:position],
        team:         info[:team],
        bats:         info[:batSide],
        throws:       info[:pitchHand],
        season:       season,
        season_stats: {
          hitting:  stats[:hitting],
          pitching: stats[:pitching]
        },
        last_10_games: Array(log[:games]).first(10).map do |g|
          g.slice(:date, :opponent, :isWin, :ab, :h, :hr, :rbi, :bb, :so, :ops,
                  :ip, :er, :era, :whip)
        end
      }
    rescue StandardError => e
      Rails.logger.warn("FactoidsService player_context error: #{e.message}")
      {}
    end

    def team_context(team_id)
      mlb  = MlbApiService.new
      info = mlb.team_info(team_id) || {}

      {
        name:         info[:name],
        abbreviation: info[:abbreviation],
        league:       info[:league],
        division:     info[:division],
        standing:     info[:standing],
        recent_games: Array(info[:recentGames]).first(10).map do |g|
          g.slice(:gameDate, :isHome, :opponent, :teamScore, :oppScore, :status)
        end
      }
    rescue StandardError => e
      Rails.logger.warn("FactoidsService team_context error: #{e.message}")
      {}
    end

    def game_context(game_pk)
      mlb           = MlbApiService.new
      game          = mlb.game_details(game_pk)
      abstract_state = game[:abstractState].to_s
      live_status    = game[:status].to_s

      probable = game.dig(:gameContext, :probablePitchers) || {}

      ctx = {
        status:       abstract_state.presence || live_status,
        venue:        game[:venue],
        away:         game.dig(:teams, :away),
        home:         game.dig(:teams, :home),
        away_pitcher: probable[:away],
        home_pitcher: probable[:home]
      }

      if abstract_state.include?("Final") || live_status.include?("Progress")
        ctx[:boxscore] = {
          team_totals: game.dig(:boxscore, :teamTotals),
          batting:     game.dig(:boxscore, :batting)&.first(6),
          pitching:    game.dig(:boxscore, :pitching)&.first(4)
        }
      end

      ctx
    rescue StandardError => e
      Rails.logger.warn("FactoidsService game_context error: #{e.message}")
      {}
    end

    # ------------------------------------------------------------------ #
    # Prompts
    # ------------------------------------------------------------------ #

    def system_prompt(type)
      base = "You are a sharp baseball analytics assistant. Return only valid JSON: { \"factoids\": [\"string\", ...] }"

      case type
      when :player
        <<~PROMPT
          #{base}

          You will receive data about a single MLB player. Generate 3-4 brief factoids about them.
          - Each factoid is one sentence.
          - Reference specific numbers from the data.
          - Prioritize surprises: anomalies, contradictions, pace vs projection, Statcast vs slash line divergence.
          - Skip obvious observations like their position or team name.
        PROMPT
      when :team
        <<~PROMPT
          #{base}

          You will receive data about an MLB team. Generate 3-4 brief factoids about their current season.
          - Each factoid is one sentence.
          - Focus on team-level trends: run differential, L10 form, division context, streaks, bullpen or rotation patterns.
          - Avoid per-player factoids — those belong on the player page.
          - Reference specific numbers from the data.
        PROMPT
      when :game
        <<~PROMPT
          #{base}

          You will receive data about an MLB game. Generate exactly 3 brief factoids about this matchup.
          - Each factoid is one sentence.
          - For final games: highlight key performances, a turning point, or a notable stat line.
          - For upcoming games: focus on the pitching matchup, team momentum, or a relevant head-to-head angle.
          - Be specific — cite actual numbers where available.
        PROMPT
      end
    end
  end
end
