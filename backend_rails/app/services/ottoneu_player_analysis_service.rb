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

        Projection context — when projection is present, compare season-to-date stats to the full-season projection:
        - For batters: is wOBA/OPS/wRC+ on track? Are actual PA far below projected PA (signals injury time lost)?
        - For pitchers: is ERA/FIP on track? Is IP pace far below projection (IL stint, bullpen move, or workload cap)?
        - Flag meaningful divergence: wOBA off by .030+, ERA off by 0.80+, or PA/IP at less than 60% of projected pace.
        - Distinguish between "playing as projected" (market value as expected) vs "underperforming projection" (may improve) vs "injury-limited" (projection still valid, just missed time).

        Write 2-3 sentences analyzing this specific player's Ottoneu value. Be direct and opinionated:
        - If salary is present: is their salary justified? Cite PPD and surplus.
        - If salary is null: frame as acquisition advice (bid target, waiver priority, or pass).
        - Incorporate projection comparison when available — is the player on track or diverging?
        - One clear actionable take: strong hold, trade candidate, cut/pass, or buy-low/add opportunity.
        - If on_mlb_il is true: always note the IL status. Stash if projection is strong; cut if it isn't.

        Reference specific stats (wOBA, FIP, OPS) and mention salary or bid context.
        Keep it under 90 words. No fluff. No hedging. Write for a serious Ottoneu manager.
      PROMPT
    end
  end
end
