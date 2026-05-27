class OttoneuPlayerAnalysisService
  CACHE_TTL    = 60.minutes
  MY_TEAM_NAME = "Dingers".freeze
  FAIR_PPD     = 10.0

  PROJ_BATTER_COLS  = "pa, hr, r, rbi, sb, avg, obp, slg, ops, woba, wrc_plus, war".freeze
  PROJ_PITCHER_COLS = "gs, sv, ip, k, bb, hr, era, fip, war".freeze

  class << self
    def call(fg_id: nil, name: nil)
      identifier = fg_id.presence || name.presence
      return { error: "fg_id or name required" } unless identifier

      cache_key = "ottoneu_player_analysis_#{identifier.to_s.parameterize}"
      Rails.cache.fetch(cache_key, expires_in: CACHE_TTL) { generate(fg_id: fg_id, name: name) }
    rescue => e
      { error: e.message }
    end

    private

    def generate(fg_id:, name:)
      stats = OttoneuPlayerStatsService.fetch(
        fg_ids: [fg_id].compact.reject(&:blank?),
        names:  fg_id.present? ? [] : [name].compact
      ).first

      roster_entry, owner_team = find_in_all_rosters(fg_id: fg_id, name: name)
      on_my_team = owner_team.to_s.include?(MY_TEAM_NAME)

      cap    = on_my_team ? OttoneuService.cap_overview : nil
      my_cap = Array(cap).find { |t| t[:team_name].to_s.include?(MY_TEAM_NAME) }
      il_info = roster_entry ? il_info_for_player(roster_entry) : {}

      salary  = roster_entry&.dig(:salary)
      pts     = stats&.dig(:approx_fg_pts)
      ppd     = (pts && salary && salary > 0) ? (pts / salary.to_f).round(2) : nil
      surplus = (pts && salary)               ? (pts - salary * FAIR_PPD).round(1) : nil

      resolved_fg_id = stats&.dig(:fg_id)&.to_s || fg_id
      projection     = fetch_projection(resolved_fg_id, stats&.dig(:group))

      result = OpenAi::Client.new.json_completion(
        system_prompt: system_prompt,
        user_payload: {
          player_name: name || roster_entry&.dig(:name),
          salary:      salary,
          roster_team: owner_team,
          positions:   roster_entry&.dig(:positions),
          mlb_team:    roster_entry&.dig(:mlb_team),
          cap_space:   my_cap&.dig(:cap_space),
          on_mlb_il:   il_info[:mlb_il] || false,
          il_status:   il_info[:mlb_il_desc],
          stats:       stats,
          projection:  projection
        },
        interaction_type: "ottoneu_player_analysis",
        temperature: 0.3
      )

      {
        analysis:      result[:output]["analysis"].to_s.strip,
        roster_team:   owner_team,
        salary:        salary,
        approx_fg_pts: pts,
        ppd:           ppd,
        surplus:       surplus,
        group:         stats&.dig(:group),
        on_my_team:    on_my_team,
        on_il:         il_info[:mlb_il] || false,
        generated_at:  Time.current.iso8601
      }
    end

    def find_in_all_rosters(fg_id:, name:)
      rosters = OttoneuService.all_rosters
      return [nil, nil] if rosters.is_a?(Hash) && rosters[:error]

      Array(rosters).each do |team|
        found = Array(team[:players]).find do |p|
          (fg_id.present? && p[:fg_id].to_s == fg_id.to_s) ||
            p[:name].to_s.downcase.strip == name.to_s.downcase.strip
        end
        return [found, team[:team_name]] if found
      end

      [nil, nil]
    end

    def il_info_for_player(roster_entry)
      abbr    = roster_entry[:mlb_team].to_s
      team_id = OttoneuService::FG_TO_MLB_TEAM_ID[abbr]
      return {} unless team_id

      statuses = MlbApiService.new.team_roster_statuses(team_id)
      entry    = statuses.dig(:by_name, roster_entry[:name].to_s.downcase.strip)
      return {} unless entry

      {
        mlb_il:      OttoneuService::MLB_IL_CODES.include?(entry[:code]),
        mlb_il_desc: entry[:desc].presence
      }
    rescue => e
      Rails.logger.warn("OttoneuPlayerAnalysisService IL lookup #{roster_entry[:name]}: #{e.message}")
      {}
    end

    def fetch_projection(fg_id, group)
      return nil unless fg_id.present? && Warehouse::Manager.exists?

      table  = group == "pitcher" ? "fg_projections_pitching" : "fg_projections_batting"
      cols   = group == "pitcher" ? PROJ_PITCHER_COLS : PROJ_BATTER_COLS
      quoted = "'#{fg_id.to_s.gsub("'", "''")}'"
      sql    = "SELECT #{cols} FROM #{table} WHERE season = #{current_season} AND CAST(fg_id AS VARCHAR) = #{quoted} LIMIT 1"

      result    = Sandbox::QueryService.run(sql: sql, limit: 1)
      row       = Array(result[:rows]).first
      return nil unless row

      cols_list = result[:columns] || []
      cols_list.zip(row).to_h.transform_keys(&:to_sym)
    rescue => e
      Rails.logger.warn("OttoneuPlayerAnalysisService projection lookup #{fg_id}: #{e.message}")
      nil
    end

    def current_season
      Date.today.year
    end

    def system_prompt
      <<~PROMPT
        You are a sharp Ottoneu fantasy baseball analyst. Return only valid JSON: { "analysis": "string" }.

        Scoring: H2H FanGraphs Points.
        Hitting: AB -1.0 · H +5.6 · 2B +2.9 · 3B +5.7 · HR +9.4 · BB +3.0 · HBP +3.0 · SB +1.9 · CS -2.8
        Pitching: IP +7.4 · K +2.0 · H -2.6 · BB -3.0 · HBP -3.0 · HR -12.3 · SV +5.0 · HLD +4.0

        THE CORE PRINCIPLE: Salary efficiency. Value = production per dollar of salary.

        Value metrics — apply these when data is available:
        - PPD (Points Per Dollar) = approx_fg_pts ÷ salary. Fair value baseline is 10.0 PPD. Elite: >20. Good: >15. Fair: ~10. Poor: <5.
        - Surplus = approx_fg_pts − (salary × 10). Positive = underpriced, negative = overpaid. Cite the dollar figure.
        - Fair value salary = approx_fg_pts ÷ 10. The max you should pay and break even.

        Ownership context — roster_team tells you who owns this player. Use it to frame the entire analysis:

        1. roster_team includes "Dingers" → THIS IS THE USER'S OWN PLAYER.
           The user already knows they own them. DO NOT say "you own X" or "X is on your roster."
           Analysis = keep / cut / trade decision. Open immediately with the value verdict:
           "At $[salary], [name] is producing [pts] pts (~[PPD] PPD) — [above/below] the $[fair_value] fair-value threshold."
           Then: should they hold, trade, or cut? Why?

        2. roster_team is a different team name → OWNED BY AN OPPONENT.
           This is a trade target or a player to monitor. Tell the user: "[Name] is owned by [team] at $[salary]."
           Assess trade value: is that team likely a buyer or seller? What would a fair return look like?
           Frame as: could you acquire them, and would their salary be worth it at that cap cost?

        3. roster_team is null → FREE AGENT.
           The user is scouting an unrostered player. Frame as acquisition advice: bid target, likely auction price range, or waiver priority.
           Estimate realistic bid cost and projected PPD/surplus at that price.

        Projection context — when projection data is present, compare season-to-date to the full-season Steamer projection:
        - For batters: is wOBA/OPS/wRC+ on track vs projection? Are actual PA far below projected PA (missed time)?
        - For pitchers: is ERA/FIP on track? Is IP pace below projection (IL stint, bullpen move, workload limit)?
        - Flag meaningful divergence: wOBA off by .030+, ERA off by 0.80+, or PA/IP under 60% of projected pace.
        - Distinguish: "playing as projected" vs "underperforming projection" (buy-low signal) vs "injury-limited" (projection still valid, just missed time).

        IL context: if on_mlb_il is true, always note the injury. For your player: stash if projection is strong; cut if it isn't.
        cap_space is only provided when the player is on Dingers — use it to frame cut/add decisions ("with $X cap space, you can...").

        Write 2-3 direct, opinionated sentences. Reference specific stats. Keep it under 90 words. No fluff. No hedging.
      PROMPT
    end
  end
end
