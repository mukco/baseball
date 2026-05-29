class OttoneuPlayerAnalysisService
  CACHE_TTL    = 60.minutes
  MY_TEAM_NAME = "Dingers".freeze

  PROJ_BATTER_COLS  = "pa, hr, r, rbi, sb, avg, obp, slg, ops, woba, wrc_plus, war".freeze
  PROJ_PITCHER_COLS = "gs, sv, ip, k, bb, hr, era, fip, war".freeze

  class << self
    def call(fg_id: nil, player_id: nil, name: nil)
      identifier = fg_id.presence || player_id.presence || name.presence
      return { error: "fg_id, player_id, or name required" } unless identifier

      cache_key = "ottoneu_player_analysis_#{[fg_id, player_id, name].compact.join('_').parameterize}"
      Rails.cache.fetch(cache_key, expires_in: CACHE_TTL) { generate(fg_id: fg_id, player_id: player_id, name: name) }
    rescue => e
      { error: e.message }
    end

    private

    def generate(fg_id:, player_id:, name:)
      roster_entry, owner_team = find_in_all_rosters(fg_id: fg_id, name: name)
      fg_minor_id = roster_entry&.dig(:fg_minor_id)

      stats = OttoneuPlayerStatsService.fetch(
        fg_ids:       [fg_id].compact.reject(&:blank?),
        player_ids:   [player_id].compact.reject(&:blank?),
        fg_minor_ids: (fg_id.blank? && player_id.blank? && fg_minor_id.present?) ? [fg_minor_id] : [],
        names:        (fg_id.blank? && player_id.blank? && fg_minor_id.blank?) ? [name].compact : []
      ).first
      on_my_team = owner_team.to_s.include?(MY_TEAM_NAME)

      cap    = on_my_team ? OttoneuService.cap_overview : nil
      my_cap = Array(cap).find { |t| t[:team_name].to_s.include?(MY_TEAM_NAME) }
      il_info = roster_entry ? il_info_for_player(roster_entry) : {}

      fair_ppd = OttoneuLeagueStatsService.fair_ppd
      salary  = roster_entry&.dig(:salary)
      pts     = stats&.dig(:approx_fg_pts)
      sf      = season_frac
      paced   = (pts && sf > 0) ? (pts / sf) : pts
      ppd     = (paced && salary && salary > 0) ? (paced / salary.to_f).round(2) : nil
      surplus = (paced && salary)               ? (paced / fair_ppd - salary).round(1) : nil

      resolved_fg_id = stats&.dig(:fg_id)&.to_s || fg_id
      projection     = fetch_projection(resolved_fg_id, stats&.dig(:group))
      statcast       = fetch_statcast(stats&.dig(:player_id), stats&.dig(:group))

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
          statcast:    statcast,
          ppd:         ppd,
          ppd_plus:    ppd ? (ppd / fair_ppd * 100).round(0) : nil,
          surplus:     surplus,
          paced_pts:   paced&.round(1),
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
        ppd_plus:      ppd ? (ppd / fair_ppd * 100).round(0) : nil,
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

    def fetch_statcast(player_id, group)
      return nil unless player_id.to_i > 0

      raw = group == "pitcher" \
        ? StatcastService.pitcher(player_id.to_i, current_season)
        : StatcastService.batter(player_id.to_i, current_season)

      summary = raw&.dig(:summary)
      return nil if summary.blank? || raw[:error]

      summary.slice(
        :avgExitVelo, :hardHitPct, :barrelPct,
        :xBA, :xwOBA, :batSpeed, :avgLaunchAngle,
        :avgFastballVelo, :oSwingPct, :zSwingPct
      ).compact
    rescue => e
      Rails.logger.warn("OttoneuPlayerAnalysisService statcast #{player_id}: #{e.message}")
      nil
    end

    def current_season
      Date.today.year
    end

    def season_frac
      start_date = Date.new(Date.today.year, 3, 28)
      end_date   = Date.new(Date.today.year, 10, 1)
      elapsed    = [Date.today - start_date, 1].max.to_f
      total      = (end_date - start_date).to_f
      [elapsed / total, 1.0].min
    end

    def system_prompt
      fair = OttoneuLeagueStatsService.fair_ppd.round(1)
      <<~PROMPT
        You are a sharp Ottoneu fantasy baseball analyst. Return only valid JSON: { "analysis": "string" }.

        Scoring: H2H FanGraphs Points.
        Hitting: AB -1.0 · H +5.6 · 2B +2.9 · 3B +5.7 · HR +9.4 · BB +3.0 · HBP +3.0 · SB +1.9 · CS -2.8
        Pitching: IP +7.4 · K +2.0 · H -2.6 · BB -3.0 · HBP -3.0 · HR -12.3 · SV +5.0 · HLD +4.0

        THE CORE PRINCIPLE: Salary efficiency. Value = production per dollar of salary.

        Value metrics — all pre-computed, use them directly. Do NOT recompute anything from raw stats:
        - paced_pts: full-season pace projection from season-to-date pts. When negative, the player is actively hurting your score.
        - ppd_plus: normalized value index (like wRC+). 100 = exactly fair value. 150 = 50% above fair value. 50 = half fair value. Use this to judge over/underpaid.
        - surplus: dollar value above/below fair value. Positive = underpriced. Negative = overpaid. This is the clearest signal — cite it.
        - ppd: raw points per dollar (paced_pts ÷ salary). Cite only as supporting detail; ppd_plus and surplus are the primary signals.

        Ownership context — roster_team tells you who owns this player. Use it to frame the entire analysis:

        1. roster_team includes "Dingers" → THIS IS THE USER'S OWN PLAYER.
           The user already knows they own them. DO NOT say "you own X" or "X is on your roster."
           Analysis = keep / cut / trade decision. Open with the value verdict using this logic:
           - If paced_pts > 0: "At $[salary], [name] is on a [paced_pts] pt pace ([ppd_plus] PPD+, [+/-$surplus] surplus)."
           - If paced_pts ≤ 0: "At $[salary], [name] is producing negative pts ([paced_pts] pt pace) — a net drag on your score."
           Never reference a "fair-value salary threshold" when paced_pts is zero or negative — it produces meaningless numbers.
           Then: should they hold, trade, or cut? Why?

        2. roster_team is a different team name → OWNED BY AN OPPONENT.
           This is a trade target or a player to monitor. Tell the user: "[Name] is owned by [team] at $[salary]."
           Assess trade value: is that team likely a buyer or seller? What would a fair return look like?
           Frame as: could you acquire them, and would their salary be worth it at that cap cost?

        3. roster_team is null → FREE AGENT.
           The user is scouting an unrostered player. Frame as acquisition advice: bid target, likely auction price range, or waiver priority.
           Estimate realistic bid cost and projected PPD/surplus at that price.

        Statcast context — when statcast data is present, use it to distinguish luck from skill:
        - avgExitVelo: MLB avg ~88 mph. Below 85 is weak contact. Above 91 is hard contact.
        - hardHitPct: MLB avg ~38%. Below 30% is concerning. Above 45% is elite.
        - barrelPct: MLB avg ~8%. Below 4% limits HR upside. Above 12% is elite power.
        - xBA / xwOBA: compare to actual AVG / wOBA. Large positive gap (xwOBA - wOBA > .020) = unlucky, likely to improve. Large negative gap = lucky, likely to regress.
        - batSpeed: MLB avg ~71 mph. Below 68 is below average. Above 74 is elite.
        - avgFastballVelo (pitchers): declining velo is a red flag.
        - Use Statcast to explain whether poor results are BABIP luck or real contact quality issues.

        Projection context — when projection data is present, compare season-to-date to the full-season Steamer projection:
        - For batters: is wOBA/OPS/wRC+ on track vs projection? Are actual PA far below projected PA (missed time)?
        - For pitchers: is ERA/FIP on track? Is IP pace below projection (IL stint, bullpen move, workload limit)?
        - Flag meaningful divergence: wOBA off by .030+, ERA off by 0.80+, or PA/IP under 60% of projected pace.
        - Distinguish: "playing as projected" vs "underperforming projection" vs "injury-limited" vs "Statcast suggests real regression/improvement coming."

        IL context: if on_mlb_il is true, always note the injury. For your player: stash if projection is strong; cut if it isn't.
        cap_space is only provided when the player is on Dingers — use it to frame cut/add decisions ("with $X cap space, you can...").

        Structure: 3-4 direct, opinionated sentences.
        1. Lead with the Ottoneu verdict (paced pts, PPD+, surplus).
        2. Explain the traditional stat drivers (what's generating or killing FG pts).
        3. Use Statcast to answer: is this real or luck? (xwOBA vs wOBA, barrel rate, exit velo, bat speed if available).
        4. Close with a clear recommendation: hold / cut / trade / stash. Cite cap context if available.
        Target 100-150 words. Be specific — cite actual numbers. No hedging, no fluff.
      PROMPT
    end
  end
end
