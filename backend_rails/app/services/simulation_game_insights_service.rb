class SimulationGameInsightsService
  CACHE_TTL = 1.hour

  class << self
    def call(game_id:, refresh: false)
      cache_key = "sim_game_insights:#{game_id}"

      unless refresh
        cached = Rails.cache.read(cache_key)
        return cached.merge(cached: true) if cached.present?
      end

      generated = generate(game_id)
      Rails.cache.write(cache_key, generated, expires_in: CACHE_TTL) unless generated[:error]
      generated
    end

    private

    def generate(game_id)
      game = SimulationGame.find(game_id)
      return { error: "Game has not been simulated yet" } unless game.final?

      box    = JSON.parse(game.box_score_json || "{}")
      client = OpenAi::Client.new

      ai_result = client.json_completion(
        system_prompt: system_prompt,
        user_payload:  build_payload(game, box),
        interaction_type: "sim_game_insights",
        metadata: { game_id: game_id }
      )

      {
        game_id:      game_id,
        generated_at: Time.current.utc.iso8601,
        cached:       false,
        insights:     normalize_insights(ai_result[:output])
      }
    rescue => e
      { error: e.message }
    end

    def build_payload(game, box)
      league  = game.simulation_league
      season  = league&.season || game.game_date&.year
      ctx     = league ? SimulationSeasonContext.for_league(league) : {}

      {
        matchup: {
          away_team:   game.away_team_abbr,
          home_team:   game.home_team_abbr,
          away_score:  game.away_score,
          home_score:  game.home_score,
          game_date:   game.game_date&.to_s,
          season:      season,
          season_context: ctx
        },
        away_batting:  batting_summary(box.dig("away", "batters") || []),
        home_batting:  batting_summary(box.dig("home", "batters") || []),
        away_pitching: pitching_summary(box.dig("away", "pitchers") || []),
        home_pitching: pitching_summary(box.dig("home", "pitchers") || []),
        linescore:     box["linescore"]
      }
    end

    def batting_summary(batters)
      batters.first(9).map do |b|
        { name: b["name"], ab: b["ab"], h: b["h"], hr: b["hr"],
          rbi: b["rbi"], bb: b["bb"], k: b["k"] }
      end
    end

    def pitching_summary(pitchers)
      pitchers.map do |p|
        { name: p["name"], ip: p["ip"], h: p["h"], er: p["er"],
          bb: p["bb"], k: p["k"], decision: p["decision"] }
      end
    end

    def system_prompt
      <<~PROMPT
        You are a baseball analyst covering today's game. Analyze the box score and write sharp, natural game coverage.
        Write as if filing a post-game report. The season_context field in the payload tells you exactly where in the season
        this game falls — use phase_label and milestone_notes to shape your tone and emphasis. A game in the stretch run
        carries different weight than an April contest; a trade-deadline week game has different storylines than All-Star week.
        Return JSON only — no preamble, no markdown.

        Required JSON shape:
        {
          "key_takeaways":          ["..."],
          "standout_performances":  ["..."],
          "pitching_story":         ["..."],
          "game_notes":             ["..."]
        }

        Rules:
        - Each bullet is one concise sentence. No fluff.
        - Use only evidence from the provided box score data.
        - Begin each bullet with the relevant player or team name.
        - "key_takeaways": the 2–3 things that decided the game.
        - "standout_performances": players who were exceptional or notably bad.
        - "pitching_story": how the arms performed — starters, bullpen, decisions.
        - "game_notes": anything unusual, dramatic, or worth highlighting (dominant line, blowout, late comeback, etc.).
        - Return 2–4 bullets per section.
        - Do not reference simulations, models, projections, or engines.
      PROMPT
    end

    def normalize_insights(raw)
      {
        key_takeaways:         normalize_array(raw, "key_takeaways"),
        standout_performances: normalize_array(raw, "standout_performances"),
        pitching_story:        normalize_array(raw, "pitching_story"),
        game_notes:            normalize_array(raw, "game_notes")
      }
    end

    def normalize_array(raw, key)
      values = raw[key] || raw[key.to_sym]
      Array(values).map { |v| v.to_s.strip }.reject(&:blank?).first(5).presence || ["—"]
    end
  end
end
