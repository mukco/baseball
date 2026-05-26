class SimulationPlayerInsightService
  class << self
    def call(league:, player_id:, refresh: false)
      record = SimulationInsight.find_by(
        simulation_league_id: league.id,
        subject_type: "player",
        subject_id: player_id
      )
      return record.as_insight_json if record && !refresh

      stat = league.simulation_player_stats.find_by(player_id: player_id)
      return { error: "Player not found in this league" } unless stat

      result = generate(league, stat)
      return result if result[:error]

      (record || SimulationInsight.new(simulation_league_id: league.id, subject_type: "player", subject_id: player_id))
        .tap { |r| r.update!(narrative: result[:narrative], bullets: result[:bullets], generated_at: Time.current) }

      result.merge(cached: false)
    rescue => e
      { error: e.message }
    end

    private

    def generate(league, stat)
      ctx          = SimulationSeasonContext.for_league(league)
      sim_line     = serialize_stat(stat)
      projection   = fetch_projection(league, stat.player_id, stat.player_type)
      has_proj     = projection.present?
      roster       = league.simulation_rosters.find_by(team_id: stat.team_id)
      games_played = ctx[:games_played]

      payload = {
        player_name:    stat.player_name,
        player_type:    stat.player_type,
        team:           roster&.team_abbr || "UNK",
        season_context: ctx,
        season:         { year: league.season, games: games_played },
        stats:          sim_line,
      }
      payload[:projection] = projection if has_proj

      client    = OpenAi::Client.new
      ai_result = client.json_completion(
        system_prompt:    system_prompt(stat.player_type, ctx, has_proj: has_proj),
        user_payload:     payload,
        interaction_type: "sim_player_insight",
        metadata:         { league_id: league.id, player_id: stat.player_id },
        temperature:      0.4
      )

      raw = ai_result[:output]
      bullets = {
        season_summary:  normalize(raw["season_summary"]),
        notable_moments: normalize(raw["notable_moments"]),
      }
      bullets[:vs_projection] = normalize(raw["vs_projection"]) if has_proj

      {
        narrative: raw["narrative"].to_s.strip,
        bullets:   bullets,
      }
    end

    def system_prompt(player_type, ctx, has_proj: false)
      phase = ctx[:phase]
      notes = ctx[:milestone_notes]

      type_line = player_type == "batter" ?
        "The player is a hitter. Focus on AVG, OBP, SLG, OPS, HR, RBI, BB, K." :
        "The player is a pitcher. Focus on ERA, WHIP, W-L, IP, K, BB."

      proj_shape = has_proj ? %(\n  "vs_projection": ["bullet comparing actual stats to the projection"],) : ""
      proj_rule  = has_proj ? "\n- Compare to the projection with specific numbers showing over/under performance." : ""

      action = case phase
               when :complete      then "writing a full season review for a player"
               when :final_weeks   then "covering a player in the season's final weeks"
               when :stretch_run   then "reporting on a player during the stretch run"
               when :second_half   then "analyzing a player's second-half performance"
               when :midseason     then "writing a midseason player report"
               when :first_half    then "analyzing a player's first-half performance"
               when :early         then "covering a player's early-season numbers"
               else                     "analyzing a player's season performance"
               end

      tone = case phase
             when :complete
               "Deliver a definitive accounting of the player's season. What was their defining performance? How do they compare to expectations?"
             when :final_weeks
               "Focus on late-season relevance — are they helping their team's playoff push? Any milestones or award cases still in play?"
             when :stretch_run
               "Evaluate the player's postseason push relevance and whether their numbers support any award consideration."
             when :second_half
               "Assess whether the player has maintained first-half form or shown a trend — up or down — entering the second half."
             when :midseason
               "Give an honest midseason grade. Are they ahead of pace for career benchmarks? Is an All-Star nod deserved?"
             when :first_half
               "What has this player established in the early sample? Is the performance sustainable or a red flag?"
             when :early
               "Read the early numbers carefully and project the trajectory — promising start, slow start, or business as usual?"
             else
               "Analyze this player's season performance honestly."
             end

      milestone_str = notes.any? ? "\n\nContext: #{notes.join(' ')}" : ""

      <<~PROMPT
        You are a baseball analytics assistant #{action}.#{milestone_str}
        #{type_line}
        #{tone}
        Analyze the stats as you would any real season. Write in a direct, analytical tone.
        Return only valid JSON matching this exact shape:

        {
          "narrative": "Two to three sentences summarizing the player's season performance at this point.",
          "season_summary": ["bullet about overall production", "bullet about key counting stats"],#{proj_shape}
          "notable_moments": ["interesting stat, trend, or outlier from the season so far"]
        }

        Rules:
        - Lead each bullet with the player name.
        - Keep bullets to one sentence each. Return 2–3 bullets per array.
        - Use concrete numbers from the payload.#{proj_rule}
        - Do not use words like "simulated" or "simulation" in the output.
      PROMPT
    end

    def serialize_stat(stat)
      if stat.player_type == "batter"
        { g: stat.g, ab: stat.ab, h: stat.h, double: stat.doubles, triple: stat.triples,
          hr: stat.hr, rbi: stat.rbi, bb: stat.bb, k: stat.k, r: stat.r,
          hbp: stat.hbp, sf: stat.sf, tb: stat.tb,
          avg: stat.avg, obp: stat.obp, slg: stat.slg, ops: stat.ops,
          iso: stat.iso, woba: stat.woba }
      else
        { g: stat.g_pitched, gs: stat.gs, w: stat.w, l: stat.l, sv: stat.sv,
          ip: stat.ip_display, bf: stat.bf, h: stat.h_allowed, er: stat.er,
          bb: stat.bb_allowed, k: stat.k_pitched, hr: stat.hr_allowed,
          era: stat.era, whip: stat.whip, k9: stat.k9, bb9: stat.bb9,
          hr9: stat.hr9, k_bb: stat.k_bb }
      end
    end

    def fetch_projection(league, player_id, player_type)
      scenario = league.projection_scenario
      return nil unless scenario

      run = scenario.projection_runs.order(ran_at: :desc).first
      return nil unless run

      proj = run.player_projections.find_by(player_id: player_id, projection_type: "full_season", player_type: player_type)
      return nil unless proj

      proj.projected_stats_hash.slice(
        *%i[avg obp slg ops hr rbi bb k g ab r era whip w l ip k_per_9 bb_per_9 fip]
      ).reject { |_, v| v.nil? }
    end

    def normalize(val)
      Array(val).map { |v| v.to_s.strip }.reject(&:blank?).first(3)
        .presence || ["Not enough data yet."]
    end
  end
end
