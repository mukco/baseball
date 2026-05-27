class OttoneuInsightsService
  CACHE_TTL    = 30.minutes
  MAX_PLAYERS  = 6
  PITCHER_POSITIONS = %w[SP RP SP/RP].freeze

  # FanGraphs Points weights
  HIT_WEIGHTS = { ab: -1.0, h: 5.6, hr: 9.4, bb: 3.0, sb: 1.9 }.freeze
  PIT_WEIGHTS = { ip: 7.4, so: 2.0, h: -2.6, bb: -3.0, hr: -12.3 }.freeze

  class << self
    def call(refresh: false)
      cache_key = "ottoneu_insights"
      Rails.cache.delete(cache_key) if refresh

      Rails.cache.fetch(cache_key, expires_in: CACHE_TTL) { generate }
    rescue => e
      { error: e.message }
    end

    private

    def generate
      roster_data = OttoneuService.my_roster
      return roster_data if roster_data[:error]

      production  = OttoneuService.my_production
      matchups    = OttoneuService.current_matchups
      cap         = OttoneuService.cap_overview
      my_cap      = Array(cap).find { |t| t[:team_name].to_s.include?("Dingers") }
      players     = Array(roster_data[:players])
      return { factoids: [], featured_players: [], generated_at: Time.current.iso8601 } if players.empty?

      featured    = build_featured(players, production)
      salary_used = players.sum { |p| p[:salary].to_i }

      result = OpenAi::Client.new.json_completion(
        system_prompt: system_prompt,
        user_payload: {
          team_name:        roster_data[:team_name],
          cap_space:        my_cap&.dig(:cap_space),
          salary_used:      salary_used,
          current_matchups: Array(matchups[:matchups]).first(2),
          featured_players: featured
        },
        interaction_type: "ottoneu_insights",
        metadata: { team_id: OttoneuService.team_id, player_count: featured.size },
        temperature: 0.2
      )

      {
        factoids:         normalize_factoids(result[:output]),
        featured_players: featured,
        cap_space:        my_cap&.dig(:cap_space),
        salary_used:      salary_used,
        generated_at:     Time.current.iso8601
      }
    end

    def build_featured(players, production)
      mlb_players = players.reject { |p| p[:mlb_team].to_s.match?(/aaa|aa|a\+|a-|rk/i) }
      sorted      = mlb_players.sort_by { |p| -p[:salary].to_i }
      mlb         = MlbApiService.new

      sorted.first(MAX_PLAYERS).map do |player|
        prod     = production.is_a?(Hash) ? (production[player[:name]] || {}) : {}
        mlb_id   = resolve_mlb_id(mlb, player)
        group    = pitcher?(player) ? "pitching" : "hitting"
        game_log = mlb_id ? mlb.player_game_log(mlb_id, Date.current.year, group: group, limit: 5) : nil
        games    = Array(game_log&.dig(:games)).first(5)

        entry = {
          name:           player[:name],
          mlb_team:       player[:mlb_team],
          positions:      player[:positions],
          salary:         player[:salary],
          season_points:  prod[:season_points],
          pts_per_game:   prod[:pts_per_game],
          recent_games:   games.map { |g| annotate_game(g, group) }
        }

        if pitcher?(player) && mlb_id
          entry[:upcoming_start] = upcoming_start(mlb, mlb_id)
        end

        entry.compact
      end
    end

    # Annotate a game log entry with computed FG Points (approximate — missing
    # 2B/3B for batters, HBP/SV/HLD for pitchers since game_log omits them).
    def annotate_game(game, group)
      fg_pts = group == "pitching" ? compute_pitcher_pts(game) : compute_batter_pts(game)
      game.slice(:date, :opponent, :ab, :h, :hr, :rbi, :bb, :so, :sb, :ops,
                 :ip, :er, :whip).merge(fg_pts: fg_pts)
    end

    def compute_batter_pts(g)
      pts = (g[:ab].to_i * HIT_WEIGHTS[:ab]) +
            (g[:h].to_i  * HIT_WEIGHTS[:h])  +
            (g[:hr].to_i * HIT_WEIGHTS[:hr]) +
            (g[:bb].to_i * HIT_WEIGHTS[:bb]) +
            (g[:sb].to_i * HIT_WEIGHTS[:sb])
      pts.round(1)
    end

    def compute_pitcher_pts(g)
      pts = (parse_ip(g[:ip]) * PIT_WEIGHTS[:ip]) +
            (g[:so].to_i * PIT_WEIGHTS[:so]) +
            (g[:h].to_i  * PIT_WEIGHTS[:h])  +
            (g[:bb].to_i * PIT_WEIGHTS[:bb]) +
            (g[:hr].to_i * PIT_WEIGHTS[:hr])
      pts.round(1)
    end

    # "6.1" → 6.333, "6.2" → 6.667 (baseball innings notation)
    def parse_ip(ip_str)
      return 0.0 if ip_str.nil?
      full, partial = ip_str.to_s.split(".").map(&:to_i)
      full.to_f + (partial.to_i / 3.0)
    end

    # Check next 7 days of schedule for a probable start assignment
    def upcoming_start(mlb, mlb_id)
      mlb_id_int = mlb_id.to_i
      (1..7).each do |i|
        date = (Date.current + i).iso8601
        schedule_data = mlb.schedule(date)
        next unless schedule_data.is_a?(Hash)

        Array(schedule_data[:games]).each do |game|
          away_id = game.dig(:awayProbable, :id)
          home_id = game.dig(:homeProbable, :id)
          next unless away_id == mlb_id_int || home_id == mlb_id_int

          is_home  = home_id == mlb_id_int
          opponent = is_home ? game.dig(:away, :abbreviation) : game.dig(:home, :abbreviation)
          return { date: date, opponent: opponent, home_away: is_home ? "home" : "away" }
        end
      rescue => e
        Rails.logger.warn("OttoneuInsightsService upcoming_start #{mlb_id} #{date}: #{e.message}")
        next
      end

      nil
    end

    def resolve_mlb_id(mlb, player)
      results = mlb.search_players(player[:name].to_s, limit: 10)
      return nil unless results.is_a?(Array)

      name      = normalize(player[:name])
      team_abbr = normalize(player[:mlb_team].to_s.split.first)

      exact = results.select { |r| normalize(r[:name]) == name }
      match = exact.find { |r| normalize(r[:team]).include?(team_abbr) }
      (match || exact.first)&.dig(:id)
    rescue => e
      Rails.logger.warn("OttoneuInsightsService resolve_mlb_id #{player[:name]}: #{e.message}")
      nil
    end

    def pitcher?(player)
      PITCHER_POSITIONS.any? { |pos| player[:positions].to_s.include?(pos) }
    end

    def normalize(value)
      value.to_s.strip.downcase
    end

    def normalize_factoids(output)
      Array(output["factoids"] || output[:factoids]).map(&:to_s).map(&:strip).reject(&:blank?).first(6)
    end

    def system_prompt
      <<~PROMPT
        You are a sharp Ottoneu fantasy baseball analyst. Return only valid JSON: { "factoids": ["string", ...] }.

        Scoring: H2H FanGraphs Points.
        Hitting: AB -1.0 · H +5.6 · 2B +2.9 · 3B +5.7 · HR +9.4 · BB +3.0 · HBP +3.0 · SB +1.9 · CS -2.8
        Pitching: IP +7.4 · K +2.0 · H -2.6 · BB -3.0 · HBP -3.0 · HR -12.3 · SV +5.0 · HLD +4.0

        Strategic implications: OBP is heavily rewarded (walks net +2.0 above AB penalty). HR is the highest-value single event. SP workhorses accumulate huge IP value. Homers allowed are crippling (-12.3). Holds (4.0) make setup men nearly as valuable as closers.

        THE MOST IMPORTANT PRINCIPLE IN OTTONEU IS VALUE. Value = production relative to salary. A $3 player scoring 15 pts/game is infinitely more valuable than a $35 player scoring 20 pts/game. Always frame insights around salary efficiency — flag overpaid players underperforming their contract and underpaid studs punching above their salary.

        Value metrics — know these cold:
        - PPD (Points Per Dollar) = approx_fg_pts ÷ salary. Fair value baseline is 10.0 PPD. Elite: >20 PPD. Good: >15 PPD. Fair: ~10 PPD. Poor: <5 PPD. A player at 20 PPD is producing twice the expected value for their salary.
        - Surplus = approx_fg_pts − (salary × 10). Positive surplus = underpriced (the player produces more than their salary implies). Negative surplus = overpaid (salary exceeds production value). Elite: >+$100. Good: >+$50. Fair: ±$20. Concern: <−$30. Cite the surplus dollar figure when relevant (e.g. "+$74 surplus" or "−$41 surplus").

        This team plays TWO matchups per week. You will receive both current week opponents and the team's cap space and salary used.

        Each featured player includes their salary, season FG Points totals, and recent game logs with fg_pts (approximate — excludes 2B/3B for batters, SV/HLD/HBP for pitchers). Pitchers include upcoming_start if scheduled in the next 7 days.

        Generate 4 to 6 concise roster insights.

        Rules:
        - Every factoid must mention the player by name.
        - Reference salary when a player's value story is about their contract (e.g. "at $4, X is returning elite value" or "$27 Y is a liability at current production").
        - Cite PPD or surplus when the data supports it — these are the clearest signals of value or overpay.
        - Reference fg_pts from recent games when relevant (note these are approximate).
        - Call out pitchers with an upcoming_start — note the date and opponent.
        - Note both matchup opponents when a player has outsized leverage for the week.
        - Prioritize: value/salary efficiency (PPD/surplus), hot/cold streaks, high-leverage starts, injury/rest risk.
        - Keep each factoid to one sentence.
        - Write for a serious Ottoneu manager who lives and dies by salary efficiency.
      PROMPT
    end
  end
end
