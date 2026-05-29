class OttoneuTradeAnalysisService
  CACHE_TTL = 30.minutes

  class << self
    # give / receive — arrays of fg_ids being permanently swapped.
    # loan_out_amount / loan_in_amount — cash loan dollar amounts (Ottoneu cash loans).
    def call(give:, receive:, loan_out_amount: 0, loan_in_amount: 0)
      give    = clean(give)
      receive = clean(receive)
      return { error: "Both sides of the trade must have at least one player" } if give.empty? || receive.empty?

      loan_out_amount = loan_out_amount.to_i
      loan_in_amount  = loan_in_amount.to_i

      key = "#{give.sort.join(",")}::#{receive.sort.join(",")}::#{loan_out_amount}::#{loan_in_amount}"
      Rails.cache.fetch("ottoneu_trade_analysis:#{key}", expires_in: CACHE_TTL) do
        generate(give: give, receive: receive, loan_out_amount: loan_out_amount, loan_in_amount: loan_in_amount)
      end
    rescue => e
      { error: e.message }
    end

    private

    def clean(arr) = Array(arr).map(&:to_s).reject(&:blank?)

    def fetch_stats(identifiers)
      ids   = identifiers.select { |x| x.match?(/\A\d+\z/) }
      names = identifiers.reject { |x| x.match?(/\A\d+\z/) }
      stats = []
      stats += OttoneuPlayerStatsService.fetch(fg_ids: ids)  if ids.any?
      stats += OttoneuPlayerStatsService.fetch(names: names) if names.any?

      # Fall back to minor_leaguers table for any name with no MLB stats row.
      found_names = stats.map { |s| s[:name].to_s.downcase }.to_set
      missing     = names.reject { |n| found_names.include?(n.downcase) }
      if missing.any? && Warehouse::Manager.table_columns("minor_leaguers").any?
        quoted = missing.map { |n| "'#{n.gsub("'", "''")}'" }.join(", ")
        result = Sandbox::QueryService.run(sql: "SELECT * FROM minor_leaguers WHERE name IN (#{quoted})", limit: missing.size + 5)
        cols   = result[:columns] || []
        milb   = Array(result[:rows]).map { |row| cols.zip(row).to_h.transform_keys(&:to_sym) }
        milb.each do |r|
          pts = r[:group].to_s == "pitcher" ? approx_pitcher_pts(r) : approx_batter_pts(r)
          stats << r.merge(group: "minor_leaguer", approx_fg_pts: pts, fg_id: nil)
        end
      end

      stats
    end

    def fetch_prospect_data(names)
      board_path = Rails.root.join("data", "prospects", "board.json")
      return {} unless board_path.exist?

      board = JSON.parse(File.read(board_path))
      names.each_with_object({}) do |name, memo|
        prospect = board.find { |p| p["name"].to_s.downcase.strip == name.downcase.strip }
        next unless prospect
        memo[name.downcase] = {
          rank:     prospect["rank"],
          fv:       prospect["fv"],
          eta:      prospect["eta"],
          level:    prospect["level"],
          org:      prospect["team"],
          risk:     prospect["risk"],
          tldr:     prospect["tldr"],
          tools:    prospect["tools"]
        }.compact
      end
    rescue => e
      Rails.logger.warn("OttoneuTradeAnalysisService#fetch_prospect_data: #{e.message}")
      {}
    end

    def approx_batter_pts(r)
      ab = r[:ab].to_f; return nil if ab.zero?
      (ab * -1.0 + r[:h].to_f * 5.6 + r[:doubles].to_f * 2.9 + r[:hr].to_f * 9.4 +
       r[:bb].to_f * 3.0 + r[:sb].to_f * 1.9 + r[:cs].to_f * -2.8).round(1)
    end

    def approx_pitcher_pts(r)
      ip = r[:ip].to_f; return nil if ip.zero?
      (ip * 7.4 + r[:k].to_f * 2.0 + r[:h].to_f * -2.6 + r[:bb].to_f * -3.0 +
       r[:hr].to_f * -12.3 + r[:sv].to_f * 5.0).round(1)
    end

    def generate(give:, receive:, loan_out_amount:, loan_in_amount:)
      all         = (give + receive).uniq
      stats       = fetch_stats(all)
      all_fg_ids  = stats.map { |s| s[:fg_id].to_s }.compact.uniq
      projections = OttoneuPlayerStatsService.fetch_projections(fg_ids: all_fg_ids)
      salary_map  = build_salary_map
      fair_ppd    = OttoneuLeagueStatsService.fair_ppd

      # Prospect context for any minor leaguers in the trade.
      minor_names  = stats.select { |s| s[:group].to_s == "minor_leaguer" }.map { |s| s[:name].to_s }
      prospect_map = fetch_prospect_data(minor_names)

      give_players = enrich(give,    stats, projections, salary_map, fair_ppd, prospect_map)
      recv_players = enrich(receive, stats, projections, salary_map, fair_ppd, prospect_map)

      payload = { give: give_players, receive: recv_players }
      payload[:loan_out_amount] = loan_out_amount if loan_out_amount > 0
      payload[:loan_in_amount]  = loan_in_amount  if loan_in_amount  > 0

      has_loans = loan_out_amount > 0 || loan_in_amount > 0
      result = OpenAi::Client.new.json_completion(
        system_prompt: system_prompt(has_loans: has_loans),
        user_payload:  payload,
        interaction_type: "ottoneu_trade_analysis",
        temperature: 0.3
      )

      { analysis: result[:output]["analysis"].to_s.strip, generated_at: Time.current.iso8601 }
    end

    def build_salary_map
      map = {}
      Array(OttoneuService.all_rosters).each do |team|
        Array(team[:players]).each do |p|
          entry = { salary: p[:salary].to_i, roster_team: team[:team_name], positions: p[:positions] }
          if p[:fg_id].present?
            map[p[:fg_id].to_s] = entry
          elsif p[:fg_minor_id].present?
            map[p[:fg_minor_id].to_s] = entry
          end
        end
      end
      map
    end

    def enrich(identifiers, stats, projections, salary_map, fair_ppd, prospect_map = {})
      sf = season_frac
      identifiers.map do |id|
        s = if id.match?(/\A\d+\z/)
          stats.find { |x| x[:fg_id].to_s == id } || {}
        else
          stats.find { |x| x[:name].to_s.downcase == id.downcase } || {}
        end

        is_minor = s[:group].to_s == "minor_leaguer"
        roster   = if is_minor
          # salary_map is keyed by fg_minor_id; find via name match on all_rosters.
          found_team = Array(OttoneuService.all_rosters).each do |team|
            p = team[:players].find { |p| p[:name].to_s.downcase == s[:name].to_s.downcase }
            break({ salary: p[:salary], roster_team: team[:team_name], positions: p[:positions] }) if p
          end
          found_team.is_a?(Hash) ? found_team : {}
        else
          salary_map[s[:fg_id].to_s] || {}
        end

        salary  = roster[:salary]
        pts     = s[:approx_fg_pts]
        paced   = (pts && sf > 0) ? (pts / sf) : pts
        ppd     = (!is_minor && paced && salary && salary > 0) ? (paced / salary.to_f).round(2) : nil
        surplus = (!is_minor && paced && salary)               ? (paced / fair_ppd - salary).round(1) : nil
        j       = projections.find { |x| x[:fg_id].to_s == s[:fg_id].to_s }
        vs_proj = compute_vs_projection(s, j)

        row = s.merge(
          salary:        salary,
          roster_team:   roster[:roster_team],
          positions:     roster[:positions],
          ppd:           ppd,
          surplus:       surplus,
          projected_pts: j&.dig(:projected_pts),
          vs_projection: vs_proj
        )

        if is_minor
          prospect = prospect_map[s[:name].to_s.downcase]
          row = row.merge(prospect_context: prospect) if prospect
        end

        row
      end
    end

    def season_frac
      start_date = Date.new(Date.today.year, 3, 28)
      end_date   = Date.new(Date.today.year, 10, 1)
      elapsed    = [Date.today - start_date, 1].max.to_f
      total      = (end_date - start_date).to_f
      [elapsed / total, 1.0].min
    end

    def compute_vs_projection(s, proj)
      return nil unless proj && s[:approx_fg_pts]
      if s[:group] == "batter"
        actual_pa = s[:ab].to_f + s[:bb].to_f
        proj_pa   = proj[:proj_pa].to_f
        return nil unless actual_pa > 0 && proj_pa > 0
        ((s[:approx_fg_pts] / actual_pa * proj_pa) - proj[:projected_pts]).round(1)
      else
        actual_ip = s[:ip].to_f
        proj_ip   = proj[:proj_ip].to_f
        return nil unless actual_ip > 0 && proj_ip > 0
        ((s[:approx_fg_pts] / actual_ip * proj_ip) - proj[:projected_pts]).round(1)
      end
    end

    def system_prompt(has_loans: false)
      fair = OttoneuLeagueStatsService.fair_ppd.round(1)
      loan_section = has_loans ? <<~LOANS : ""

        This trade also includes Ottoneu cash loan clauses:
        - loan_out_amount: dollars you are temporarily sending to the other team (reduces your effective cap cost this season).
        - loan_in_amount: dollars you are temporarily receiving from the other team (increases your effective cap cost).
        Net cash impact = loan_in_amount − loan_out_amount. Positive means you net receive cash; negative means you net send cash.
        Factor this short-term cap adjustment into your salary-impact and recommendation points.
      LOANS

      <<~PROMPT
        You are a sharp Ottoneu fantasy baseball analyst. Return only valid JSON: { "analysis": "string" }.

        Scoring: H2H FanGraphs Points.
        Hitting: AB -1.0 · H +5.6 · 2B +2.9 · 3B +5.7 · HR +9.4 · BB +3.0 · HBP +3.0 · SB +1.9 · CS -2.8
        Pitching: IP +7.4 · K +2.0 · H -2.6 · BB -3.0 · HBP -3.0 · HR -12.3 · SV +5.0 · HLD +4.0

        You are analyzing a trade from the perspective of Dingers and Dugouts (D&D), the user's team.
        GIVE = players D&D is sending away. RECEIVE = players D&D is getting back.
        Always frame analysis as "you" — never as a neutral third party.#{loan_section}

        Each MLB player includes: name, group (batter/pitcher), salary, approx_fg_pts (season total so far),
        ppd (paced pts÷salary — paced to full season so fair=#{fair} [derived from actual league data], good=15+, elite=20+),
        surplus (paced pts÷#{fair} − salary — positive=underpriced, both are already paced),
        projected_pts (full-season Steamer projection), vs_projection (pace vs projection — positive=outperforming).

        FG pts are the verdict. Traditional stats (wOBA, FIP, K%) explain why a player scores what they score — use them to support the pts/PPD/surplus argument, not replace it.

        **Minor leaguers (group: "minor_leaguer"):** These are prospect stash assets — they score 0 current FG pts and have no PPD/surplus. Value them on prospect merit, not production:
        - prospect_context.fv: Future Value grade (20–80 scale). 50 = solid regular. 55 = above-average starter. 60+ = star potential.
        - prospect_context.rank: Overall prospect board rank. Top 50 is elite. Top 100 is real value.
        - prospect_context.eta: Expected MLB debut year.
        - prospect_context.tldr: Scouting summary — use this to explain the player's profile.
        - prospect_context.tools: Hit/power/run/field/arm grades (current / future). Future power grade drives long-term FG pts ceiling.
        - milb_stats (avg, obp, slg, hr, sb, level): Current MiLB performance. Strong stats at AA/AAA accelerate the timeline.
        When one side has a prospect, frame the trade as "immediate production vs. future upside" — cite FV, rank, ETA, and salary explicitly. A $1–2 prospect with FV 55+ is real value even if they score 0 today.

        Analysis structure (4–6 sentences, under 200 words):
        1. Verdict: do YOU win or lose this trade — cite pts totals and salary totals for what you give vs. what you get.
        2. Value: compare PPD and surplus on your side. Are you giving up more value per dollar than you're gaining?
        3. Projection context: flag any players meaningfully over- or underperforming their projection. Does the gap suggest regression?
        4. Salary impact: net salary change for you (+/− means more/less cap) and what that means for flexibility.
        5. Recommendation: should YOU make this trade, and what adjustment would make it equitable for your team?

        Be direct. Say "you win", "you lose", "accept", "decline". Name players. Cite specific numbers. No hedging.
      PROMPT
    end
  end
end
