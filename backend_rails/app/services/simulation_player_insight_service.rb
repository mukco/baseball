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
      sim_line     = serialize_stat(stat)
      projection   = fetch_projection(league, stat.player_id, stat.player_type)
      has_proj     = projection.present?
      roster       = league.simulation_rosters.find_by(team_id: stat.team_id)
      games_played = league.simulation_games.where("simulated_at IS NOT NULL").count

      payload = {
        player_name: stat.player_name,
        player_type: stat.player_type,
        team:        roster&.team_abbr || "UNK",
        season:      { year: league.season, games: games_played },
        stats:       sim_line,
      }
      payload[:projection] = projection if has_proj

      client    = OpenAi::Client.new
      ai_result = client.json_completion(
        system_prompt:    system_prompt(stat.player_type, has_proj: has_proj),
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

    def system_prompt(player_type, has_proj: false)
      type_line = player_type == "batter" ?
        "The player is a hitter. Focus on AVG, OBP, SLG, OPS, HR, RBI, BB, K." :
        "The player is a pitcher. Focus on ERA, WHIP, W-L, IP, K, BB."

      proj_shape = has_proj ? %(\n  "vs_projection": ["bullet comparing actual stats to the projection"],) : ""
      proj_rule  = has_proj ? "\n- Compare to the projection with specific numbers showing over/under performance." : ""

      <<~PROMPT
        You are a baseball analytics assistant writing a season review for a player.
        #{type_line}
        Analyze the stats as you would any real season. Write in a direct, analytical tone.
        Return only valid JSON matching this exact shape:

        {
          "narrative": "Two or three sentences summarizing the player's season performance.",
          "season_summary": ["bullet about overall production", "bullet about key counting stats"],#{proj_shape}
          "notable_moments": ["interesting stat or outlier result from the season"]
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
        .presence || ["Not enough simulation data."]
    end
  end
end
