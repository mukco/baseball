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
      team_id  = roster.team_id
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
        team:          roster.team_abbr,
        team_name:     roster.team_name,
        season:        league.season,
        record:        { w: wins, l: losses },
        team_batting:  {
          ops:   batters.empty? ? nil : avg_ops(batters).round(3),
          hr:    batters.sum(&:hr),
          runs:  batters.sum(&:r),
          top_batters: top_batters
        },
        team_pitching: {
          era:       total_outs > 0 ? (total_er * 27.0 / total_outs).round(2) : nil,
          top_pitchers: top_pitchers
        }
      }

      client    = OpenAi::Client.new
      ai_result = client.json_completion(
        system_prompt:    system_prompt,
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

    def system_prompt
      <<~PROMPT
        You are a baseball analytics assistant writing a season review for a team.
        Analyze the team's win-loss record, team batting stats, and pitching staff performance.
        Write in a direct, analytical tone as you would for any real season.
        Return only valid JSON matching this exact shape:

        {
          "narrative": "Two or three sentences summarizing the team's season.",
          "season_summary": ["bullet about overall record and run differential"],
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
        .presence || ["Not enough simulation data."]
    end
  end
end
