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
      return { error: "Playoffs are not yet complete" } unless series_all.any?(&:complete?)

      stats    = league.simulation_playoff_player_stats.to_a
      roster_map = league.simulation_rosters.index_by(&:team_id)

      aggregated = aggregate_stats(stats)
      batters    = aggregated.select { |s| s[:player_type] == "batter" && s[:ab] >= 8 }
      pitchers   = aggregated.select { |s| s[:player_type] == "pitcher" && s[:outs_pitched] >= 3 }

      payload = {
        context:          "MLB postseason — these are playoff games, high-stakes elimination rounds",
        league_name:      league.name,
        season:           league.season,
        bracket:          bracket_summary(series_all),
        batting_leaders: {
          ops: top(batters, :ops, 5),
          avg: top(batters.select { |s| s[:ab] >= 12 }, :avg, 5),
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
        system_prompt:    system_prompt,
        user_payload:     payload,
        interaction_type: "sim_playoff_insight",
        metadata:         { league_id: league.id },
        temperature:      0.5,
      )

      output = ai_result[:output] || {}
      {
        narrative: output["narrative"].to_s.presence || "Playoff recap unavailable.",
        bullets:   {
          series_storylines:    normalize(output["series_storylines"]),
          standout_performers:  normalize(output["standout_performers"]),
          champion_notes:       normalize(output["champion_notes"]),
        },
        generated_at: Time.current.utc.iso8601,
        cached:       false,
      }
    rescue => e
      { error: e.message }
    end

    # Roll up per-series rows into per-player totals.
    def aggregate_stats(stats)
      grouped = stats.group_by(&:player_id)
      grouped.map do |_pid, rows|
        first = rows.first
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
      avg = t[:ab].positive? ? (t[:h].to_f / t[:ab]).round(3) : 0.0
      obp = pa.positive? ? ((t[:h] + t[:bb] + t[:hbp]).to_f / pa).round(3) : 0.0
      slg = t[:ab].positive? ? (tb.to_f / t[:ab]).round(3) : 0.0
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
          result:  s.complete? ? "#{s.winner_abbr} wins #{s.home_wins}-#{s.away_wins}" : "in progress",
          games:   s.games.size,
        }
      end
    end

    def system_prompt
      <<~PROMPT
        You are a baseball analyst writing a postseason recap for a simulated MLB playoff.
        These are playoff elimination games — treat them with the weight and drama of real postseason baseball.
        Highlight clutch performances, dominant series, surprising upsets, and what made the champion's run special.
        Return only valid JSON matching this exact shape:

        {
          "narrative": "Three to four sentences capturing the arc of the postseason — momentum swings, dominant teams, surprising exits.",
          "series_storylines": ["bullet about a notable series result or upset"],
          "standout_performers": ["bullet about a batter who excelled", "bullet about a pitcher who dominated"],
          "champion_notes": ["bullet about what made the champion's run special"]
        }

        Rules:
        - Lead each bullet with a player or team name.
        - Keep bullets to one sentence each. Return 2–4 bullets per array.
        - Use concrete numbers (AVG, ERA, HR, etc.) from the payload.
        - Do not use words like "simulated" or "simulation" in the output.
        - Frame this as a real postseason — use playoff vocabulary (elimination game, series clincher, pennant race, World Series).
      PROMPT
    end

    def normalize(val)
      Array(val).map { |v| v.to_s.strip }.reject(&:blank?).first(4)
        .presence || ["Not enough playoff data."]
    end
  end
end
