class SimulationPlayoffInsightService
  class << self
    def call(league:, refresh: false)
      record = SimulationInsight.find_by(
        simulation_league_id: league.id,
        subject_type:         "playoffs",
        subject_id:           nil
      )
      return record.as_insight_json if record && !refresh

      result = generate(league)
      return result if result[:error]

      (record || SimulationInsight.new(simulation_league_id: league.id, subject_type: "playoffs", subject_id: nil))
        .tap { |r| r.update!(narrative: result[:narrative], bullets: result[:bullets], generated_at: Time.current) }

      result.merge(cached: false)
    rescue => e
      { error: e.message }
    end

    private

    def generate(league)
      series_all = league.simulation_playoff_series.order(:round, :series_index).to_a
      return { error: "No playoff series found" } if series_all.empty?

      ctx = playoff_context(series_all)
      min_ab = ctx[:complete_rounds].any? ? 8 : 4

      stats      = league.simulation_playoff_player_stats.to_a
      aggregated = aggregate_stats(stats)
      batters    = aggregated.select { |s| s[:player_type] == "batter" && s[:ab] >= min_ab }
      pitchers   = aggregated.select { |s| s[:player_type] == "pitcher" && s[:outs_pitched] >= 3 }

      round_label = SimulationPlayoffSeries::ROUND_LABELS[ctx[:current_round]] || ctx[:current_round].to_s

      payload = {
        context:            playoff_context_description(ctx),
        league_name:        league.name,
        season:             league.season,
        current_round:      round_label,
        rounds_complete:    ctx[:complete_rounds].map { |r| SimulationPlayoffSeries::ROUND_LABELS[r] || r },
        rounds_in_progress: ctx[:active_rounds].map  { |r| SimulationPlayoffSeries::ROUND_LABELS[r] || r },
        bracket:            bracket_summary(series_all),
        batting_leaders: {
          ops: top(batters, :ops, 5),
          avg: top(batters.select { |s| s[:ab] >= [min_ab * 2, 8].max }, :avg, 5),
          hr:  top(batters, :hr, 5),
          rbi: top(batters, :rbi, 5),
          r:   top(batters, :r, 5),
        },
        pitching_leaders: {
          era:  top(pitchers, :era, 5, asc: true),
          k:    top(pitchers, :k_pitched, 5),
          whip: top(pitchers, :whip, 5, asc: true),
        },
      }

      client    = OpenAi::Client.new
      ai_result = client.json_completion(
        system_prompt:    system_prompt(ctx),
        user_payload:     payload,
        interaction_type: "sim_playoff_insight",
        metadata:         { league_id: league.id },
        temperature:      0.5,
      )

      output = ai_result[:output] || {}
      {
        narrative: output["narrative"].to_s.presence || "Playoff summary unavailable.",
        phase:     ctx[:phase].to_s,
        bullets:   {
          series_storylines:   normalize(output["series_storylines"]),
          standout_performers: normalize(output["standout_performers"]),
          champion_notes:      normalize(output["champion_notes"]),
        },
        generated_at: Time.current.utc.iso8601,
        cached:       false,
      }
    rescue => e
      { error: e.message }
    end

    def playoff_context(series_all)
      complete_rounds = []
      active_rounds   = []
      pending_rounds  = []

      SimulationPlayoffSeries::ROUNDS.each do |round|
        round_series = series_all.select { |s| s.round == round }
        next if round_series.empty?

        if round_series.all?(&:complete?)
          complete_rounds << round
        elsif round_series.any? { |s| s.status == "in_progress" || s.status == "complete" }
          active_rounds << round
        else
          pending_rounds << round
        end
      end

      current_round = (active_rounds + pending_rounds).min_by { |r| SimulationPlayoffSeries::ROUNDS.index(r) } ||
                      complete_rounds.max_by { |r| SimulationPlayoffSeries::ROUNDS.index(r) }

      phase = if complete_rounds.include?("ws")
                :complete
              elsif current_round == "ws"
                :world_series
              elsif current_round == "cs"
                :championship_series
              elsif current_round == "ds"
                :division_series
              else
                :wild_card
              end

      { phase:, current_round:, complete_rounds:, active_rounds:, pending_rounds: }
    end

    def playoff_context_description(ctx)
      case ctx[:phase]
      when :complete
        "MLB postseason complete — full bracket available."
      when :world_series
        "MLB postseason — World Series #{ctx[:active_rounds].include?('ws') ? 'in progress' : 'pending'}. Wild Card, Division Series, and Championship Series are finished."
      when :championship_series
        completed = ctx[:complete_rounds].map { |r| SimulationPlayoffSeries::ROUND_LABELS[r] }.join(", ")
        "MLB postseason — Championship Series (LCS) #{ctx[:active_rounds].include?('cs') ? 'in progress' : 'pending'}. #{completed} complete."
      when :division_series
        "MLB postseason — Division Series #{ctx[:active_rounds].include?('ds') ? 'in progress' : 'pending'}. Wild Card round complete."
      else
        "MLB postseason — Wild Card round #{ctx[:active_rounds].include?('wc') ? 'in progress' : 'pending'}."
      end
    end

    def system_prompt(ctx)
      case ctx[:phase]
      when :complete             then complete_prompt
      when :world_series         then in_progress_prompt(ctx,
        round:         "World Series",
        action:        "covering the World Series",
        round_context: "The Wild Card, Division Series, and Championship Series are all finished. The World Series is the final stage.",
        outlook_hint:  "What to watch for as the World Series unfolds — key matchups, pitching advantages, or lineup edges.",
      )
      when :championship_series  then in_progress_prompt(ctx,
        round:         "Championship Series (ALCS/NLCS)",
        action:        "covering the League Championship Series",
        round_context: "The Wild Card and Division Series are complete. The LCS determines who reaches the World Series.",
        outlook_hint:  "Which team looks best positioned to advance and what would make for a compelling World Series matchup.",
      )
      when :division_series      then in_progress_prompt(ctx,
        round:         "Division Series (ALDS/NLDS)",
        action:        "covering the Division Series round",
        round_context: "The Wild Card is complete. The Division Series is now underway.",
        outlook_hint:  "Which teams are favorites to advance through the DS and what LCS matchups are taking shape.",
      )
      else                            in_progress_prompt(ctx,
        round:         "Wild Card",
        action:        "covering the Wild Card round",
        round_context: "The playoffs are just beginning with the Wild Card round. No round has been completed yet.",
        outlook_hint:  "Which wild card teams look dangerous and which could make a surprise deep run.",
      )
      end
    end

    def complete_prompt
      <<~PROMPT
        You are a baseball analyst writing a full postseason recap for a simulated MLB playoff.
        All rounds are complete, including the World Series. Give a definitive recap.
        Highlight the champion's run, standout performers across all rounds, and the most dramatic series.
        Return only valid JSON matching this exact shape:

        {
          "narrative": "Three to four sentences capturing the arc of the postseason — the champion's journey, biggest upsets, and defining moments.",
          "series_storylines": ["bullet about a notable series result or upset"],
          "standout_performers": ["bullet about a batter who excelled across the playoffs", "bullet about a pitcher who dominated"],
          "champion_notes": ["bullet about what made the champion's run special — their path, key players, or defining moment"]
        }

        Rules:
        - Lead each bullet with a player or team name.
        - Keep bullets to one sentence each. Return 2–4 bullets per array.
        - Use concrete numbers (AVG, ERA, HR, etc.) from the payload.
        - Do not use words like "simulated" or "simulation" in the output.
        - Frame this as a real postseason — use playoff vocabulary (elimination game, series clincher, pennant, World Series).
      PROMPT
    end

    def in_progress_prompt(ctx, round:, action:, round_context:, outlook_hint:)
      wc_done = ctx[:complete_rounds].include?("wc")
      # The champion has NOT been decided at this point.
      <<~PROMPT
        You are a baseball analyst #{action} in a simulated MLB postseason.
        #{round_context}
        Write with the weight and drama of real playoff baseball. Use the bracket and stats from the payload.
        Stats may reflect small samples; focus on performance quality and series dynamics.
        Return only valid JSON matching this exact shape:

        {
          "narrative": "Three to four sentences describing the state of the #{round} — what has happened, what is at stake, and the emerging storylines.",
          "series_storylines": ["bullet about a notable series result or compelling matchup so far"],
          "standout_performers": ["bullet about a batter performing well", "bullet about a pitcher who has stood out"],
          "champion_notes": ["#{outlook_hint}"]
        }

        Rules:
        - Lead each bullet with a player or team name.
        - Keep bullets to one sentence each. Return 2–4 bullets per array.
        - Use concrete numbers from the payload where available; if stats are sparse, focus on series dynamics and team narratives.
        - Do not use words like "simulated" or "simulation" in the output.
        - Use playoff vocabulary — elimination game, must-win, series momentum, pennant race, etc.
        - The World Series champion has NOT been determined yet — do not refer to a champion or Series winner.
      PROMPT
    end

    def aggregate_stats(stats)
      grouped = stats.group_by(&:player_id)
      grouped.map do |_pid, rows|
        first  = rows.first
        totals = rows.each_with_object(Hash.new(0)) do |row, h|
          %i[ab bb hbp sf h hr doubles triples r rbi k outs_pitched er bb_allowed h_allowed k_pitched w l sv bf hr_allowed g g_pitched gs].each do |col|
            h[col] += row.send(col).to_i
          end
        end
        totals.merge(
          player_id:   first.player_id,
          player_name: first.player_name,
          player_type: first.player_type,
          team_id:     first.team_id,
        ).then { |t| enrich(t) }
      end
    end

    def enrich(t)
      pa  = t[:ab] + t[:bb] + t[:hbp] + t[:sf]
      tb  = (t[:h] - t[:hr] - t[:doubles] - t[:triples]).clamp(0, Float::INFINITY) +
            2 * t[:doubles] + 3 * t[:triples] + 4 * t[:hr]
      avg  = t[:ab].positive? ? (t[:h].to_f / t[:ab]).round(3) : 0.0
      obp  = pa.positive? ? ((t[:h] + t[:bb] + t[:hbp]).to_f / pa).round(3) : 0.0
      slg  = t[:ab].positive? ? (tb.to_f / t[:ab]).round(3) : 0.0
      era  = t[:outs_pitched].positive? ? (t[:er] * 27.0 / t[:outs_pitched]).round(2) : 0.0
      whip = t[:outs_pitched].positive? ? ((t[:bb_allowed] + t[:h_allowed]) / (t[:outs_pitched] / 3.0)).round(2) : 0.0

      t.merge(pa: pa, tb: tb, avg: avg, obp: obp, slg: slg, ops: (obp + slg).round(3), era: era, whip: whip)
    end

    def top(collection, stat, limit, asc: false)
      sorted = asc ? collection.sort_by { |s| s[stat] } : collection.sort_by { |s| -s[stat] }
      sorted.first(limit).map { |s| { name: s[:player_name], value: s[stat] } }
    end

    def bracket_summary(series_all)
      series_all.map do |s|
        {
          round:   SimulationPlayoffSeries::ROUND_LABELS[s.round] || s.round,
          matchup: "#{s.away_team_abbr} vs #{s.home_team_abbr}",
          result:  s.complete? ? "#{s.winner_abbr} wins #{[s.home_wins, s.away_wins].max}-#{[s.home_wins, s.away_wins].min}" : s.status,
          games:   s.games.size,
        }
      end
    end

    def normalize(val)
      Array(val).map { |v| v.to_s.strip }.reject(&:blank?).first(4)
        .presence || ["Not enough playoff data yet."]
    end
  end
end
