class SimulationSeasonInsightService
  class << self
    def call(league:, refresh: false)
      record = SimulationInsight.find_by(
        simulation_league_id: league.id,
        subject_type: "season",
        subject_id: nil
      )
      return record.as_insight_json if record && !refresh

      result = generate(league)
      return result if result[:error]

      (record || SimulationInsight.new(simulation_league_id: league.id, subject_type: "season", subject_id: nil))
        .tap { |r| r.update!(narrative: result[:narrative], bullets: result[:bullets], generated_at: Time.current) }

      result.merge(cached: false)
    rescue => e
      { error: e.message }
    end

    private

    def generate(league)
      stats    = league.simulation_player_stats.to_a
      batters  = stats.select { |s| s.player_type == "batter" && s.ab >= 50 }
      pitchers = stats.select { |s| s.player_type == "pitcher" && s.outs_pitched >= 30 }

      roster_map = league.simulation_rosters.index_by(&:team_id)

      team_records = team_win_loss(league, roster_map)
      best_team    = team_records.max_by { |t| t[:w] }
      worst_team   = team_records.min_by { |t| t[:w] }

      payload = {
        league_name:     league.name,
        season:          league.season,
        games_simulated: league.simulation_games.where("simulated_at IS NOT NULL").count,
        teams:           team_records.first(10),
        batting_leaders: {
          hr:  top_batters(batters, roster_map, :hr, 5),
          avg: top_batters(batters.select { |s| s.ab >= 100 }, roster_map, :avg, 5),
          ops: top_batters(batters.select { |s| s.ab >= 100 }, roster_map, :ops, 5),
          rbi: top_batters(batters, roster_map, :rbi, 5)
        },
        pitching_leaders: {
          era:  top_pitchers(pitchers, roster_map, :era, 5, asc: true),
          k:    top_pitchers(pitchers, roster_map, :k_pitched, 5),
          wins: top_pitchers(pitchers, roster_map, :w, 5)
        },
        best_team:  best_team,
        worst_team: worst_team
      }

      client    = OpenAi::Client.new
      ai_result = client.json_completion(
        system_prompt:    system_prompt,
        user_payload:     payload,
        interaction_type: "sim_season_insight",
        metadata:         { league_id: league.id },
        temperature:      0.5
      )

      raw = ai_result[:output]
      {
        narrative: raw["narrative"].to_s.strip,
        bullets: {
          standout_performers: normalize(raw["standout_performers"]),
          team_narratives:     normalize(raw["team_narratives"]),
          notable_storylines:  normalize(raw["notable_storylines"])
        }
      }
    end

    def team_win_loss(league, roster_map)
      games = league.simulation_games.where("simulated_at IS NOT NULL").to_a
      tally = Hash.new { |h, k| h[k] = { w: 0, l: 0 } }

      games.each do |g|
        if g.home_score > g.away_score
          tally[g.home_team_id][:w] += 1
          tally[g.away_team_id][:l] += 1
        elsif g.away_score > g.home_score
          tally[g.away_team_id][:w] += 1
          tally[g.home_team_id][:l]  += 1
        end
      end

      roster_map.map do |team_id, roster|
        { team: roster.team_abbr, w: tally[team_id][:w], l: tally[team_id][:l] }
      end.sort_by { |t| -t[:w] }
    end

    def top_batters(batters, roster_map, stat, limit)
      batters.sort_by { |s| -s.send(stat) }.first(limit).map do |s|
        { name: s.player_name, team: roster_map[s.team_id]&.team_abbr, stat => s.send(stat) }
      end
    end

    def top_pitchers(pitchers, roster_map, stat, limit, asc: false)
      sorted = asc ? pitchers.sort_by { |s| s.send(stat) } : pitchers.sort_by { |s| -s.send(stat) }
      sorted.first(limit).map do |s|
        { name: s.player_name, team: roster_map[s.team_id]&.team_abbr, stat => s.send(stat) }
      end
    end

    def system_prompt
      <<~PROMPT
        You are a baseball analytics assistant writing a league season recap.
        Highlight standout individual performances, compelling team storylines, and the most notable outcomes of the season.
        Write in a direct, analytical tone as you would for any real season.
        Return only valid JSON matching this exact shape:

        {
          "narrative": "Three to four sentences capturing the arc of the season.",
          "standout_performers": ["bullet about a top batter", "bullet about a top pitcher"],
          "team_narratives": ["bullet about the best team", "bullet about a surprising team"],
          "notable_storylines": ["bullet about a remarkable outcome or record"]
        }

        Rules:
        - Lead each bullet with a player or team name.
        - Keep bullets to one sentence each. Return 2–4 bullets per array.
        - Use concrete numbers from the payload.
        - Do not use words like "simulated" or "simulation" in the output.
      PROMPT
    end

    def normalize(val)
      Array(val).map { |v| v.to_s.strip }.reject(&:blank?).first(4)
        .presence || ["Not enough simulation data."]
    end
  end
end
