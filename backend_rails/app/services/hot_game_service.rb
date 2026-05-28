class HotGameService
  CACHE_TTL = 30 * 60   # 30 min — stale quickly while games are finishing
  TOP_N     = 3

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

      return { hotGames: [] } if final_games.empty?

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

      return { hotGames: [] } if scored.empty?

      top = scored.sort_by { |g| -g[:metrics][:score] }.first(TOP_N)

      # Generate summaries in parallel
      summary_threads = top.map do |entry|
        Thread.new { entry.merge(summary: generate_summary(entry[:game], entry[:metrics])) }
      end
      hot_games = summary_threads.map(&:value)

      {
        hotGames: hot_games.map do |g|
          { game: g[:game], metrics: g[:metrics], summary: g[:summary] }
        end
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
        winnerEverTrailed:  min_winner_prob < 0.50,
        homeWins:           home_wins
      }
    end

    def generate_summary(game, metrics)
      away      = game[:away]
      home      = game[:home]
      winner    = metrics[:homeWins] ? home : away
      loser     = metrics[:homeWins] ? away : home

      narrative_type = derive_narrative_type(metrics)

      context = {
        winner:                winner[:name],
        winner_abbreviation:   winner[:abbreviation],
        loser:                 loser[:name],
        loser_abbreviation:    loser[:abbreviation],
        winner_score:          metrics[:homeWins] ? home[:score] : away[:score],
        loser_score:           metrics[:homeWins] ? away[:score] : home[:score],
        home_team:             home[:name],
        away_team:             away[:name],
        venue:                 game[:venue],
        narrative_type:        narrative_type,
        max_swing_pct:         metrics[:maxSwingPct],
        pivot_inning:          metrics[:pivotInning],
        pivot_half:            metrics[:pivotHalf],
        min_winner_prob_pct:   metrics[:minWinnerProbPct],
        lead_changes:          metrics[:leadChanges],
        was_comeback:          metrics[:wasComeback],
        winner_ever_trailed:   metrics[:winnerEverTrailed]
      }

      result = OpenAi::Client.new.json_completion(
        interaction_type: "hot_game_summary",
        temperature: 0.7,
        system_prompt: <<~PROMPT,
          You are a baseball analyst writing a punchy caption for a "Hot Game" feature in a sports app.

          RULES — follow these exactly, they are not suggestions:
          1. Use ONLY the facts provided in the data. Do not invent game events.
          2. If winner_ever_trailed is false, the winner NEVER trailed. Do not say or imply they trailed, came from behind, or were in danger.
          3. If winner_ever_trailed is true, the winner did trail at some point and you may mention it.
          4. If lead_changes is 0, no lead changed hands. Do not mention lead changes.
          5. If was_comeback is true (winner was below 15% probability), it was a genuine comeback. Mention it.
          6. narrative_type tells you what kind of game this was — use it to set the tone.
          7. If narrative_type is "wire_to_wire", describe a dominant, never-in-doubt win.
          8. If pivot_inning is present, it marks the moment of greatest probability swing — you may reference that inning.
          9. The final score is winner_score-loser_score. Reference it accurately.

          narrative_type values and their meaning:
          - "wire_to_wire": winner led wire-to-wire, opponent never threatened
          - "comeback": winner rallied from a serious deficit (was below 15% odds)
          - "late_drama": no lead change but a big swing late in the game
          - "back_and_forth": multiple lead changes, genuinely contested throughout

          Return JSON with exactly two keys:
            "headline" — 5-8 words, present-tense, punchy (no punctuation at end)
            "summary"  — 1-2 sentences of specific drama, past tense, grounded in the facts provided
        PROMPT
        user_payload: context
      )

      result[:output]
    rescue => _e
      {
        headline: "#{winner[:abbreviation] || winner[:name]} claim a #{narrative_type&.tr('_', ' ')} win",
        summary:  "A memorable finish at #{game[:venue]}."
      }
    end

    def derive_narrative_type(metrics)
      return "comeback"      if metrics[:wasComeback]
      return "back_and_forth" if metrics[:leadChanges] >= 2
      return "wire_to_wire"  if !metrics[:winnerEverTrailed] && metrics[:leadChanges] == 0
      "late_drama"
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
