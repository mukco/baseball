class PicksService
  CACHE_TTL = 15.minutes

  class << self
    def call(game_pk:, refresh: false)
      cache_key = "picks:#{game_pk}"

      unless refresh
        cached = Rails.cache.read(cache_key)
        return cached.merge(cached: true) if cached.present?
      end

      generated = generate(game_pk)
      Rails.cache.write(cache_key, generated, expires_in: CACHE_TTL) unless generated[:error]
      generated
    end

    private

    def generate(game_pk)
      mlb    = MlbApiService.new
      game   = mlb.game_details(game_pk)
      odds   = fetch_odds(game)
      records = fetch_team_records(mlb)
      pitchers = build_pitcher_context(game, mlb)
      client = OpenAi::Client.new

      ai_result = client.json_completion(
        system_prompt: system_prompt,
        user_payload: build_payload(game, odds, records, pitchers),
        interaction_type: "game_picks",
        temperature: 0.4,
        metadata: { game_pk: game_pk }
      )

      raw = ai_result[:output]
      {
        gamePk: game_pk,
        generatedAt: Time.current.utc.iso8601,
        model: ai_result[:model],
        cached: false,
        gameDate: game[:gameDate],
        status: game[:status],
        picks: normalize_picks(raw)
      }
    rescue => e
      { error: e.message }
    end

    def fetch_odds(game)
      date = game[:gameDate]&.split("T")&.first || Date.current.iso8601
      odds_data = OddsService.today(date: date)
      return nil if odds_data[:error] || !odds_data[:games]

      home_name = game.dig(:teams, :home, :name)
      away_name = game.dig(:teams, :away, :name)

      match = odds_data[:games].find do |g|
        g[:home_team] == home_name && g[:away_team] == away_name
      end
      match&.[](:odds_data)
    rescue
      nil
    end

    def fetch_team_records(mlb)
      mlb.send(:standings_map)
    rescue
      {}
    end

    def build_pitcher_context(game, mlb)
      season = Date.current.year
      [:away, :home].each_with_object({}) do |side, ctx|
        pitcher = game.dig(:gameContext, :probablePitchers, side)
        next unless pitcher&.dig(:id).present?

        season_stats = mlb.player_season_stats(pitcher[:id], season)
        pit = season_stats[:pitching] || {}

        ctx[side] = {
          id:   pitcher[:id],
          name: pitcher[:name],
          era:   pit["era"],
          whip:  pit["whip"],
          kPer9: pit["strikeoutsPer9Inn"],
          bbPer9: pit["walksPer9Inn"],
          ip:    pit["inningsPitched"],
          wins:  pit["wins"],
          losses: pit["losses"],
          strikeOuts: pit["strikeOuts"]
        }.compact
      rescue
        { id: pitcher[:id], name: pitcher[:name] }
      end
    end

    def build_payload(game, odds, records, pitchers)
      home_id = game.dig(:teams, :home, :id).to_i
      away_id = game.dig(:teams, :away, :id).to_i

      {
        game: {
          gamePk:   game[:gamePk],
          gameDate: game[:gameDate],
          status:   game[:status],
          venue:    game[:venue],
          teams: {
            away: game.dig(:teams, :away).merge(record: records[away_id]),
            home: game.dig(:teams, :home).merge(record: records[home_id])
          }
        },
        probablePitchers: pitchers,
        advanced: {
          teamBatting:  game.dig(:advanced, :teamBatting),
          teamPitching: game.dig(:advanced, :teamPitching),
          hitters:      game.dig(:advanced, :hitters),
          edges:        game.dig(:advanced, :edges)
        },
        boxscore: {
          pitching: game.dig(:boxscore, :pitching)
        },
        bettingLines: odds ? {
          moneyline:      odds[:moneyline],
          homeMoneyline:  odds[:home_moneyline],
          awayMoneyline:  odds[:away_moneyline],
          overUnder:      odds[:over_under],
          overOdds:       odds[:over_odds],
          underOdds:      odds[:under_odds],
          spread:         odds[:spread],
          provider:       odds[:provider]
        } : nil
      }
    end

    def system_prompt
      <<~PROMPT
        You are a sharp baseball betting analyst. Your job is to give direct, opinionated picks with specific supporting evidence.

        Use the provided game data as your primary source. You may and should supplement it with your general knowledge of these teams, pitchers, and current-season trends — especially for preview games where boxscore data is thin. Never refuse to pick.

        Required JSON shape:
        {
          "moneyline": {
            "pick": "Exact team name from the data",
            "confidence": "high|medium|low",
            "key_factors": ["Specific factor with a number or stat", "Second specific factor"],
            "reasoning": "2-3 sentences of analysis grounded in matchup context, recent form, and the data provided."
          },
          "overUnder": {
            "pick": "Over X.5 or Under X.5",
            "confidence": "high|medium|low",
            "key_factors": ["Specific factor", "Second specific factor"],
            "reasoning": "2-3 sentences."
          },
          "playerProps": [
            {
              "player": "Full name",
              "prop": "Over/Under X.5 strikeouts|hits|total bases|RBIs|etc.",
              "confidence": "high|medium|low",
              "reasoning": "1-2 sentences grounding the prop in matchup, splits, or recent form."
            }
          ],
          "valueSide": "One sentence on where market value lies if betting lines are present, otherwise null.",
          "summary": "One sharp sentence — the single best play on this game."
        }

        Analysis rules:
        - Always pick a side. Never return null or hedge without a direction. If data is thin, pick with low confidence.
        - Confidence: high = clear edge you'd bet with conviction, medium = lean with a reason, low = slight lean in a toss-up.
        - key_factors must cite specifics: ERA, FIP, wOBA, K%, recent W-L streak, record vs. LHP/RHP — not vague adjectives like "hot offense."
        - For preview games: anchor on starting pitcher quality (ERA, WHIP, K/9), team offensive wOBA and K-BB%, season records, home/away splits, and park context.
        - For live games: weigh current score, pitching usage, and game state heavily.
        - Player props: prefer strikeout props for quality starters facing weak lineups, and total bases props for hot hitters in favorable matchups. Include 1-3 props when evidence supports them.
        - If betting lines are provided, note whether the line looks sharp or soft relative to your read.
        - Return only valid JSON. No markdown, no commentary outside the JSON.
      PROMPT
    end

    def normalize_picks(raw)
      return { error: "No picks data returned" } unless raw.is_a?(Hash)

      {
        moneyline:   normalize_pick(raw["moneyline"]),
        overUnder:   normalize_pick(raw["overUnder"]),
        playerProps: Array(raw["playerProps"]).filter_map { |p| normalize_pick(p) },
        valueSide:   raw["valueSide"].to_s.strip.presence,
        summary:     raw["summary"].to_s.strip.presence
      }
    end

    def normalize_pick(pick)
      return nil unless pick.is_a?(Hash)

      p = {
        pick:       pick["pick"].to_s.strip,
        confidence: pick["confidence"].to_s.strip,
        reasoning:  pick["reasoning"].to_s.strip
      }

      p[:key_factors] = Array(pick["key_factors"]).map(&:to_s).reject(&:empty?) if pick["key_factors"].present?
      p[:player] = pick["player"].to_s.strip if pick["player"].present?
      p[:prop]   = pick["prop"].to_s.strip   if pick["prop"].present?
      p[:pick].present? ? p.compact : nil
    end
  end
end
