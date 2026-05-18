class SimulationNewsService
  NOTABLE_THRESHOLD  = 2
  BLOWOUT_DIFF       = 8
  PITCHER_DUEL_RUNS  = 1
  EXPLOSION_SCORE    = 12
  MULTI_HR_MIN       = 2
  DOM_K_MIN          = 13
  DOM_IP_MIN_OUTS    = 24  # 8.0 IP
  NOHIT_IP_MIN_OUTS  = 24  # 8.0 IP
  MAX_DOM_STARTS     = 2   # cap dominant start events per day to avoid pitching-only stories

  class << self
    def generate_for_date(league, date)
      date = date.is_a?(String) ? Date.parse(date) : date

      existing = SimulationNewsStory.find_by(simulation_league_id: league.id, story_date: date)
      return existing if existing

      games = league.simulation_games
                    .where(game_date: date)
                    .where.not(simulated_at: nil)
                    .to_a
      return nil if games.empty?

      events, player_refs = find_notable_events(games)

      if events.size < NOTABLE_THRESHOLD
        return SimulationNewsStory.create!(
          simulation_league_id: league.id,
          story_date:           date,
          headline:             nil,
          stories_json:         { stories: [], player_refs: [] }.to_json,
          games_count:          games.size,
          ai_generated:         false
        )
      end

      ai_result    = call_openai(date, games.size, events)
      SimulationNewsStory.create!(
        simulation_league_id: league.id,
        story_date:           date,
        headline:             ai_result["headline"],
        stories_json:         { stories: ai_result["stories"] || [], player_refs: player_refs }.to_json,
        games_count:          games.size,
        ai_generated:         true
      )
    rescue ActiveRecord::RecordNotUnique
      SimulationNewsStory.find_by!(simulation_league_id: league.id, story_date: date)
    rescue => e
      Rails.logger.error "[SimulationNewsService] #{date}: #{e.message}"
      nil
    end

    def find_notable_events(games)
      events      = []
      player_refs = {}  # keyed by player_id to deduplicate

      games.each do |game|
        home  = game.home_score.to_i
        away  = game.away_score.to_i
        diff  = (home - away).abs
        total = home + away

        if diff >= BLOWOUT_DIFF
          w_abbr, l_abbr = home > away ? [game.home_team_abbr, game.away_team_abbr] : [game.away_team_abbr, game.home_team_abbr]
          w_score, l_score = [home, away].max, [home, away].min
          events << "BLOWOUT: #{w_abbr} #{w_score}, #{l_abbr} #{l_score}"
        end

        if total <= PITCHER_DUEL_RUNS
          events << "PITCHER'S DUEL: #{game.away_team_abbr} vs #{game.home_team_abbr} (#{away}-#{home})"
        end

        if [home, away].max >= EXPLOSION_SCORE
          big = home >= away ? game.home_team_abbr : game.away_team_abbr
          events << "OFFENSIVE EXPLOSION: #{big} scored #{[home, away].max}"
        end

        bs = game.box_score
        next unless bs

        [:home, :away].each do |side|
          abbr = side == :home ? game.home_team_abbr : game.away_team_abbr

          (bs.dig(side, :batters) || []).each do |b|
            next unless b[:hr].to_i >= MULTI_HR_MIN
            events << "MULTI-HR: #{abbr} — #{b[:name]} #{b[:hr]} HR"
            pid = b[:player_id]
            player_refs[pid] = { id: pid, name: b[:name], team: abbr } if pid
          end

          sp = (bs.dig(side, :pitchers) || []).first
          next unless sp

          outs  = ip_string_to_outs(sp[:ip])
          sp_k  = sp[:k].to_i
          sp_er = sp[:er].to_i
          sp_h  = sp[:h].to_i

          if outs >= NOHIT_IP_MIN_OUTS && sp_h == 0
            events << "NO-HIT CANDIDATE: #{abbr} — #{sp[:name]} #{sp[:ip]} IP 0 H #{sp_k} K"
            pid = sp[:player_id]
            player_refs[pid] = { id: pid, name: sp[:name], team: abbr } if pid
          elsif sp_k >= DOM_K_MIN || (sp_er == 0 && outs >= DOM_IP_MIN_OUTS)
            events << "DOMINANT START: #{abbr} — #{sp[:name]} #{sp[:ip]} IP #{sp_k} K #{sp_er} ER"
            pid = sp[:player_id]
            player_refs[pid] = { id: pid, name: sp[:name], team: abbr } if pid
          end
        end
      end

      # Cap dominant starts so pitching doesn't crowd out other story types
      dom_starts   = events.select { |e| e.start_with?("DOMINANT START") }.first(MAX_DOM_STARTS)
      other_events = events.reject { |e| e.start_with?("DOMINANT START") }.uniq
      [(other_events + dom_starts).uniq, player_refs.values]
    end

    private

    def ip_string_to_outs(ip_str)
      return 0 unless ip_str.present?
      parts = ip_str.to_s.split(".")
      (parts[0].to_i * 3) + parts[1].to_i
    end

    def call_openai(date, games_count, events)
      system_prompt = <<~PROMPT.strip
        You are a newspaper editor covering a simulated MLB season.
        Given notable events from today's games, write a brief daily digest.
        Treat the simulation as real. Return ONLY valid JSON:
        {"headline":"one-sentence day summary","stories":[{"headline":"...","body":"1-2 sentences"}]}
        Rules:
        - Include 2-4 stories. Be specific: use player names, team names, and exact scores.
        - Lead your top headline with the SINGLE most dramatic event — a blowout win, a walk-off, a monster HR game — not a generic "pitchers dominate" summary.
        - Vary your angle each story: mix offense/defense/drama. Avoid repeating "pitchers shine/dominate" as a framing.
        - If the day was genuinely pitching-dominated, you may say so — but still name the specific pitcher and game.
      PROMPT

      lines        = events.map { |e| "- #{e}" }.join("\n")
      user_payload = "Date: #{date}\nGames played: #{games_count}\n\nNotable events:\n#{lines}"

      result = OpenAi::Client.new.json_completion(
        system_prompt:    system_prompt,
        user_payload:     user_payload,
        interaction_type: "sim_daily_news",
        metadata:         { date: date.to_s },
        temperature:      0.5,
        timeout:          30
      )

      result[:output] || result["output"] || result
    end
  end
end
