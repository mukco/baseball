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
      ctx = SimulationSeasonContext.for_league(league)
      return generate_preview(league, ctx) if ctx[:phase] == :pre_season

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
        season_context:  ctx,
        games_simulated: ctx[:games_played],
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
        system_prompt:    system_prompt(ctx),
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

    def generate_preview(league, ctx)
      rosters  = league.simulation_rosters.to_a
      scenario = league.projection_scenario

      projected_batters  = []
      projected_pitchers = []

      if scenario
        run = scenario.projection_runs.order(ran_at: :desc).first
        if run
          all_projs = run.player_projections.where(projection_type: "full_season").to_a

          projected_batters = all_projs
            .select { |p| p.player_type == "batter" }
            .sort_by { |p| -(p.projected_stats_hash[:ops].to_f) }
            .first(8)
            .map do |p|
              s = p.projected_stats_hash
              { name: p.player_name, hr: s[:hr], avg: s[:avg], ops: s[:ops], rbi: s[:rbi] }.compact
            end

          projected_pitchers = all_projs
            .select { |p| p.player_type == "pitcher" }
            .reject { |p| p.projected_stats_hash[:era].to_f.zero? }
            .sort_by { |p| p.projected_stats_hash[:era].to_f }
            .first(8)
            .map do |p|
              s = p.projected_stats_hash
              { name: p.player_name, era: s[:era], ip: s[:ip], w: s[:w], k_per_9: s[:k_per_9] }.compact
            end
        end
      end

      payload = {
        league_name:               league.name,
        season:                    league.season,
        season_context:            ctx,
        teams:                     rosters.map { |r| { abbr: r.team_abbr, name: r.team_name } },
        has_projections:           projected_batters.any?,
        projected_batting_leaders: projected_batters,
        projected_pitching_leaders: projected_pitchers
      }

      client    = OpenAi::Client.new
      ai_result = client.json_completion(
        system_prompt:    preview_system_prompt,
        user_payload:     payload,
        interaction_type: "sim_season_insight",
        metadata:         { league_id: league.id },
        temperature:      0.6
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

    def preview_system_prompt
      <<~PROMPT
        You are a baseball analyst writing a season preview. No games have been played yet.
        Use projection data and team information to paint an exciting picture of the season ahead.
        Write with anticipation and enthusiasm — the season is about to begin.
        Return only valid JSON matching this exact shape:

        {
          "narrative": "Three to four sentences previewing the season. Highlight the most compelling players, teams, and storylines fans should watch.",
          "standout_performers": ["bullet about a projected standout hitter with specific numbers", "bullet about a projected ace or dominant pitcher"],
          "team_narratives": ["bullet about an expected contender and why", "bullet about a team with something to prove or an interesting storyline"],
          "notable_storylines": ["bullet about the most compelling storyline heading into the season — a historic chase, a rivalry, a player in a pivotal year"]
        }

        Rules:
        - Lead each bullet with a player or team name.
        - Keep bullets to one sentence each. Return 2–4 bullets per array.
        - Use projected numbers from the payload where available; speak to potential otherwise.
        - Frame everything as looking forward — "is projected to", "is expected to", "will look to" — not past tense.
        - Do not use words like "simulated", "simulation", or "projection" in the output.
      PROMPT
    end

    def system_prompt(ctx)
      phase = ctx[:phase]
      notes = ctx[:milestone_notes]

      action = case phase
               when :complete      then "writing a full season recap"
               when :final_weeks   then "covering the final weeks of the season"
               when :stretch_run   then "reporting on the stretch run and playoff race"
               when :second_half   then "analyzing the second half of the season"
               when :midseason     then "writing a midseason report at the All-Star break"
               when :first_half    then "analyzing the first half of the season"
               when :early         then "covering the early weeks of the season"
               else                     "analyzing the current season"
               end

      tone = case phase
             when :complete
               "Give a definitive accounting of what made this season — winners, defining moments, and lasting legacies."
             when :final_weeks
               "Focus on the final playoff push, teams with something at stake, and individual stat races still in play."
             when :stretch_run
               "Emphasize the playoff race — who's in, who's fighting to get in, and who's fading. Individual award races matter now too."
             when :second_half
               "Analyze how teams responded to the trade deadline and what the second half looks like for contenders and also-rans."
             when :midseason
               "Give first-half grades. Highlight who exceeded expectations, who fell short, and who the All-Star locks are. Award races are forming."
             when :first_half
               "Focus on early leaders and surprises. What storylines are developing? Who is ahead or behind projections?"
             when :early
               "Highlight what the small sample of early games has revealed. Hot starts, cold starts, and emerging narratives."
             else
               "Capture what's most notable at this point in the season."
             end

      milestone_str = notes.any? ? "\n\nContext: #{notes.join(' ')}" : ""

      <<~PROMPT
        You are a baseball analytics assistant #{action}.#{milestone_str}
        #{tone}
        Write in a direct, analytical tone as you would for any real season.
        Return only valid JSON matching this exact shape:

        {
          "narrative": "Three to four sentences capturing the arc of the season at this point.",
          "standout_performers": ["bullet about a top batter", "bullet about a top pitcher"],
          "team_narratives": ["bullet about the best team", "bullet about a surprising or struggling team"],
          "notable_storylines": ["bullet about a remarkable outcome, trend, or race worth watching"]
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
        .presence || ["Not enough data yet."]
    end
  end
end
