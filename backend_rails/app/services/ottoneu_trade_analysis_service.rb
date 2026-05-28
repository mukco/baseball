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
      stats += OttoneuPlayerStatsService.fetch(fg_ids: ids)   if ids.any?
      stats += OttoneuPlayerStatsService.fetch(names: names)  if names.any?
      stats
    end

    def generate(give:, receive:, loan_out_amount:, loan_in_amount:)
      all         = (give + receive).uniq
      stats       = fetch_stats(all)
      all_fg_ids  = stats.map { |s| s[:fg_id].to_s }.compact.uniq
      projections = OttoneuPlayerStatsService.fetch_projections(fg_ids: all_fg_ids)
      salary_map  = build_salary_map
      fair_ppd    = OttoneuLeagueStatsService.fair_ppd

      give_players = enrich(give,    stats, projections, salary_map, fair_ppd)
      recv_players = enrich(receive, stats, projections, salary_map, fair_ppd)

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
          next if p[:fg_id].blank?
          map[p[:fg_id].to_s] = {
            salary:      p[:salary].to_i,
            roster_team: team[:team_name],
            positions:   p[:positions]
          }
        end
      end
      map
    end

    def enrich(identifiers, stats, projections, salary_map, fair_ppd)
      sf = season_frac
      identifiers.map do |id|
        s = if id.match?(/\A\d+\z/)
          stats.find { |x| x[:fg_id].to_s == id } || {}
        else
          stats.find { |x| x[:name].to_s.downcase == id.downcase } || {}
        end
        j      = projections.find { |x| x[:fg_id].to_s == s[:fg_id].to_s }
        roster = salary_map[s[:fg_id].to_s] || {}
        salary = roster[:salary]
        pts    = s[:approx_fg_pts]
        paced  = (pts && sf > 0) ? (pts / sf) : pts
        ppd     = (paced && salary && salary > 0) ? (paced / salary.to_f).round(2) : nil
        surplus = (paced && salary)               ? (paced / fair_ppd - salary).round(1) : nil
        vs_proj = compute_vs_projection(s, j)

        s.merge(
          salary:        salary,
          roster_team:   roster[:roster_team],
          positions:     roster[:positions],
          ppd:           ppd,
          surplus:       surplus,
          projected_pts: j&.dig(:projected_pts),
          vs_projection: vs_proj
        )
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

        Each player includes: name, group (batter/pitcher), salary, approx_fg_pts (season total so far),
        ppd (paced pts÷salary — paced to full season so fair=#{fair} [derived from actual league data], good=15+, elite=20+),
        surplus (paced pts÷#{fair} − salary — positive=underpriced, both are already paced),
        projected_pts (full-season Steamer projection), vs_projection (pace vs projection — positive=outperforming).

        FG pts are the verdict. Traditional stats (wOBA, FIP, K%) explain why a player scores what they score — use them to support the pts/PPD/surplus argument, not replace it.

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
