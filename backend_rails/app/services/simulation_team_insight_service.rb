class SimulationTeamInsightService
  class << self
    def call(league:, team_id:, refresh: false)
      record = SimulationInsight.find_by(
        simulation_league_id: league.id,
        subject_type: "team",
        subject_id: team_id
      )
      return record.as_insight_json if record && !refresh

      roster = league.simulation_rosters.find_by(team_id: team_id)
      return { error: "Team not found in this league" } unless roster

      result = generate(league, roster)
      return result if result[:error]

      (record || SimulationInsight.new(simulation_league_id: league.id, subject_type: "team", subject_id: team_id))
        .tap { |r| r.update!(narrative: result[:narrative], bullets: result[:bullets], generated_at: Time.current) }

      result.merge(cached: false)
    rescue => e
      { error: e.message }
    end

    private

    def generate(league, roster)
      ctx     = SimulationSeasonContext.for_league(league)
      team_id = roster.team_id

      return generate_preview(league, roster, ctx) if ctx[:phase] == :pre_season

      stats    = league.simulation_player_stats.to_a
      batters  = stats.select { |s| s.team_id == team_id && s.player_type == "batter" && s.ab > 0 }
      pitchers = stats.select { |s| s.team_id == team_id && s.player_type == "pitcher" && s.outs_pitched > 0 }

      games        = league.simulation_games.where("simulated_at IS NOT NULL")
      wins         = games.where("(home_team_id = ? AND home_score > away_score) OR (away_team_id = ? AND away_score > home_score)", team_id, team_id).count
      losses       = games.where("(home_team_id = ? AND home_score < away_score) OR (away_team_id = ? AND away_score < home_score)", team_id, team_id).count
      total_outs   = pitchers.sum(&:outs_pitched)
      total_er     = pitchers.sum(&:er)

      top_batters  = batters.select { |s| s.ab >= 30 }.sort_by { |s| -s.ops }.first(5)
                            .map { |s| { name: s.player_name, g: s.g, hr: s.hr, doubles: s.doubles, avg: s.avg,
                                         obp: s.obp, slg: s.slg, ops: s.ops, woba: s.woba, rbi: s.rbi } }
      top_pitchers = pitchers.select { |s| s.outs_pitched >= 30 }.sort_by { |s| s.era }.first(5)
                             .map { |s| { name: s.player_name, w: s.w, l: s.l, era: s.era, ip: s.ip_display, k: s.k_pitched } }

      payload = {
        team:           roster.team_abbr,
        team_name:      roster.team_name,
        season:         league.season,
        season_context: ctx,
        record:         { w: wins, l: losses },
        team_batting:   {
          ops:         batters.empty? ? nil : avg_ops(batters).round(3),
          hr:          batters.sum(&:hr),
          runs:        batters.sum(&:r),
          top_batters: top_batters
        },
        team_pitching: {
          era:          total_outs > 0 ? (total_er * 27.0 / total_outs).round(2) : nil,
          top_pitchers: top_pitchers
        }
      }

      client    = OpenAi::Client.new
      ai_result = client.json_completion(
        system_prompt:    system_prompt(ctx),
        user_payload:     payload,
        interaction_type: "sim_team_insight",
        metadata:         { league_id: league.id, team_id: team_id },
        temperature:      0.4
      )

      raw = ai_result[:output]
      {
        narrative: raw["narrative"].to_s.strip,
        bullets: {
          season_summary:      normalize(raw["season_summary"]),
          batting_highlights:  normalize(raw["batting_highlights"]),
          pitching_highlights: normalize(raw["pitching_highlights"])
        }
      }
    end

    def generate_preview(league, roster, ctx)
      team_id  = roster.team_id
      scenario = league.projection_scenario

      proj_batters  = []
      proj_pitchers = []

      if scenario
        run = scenario.projection_runs.order(ran_at: :desc).first
        if run
          player_ids = roster.roster.map { |p| p[:id] }
          projs      = run.player_projections
                          .where(projection_type: "full_season", player_id: player_ids)
                          .to_a

          proj_batters = projs
            .select { |p| p.player_type == "batter" }
            .sort_by { |p| -(p.projected_stats_hash[:ops].to_f) }
            .first(5)
            .map do |p|
              s = p.projected_stats_hash
              { name: p.player_name, hr: s[:hr], avg: s[:avg], ops: s[:ops], rbi: s[:rbi] }.compact
            end

          proj_pitchers = projs
            .select { |p| p.player_type == "pitcher" }
            .reject { |p| p.projected_stats_hash[:era].to_f.zero? }
            .sort_by { |p| p.projected_stats_hash[:era].to_f }
            .first(5)
            .map do |p|
              s = p.projected_stats_hash
              { name: p.player_name, era: s[:era], ip: s[:ip], w: s[:w], k_per_9: s[:k_per_9] }.compact
            end
        end
      end

      payload = {
        team:                     roster.team_abbr,
        team_name:                roster.team_name,
        season:                   league.season,
        season_context:           ctx,
        has_projections:          proj_batters.any?,
        projected_batting_core:   proj_batters,
        projected_pitching_staff: proj_pitchers
      }

      client    = OpenAi::Client.new
      ai_result = client.json_completion(
        system_prompt:    preview_system_prompt,
        user_payload:     payload,
        interaction_type: "sim_team_insight",
        metadata:         { league_id: league.id, team_id: team_id },
        temperature:      0.5
      )

      raw = ai_result[:output]
      {
        narrative: raw["narrative"].to_s.strip,
        bullets: {
          season_summary:      normalize(raw["season_summary"]),
          batting_highlights:  normalize(raw["batting_highlights"]),
          pitching_highlights: normalize(raw["pitching_highlights"])
        }
      }
    end

    def preview_system_prompt
      <<~PROMPT
        You are a baseball analyst writing a team season preview. No games have been played yet.
        Use projection data to describe what to expect from this team in the upcoming season.
        Write with anticipation — focus on strengths, question marks, and what success would look like.
        Return only valid JSON matching this exact shape:

        {
          "narrative": "Two to three sentences previewing the team's season outlook. What kind of team are they and what are their realistic expectations?",
          "season_summary": ["bullet about the team's overall ceiling and likely role in the standings"],
          "batting_highlights": ["bullet about their most dangerous projected hitter", "bullet about the lineup's overall offensive profile"],
          "pitching_highlights": ["bullet about their rotation anchor or bullpen strength", "bullet about a pitching question mark or concern"]
        }

        Rules:
        - Lead each bullet with a player or team name.
        - Keep bullets to one sentence each. Return 2–3 bullets per array.
        - Use projected numbers from the payload where available.
        - Frame everything as forward-looking — use "projects to", "is expected to", "will anchor".
        - Do not use words like "simulated", "simulation", or "projection" in the output.
      PROMPT
    end

    def system_prompt(ctx)
      phase = ctx[:phase]
      notes = ctx[:milestone_notes]

      action = case phase
               when :complete      then "writing a team season review"
               when :final_weeks   then "covering a team in the final weeks of the season"
               when :stretch_run   then "reporting on a team in the playoff stretch run"
               when :second_half   then "analyzing a team in the second half of the season"
               when :midseason     then "writing a team midseason report"
               when :first_half    then "analyzing a team's first-half performance"
               when :early         then "covering a team's early-season performance"
               else                     "analyzing a team's season performance"
               end

      tone = case phase
             when :complete
               "Deliver a definitive verdict on the team's season — what worked, what didn't, who stood out."
             when :final_weeks
               "Focus on what this team is playing for in the final stretch — playoff position, pride, individual milestones."
             when :stretch_run
               "Evaluate the team's playoff chances and identify the players who will determine their fate."
             when :second_half
               "Assess how the team is set up for the second half. Did they address needs at the deadline? Are they buyers or sellers?"
             when :midseason
               "Give honest midseason grades on the roster. Highlight over- and under-achievers. What needs to change?"
             when :first_half
               "What has the early season revealed about this team's identity? What has surprised you, good or bad?"
             when :early
               "Read the early returns carefully — small samples, but early indicators of the season ahead."
             else
               "Analyze this team's season performance honestly."
             end

      milestone_str = notes.any? ? "\n\nContext: #{notes.join(' ')}" : ""

      <<~PROMPT
        You are a baseball analytics assistant #{action}.#{milestone_str}
        #{tone}
        Write in a direct, analytical tone as you would for any real team.
        Return only valid JSON matching this exact shape:

        {
          "narrative": "Two to three sentences summarizing the team's season at this point.",
          "season_summary": ["bullet about overall record and run differential or standing"],
          "batting_highlights": ["bullet about top offensive performers or trends"],
          "pitching_highlights": ["bullet about pitching staff strengths or weaknesses"]
        }

        Rules:
        - Lead each bullet with a player or team name.
        - Keep bullets to one sentence each. Return 2–3 bullets per array.
        - Use concrete numbers from the payload.
        - Do not use words like "simulated" or "simulation" in the output.
      PROMPT
    end

    def avg_ops(batters)
      total_ab  = batters.sum(&:ab).to_f
      return 0.0 if total_ab.zero?
      total_pa  = batters.sum(&:pa).to_f
      total_h   = batters.sum(&:h)
      total_bb  = batters.sum(&:bb)
      total_hbp = batters.sum { |b| b.hbp.to_i }
      total_tb  = batters.sum(&:tb)
      obp = total_pa > 0 ? (total_h + total_bb + total_hbp) / total_pa : 0.0
      slg = total_tb / total_ab
      obp + slg
    end

    def normalize(val)
      Array(val).map { |v| v.to_s.strip }.reject(&:blank?).first(3)
        .presence || ["Not enough data yet."]
    end
  end
end
