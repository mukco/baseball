class HotGameService
  CACHE_TTL = 30 * 60   # 30 min — stale quickly while games are finishing

  @@cache            = {}
  @@cache_timestamps = {}

  class << self
    def for_date(date)
      key = "hot_game_#{date}"
      return @@cache[key] if cache_fresh?(key)

      result = compute(date)
      cache_set(key, result) unless result[:error]
      result
    rescue => e
      { error: e.message }
    end

    private

    def compute(date)
      mlb           = MlbApiService.new
      schedule      = mlb.schedule(date)
      final_games   = (schedule[:games] || []).select { |g| g[:abstractState] == "Final" }

      return { hotGame: nil } if final_games.empty?

      # Fetch win probability for all final games in parallel
      threads = final_games.map do |game|
        Thread.new { { game: game, wp: mlb.win_probability(game[:gamePk]) } }
      end
      raw = threads.map(&:value)

      scored = raw.filter_map do |entry|
        wp = entry[:wp]
        next unless wp.is_a?(Array) && wp.length >= 5
        metrics = excitement_metrics(wp)
        entry.merge(metrics: metrics)
      end

      return { hotGame: nil } if scored.empty?

      hot     = scored.max_by { |g| g[:metrics][:score] }
      summary = generate_summary(hot[:game], hot[:metrics])

      {
        hotGame: {
          game:    hot[:game],
          metrics: hot[:metrics],
          summary: summary
        }
      }
    end

    def excitement_metrics(wp_data)
      probs = wp_data.map { |d| d[:homeWinProbability] }.compact
      return { score: 0 } if probs.length < 2

      swings         = probs.each_cons(2).map { |a, b| (b - a).abs }
      max_swing      = swings.max || 0
      max_swing_idx  = swings.index(max_swing)
      pivot_play     = max_swing_idx ? wp_data[max_swing_idx + 1] : nil

      final_prob = probs.last
      home_wins  = final_prob >= 0.5

      winner_probs     = home_wins ? probs : probs.map { |p| 1 - p }
      min_winner_prob  = winner_probs.min

      lead_changes = probs.each_cons(2).count { |a, b|
        (a < 0.5 && b >= 0.5) || (a >= 0.5 && b < 0.5)
      }

      # Weighted excitement score
      score = (max_swing * 100) +
              ((1.0 - min_winner_prob) * 40) +
              (lead_changes * 3)

      {
        score:              score.round(1),
        maxSwingPct:        (max_swing * 100).round(1),
        pivotInning:        pivot_play&.dig(:inning),
        pivotHalf:          pivot_play&.dig(:halfInning),
        minWinnerProbPct:   (min_winner_prob * 100).round(1),
        leadChanges:        lead_changes,
        wasComeback:        min_winner_prob < 0.15,
        homeWins:           home_wins
      }
    end

    def generate_summary(game, metrics)
      away      = game[:away]
      home      = game[:home]
      winner    = metrics[:homeWins] ? home : away
      loser     = metrics[:homeWins] ? away : home

      context = {
        winner:           winner[:name],
        loser:            loser[:name],
        final_score:      "#{home[:score]}-#{away[:score]}",
        venue:            game[:venue],
        max_swing_pct:    metrics[:maxSwingPct],
        pivot_inning:     metrics[:pivotInning],
        pivot_half:       metrics[:pivotHalf],
        min_winner_prob:  metrics[:minWinnerProbPct],
        lead_changes:     metrics[:leadChanges],
        was_comeback:     metrics[:wasComeback]
      }

      result = OpenAi::Client.new.json_completion(
        interaction_type: "hot_game_summary",
        temperature: 0.7,
        system_prompt: <<~PROMPT,
          You are a baseball analyst writing a punchy caption for a "Hot Game" feature in a sports app.
          Use the win probability data to describe what made this game dramatic.
          Be specific: name comebacks, lead changes, clutch innings. Avoid clichés.
          Return JSON with exactly two keys:
            "headline" — 5-8 words, present-tense, punchy (no punctuation at end)
            "summary"  — 1-2 sentences of specific drama, past tense
        PROMPT
        user_payload: context
      )

      result[:output]
    rescue => _e
      {
        headline: "#{winner[:abbreviation] || winner[:name]} survive a thriller",
        summary:  "A wild finish at #{game[:venue]}."
      }
    end

    def cache_fresh?(key)
      @@cache.key?(key) && @@cache_timestamps[key].to_i > Time.now.to_i - CACHE_TTL
    end

    def cache_set(key, value)
      @@cache[key] = value
      @@cache_timestamps[key] = Time.now.to_i
    end
  end
end
