class OttoneuFreeAgentsService
  CACHE_TTL       = 60.minutes
  AI_CANDIDATES   = 8    # sent to OpenAI — keep small
  SQL_LIMIT       = 120  # per position from warehouse
  FAIR_PPD        = 10.0

  PROJ_BATTER_COLS  = "pa, hr, bb, sb, avg".freeze
  PROJ_PITCHER_COLS = "ip, k, bb, hr, sv, whip".freeze

  MINOR_LEVEL_PATTERN = "team LIKE '%AAA%' OR team LIKE '%AA%' OR team LIKE '%A+%' OR team LIKE '%A-%'".freeze

  class << self
    def call(refresh: false, include_minors: false)
      cache_key = include_minors ? "ottoneu_free_agents_all_v2" : "ottoneu_free_agents_v2"
      Rails.cache.delete(cache_key) if refresh
      Rails.cache.fetch(cache_key, expires_in: CACHE_TTL) { generate(include_minors: include_minors) }
    rescue => e
      { error: e.message }
    end

    private

    def generate(include_minors: false)
      rostered_fg_ids = collect_rostered_fg_ids
      my_roster       = OttoneuService.my_roster
      cap             = OttoneuService.cap_overview
      my_cap          = Array(cap).find { |t| t[:team_name].to_s.include?("Dingers") }
      waivers         = OttoneuService.waivers

      candidates     = warehouse_free_agents(rostered_fg_ids, include_minors: include_minors)
      waiver_players = Array(waivers[:active])

      mlb_candidates = candidates.select { |p| p[:level] == "MLB" }

      result = OpenAi::Client.new.json_completion(
        system_prompt: system_prompt,
        user_payload: {
          cap_space:              my_cap&.dig(:cap_space),
          roster_summary:         roster_summary(my_roster[:players]),
          free_agent_candidates:  mlb_candidates.first(AI_CANDIDATES),
          waiver_wire:            waiver_players
        },
        interaction_type: "ottoneu_free_agents",
        metadata: { candidate_count: candidates.size, waiver_count: waiver_players.size },
        temperature: 0.2
      )

      {
        players:        candidates,
        waiver_players: waiver_players,
        factoids:       normalize_factoids(result[:output]),
        cap_space:      my_cap&.dig(:cap_space),
        generated_at:   Time.current.iso8601
      }
    end

    def collect_rostered_fg_ids
      rosters = OttoneuService.all_rosters
      return Set.new if rosters.is_a?(Hash) && rosters[:error]

      Array(rosters)
        .flat_map { |team| team[:players] }
        .filter_map { |p| p[:fg_id].presence }
        .to_set
    end

    def warehouse_free_agents(rostered_fg_ids, include_minors: false)
      return [] unless Warehouse::Manager.exists?

      placeholders  = rostered_fg_ids.map { |id| "'#{id.to_s.gsub("'", "''")}'" }.join(", ")
      exclusion     = placeholders.present? ? "AND CAST(fg_id AS VARCHAR) NOT IN (#{placeholders})" : ""
      minor_filter  = include_minors ? "" : "AND NOT (#{MINOR_LEVEL_PATTERN})"

      bat_extra  = extra_cols("batters",  %w[doubles triples hbp cs])
      pit_extra  = extra_cols("pitchers", %w[hbp hld])

      batter_sql = <<~SQL
        SELECT CAST(fg_id AS VARCHAR) AS fg_id, player_id, name, team, position, season,
               avg, obp, ops, woba, wrc_plus, hr, bb_pct, ab, h, bb, sb, #{bat_extra}
        FROM batters
        WHERE season = #{current_season}
          AND fg_id IS NOT NULL
          #{minor_filter}
          #{exclusion}
        ORDER BY woba DESC NULLS LAST
        LIMIT #{SQL_LIMIT}
      SQL

      pitcher_sql = <<~SQL
        SELECT CAST(fg_id AS VARCHAR) AS fg_id, player_id, name, team, season,
               era, fip, whip, k_pct, k_per_9, ip, k, h, bb, hr, sv, #{pit_extra}
        FROM pitchers
        WHERE season = #{current_season}
          AND fg_id IS NOT NULL
          #{minor_filter}
          #{exclusion}
        ORDER BY fip ASC NULLS LAST
        LIMIT #{SQL_LIMIT}
      SQL

      batter_rows  = run_query(batter_sql).map  { |r| r.merge(approx_fg_pts: approx_batter_fg_pts(r)) }
      pitcher_rows = run_query(pitcher_sql).map { |r| r.merge(approx_fg_pts: approx_pitcher_fg_pts(r)) }

      batter_ids  = batter_rows.filter_map  { |r| r[:fg_id].to_s.presence }
      pitcher_ids = pitcher_rows.filter_map { |r| r[:fg_id].to_s.presence }
      projections = fetch_fa_projections(batter_ids, pitcher_ids)

      batter_rows  = batter_rows.map  { |r| enrich_with_projection(r, projections, :batter).merge(group: "batter") }
      pitcher_rows = pitcher_rows.map { |r| enrich_with_projection(r, projections, :pitcher).merge(group: "pitcher") }

      # Dedup: some players appear in both tables (two-way players, pinch-hit PAs).
      # Keep the entry with non-nil approx_fg_pts; prefer batter entry when both qualify.
      (batter_rows + pitcher_rows)
        .group_by { |r| r[:fg_id].presence || r[:name] }
        .map      { |_, entries| entries.find { |e| e[:approx_fg_pts] } || entries.first }
    rescue => e
      Rails.logger.warn("OttoneuFreeAgentsService warehouse query failed: #{e.message}")
      []
    end

    # Batch-fetch projections in two GROUP BY queries — one per projection table.
    # Uses GROUP BY instead of QUALIFY/ROW_NUMBER for broader DuckDB compatibility.
    # Returns hash keyed by fg_id string.
    def fetch_fa_projections(batter_ids, pitcher_ids)
      return {} unless Warehouse::Manager.exists?

      results = {}

      if batter_ids.any?
        quoted = batter_ids.map { |id| "'#{id.gsub("'", "''")}'" }.join(", ")
        sql = <<~SQL.squish
          SELECT CAST(fg_id AS VARCHAR) AS fg_id,
                 MAX(pa) AS pa, MAX(hr) AS hr, MAX(bb) AS bb, MAX(sb) AS sb, MAX(avg) AS avg
          FROM fg_projections_batting
          WHERE season = #{current_season}
            AND CAST(fg_id AS VARCHAR) IN (#{quoted})
          GROUP BY CAST(fg_id AS VARCHAR)
        SQL
        run_query(sql, batter_ids.size + 10).each do |r|
          ab  = r[:pa].to_f - r[:bb].to_f
          h   = r[:avg].to_f * ab
          pts = (ab * -1.0 + h * 5.6 + r[:hr].to_f * 9.4 + r[:bb].to_f * 3.0 + r[:sb].to_f * 1.9).round(1)
          results[r[:fg_id].to_s] = { projected_pts: pts, proj_pa: r[:pa].to_f }
        end
      end

      if pitcher_ids.any?
        quoted = pitcher_ids.map { |id| "'#{id.gsub("'", "''")}'" }.join(", ")
        sql = <<~SQL.squish
          SELECT CAST(fg_id AS VARCHAR) AS fg_id,
                 MAX(ip) AS ip, MAX(k) AS k, MAX(bb) AS bb, MAX(hr) AS hr, MAX(sv) AS sv, MAX(whip) AS whip
          FROM fg_projections_pitching
          WHERE season = #{current_season}
            AND CAST(fg_id AS VARCHAR) IN (#{quoted})
          GROUP BY CAST(fg_id AS VARCHAR)
        SQL
        run_query(sql, pitcher_ids.size + 10).each do |r|
          ip = r[:ip].to_f
          k  = r[:k].to_f
          bb = r[:bb].to_f
          hr = r[:hr].to_f
          sv = r[:sv].to_f
          h  = [r[:whip].to_f * ip - bb, 0].max
          pts = (ip * 7.4 + k * 2.0 + h * -2.6 + bb * -3.0 + hr * -12.3 + sv * 5.0).round(1)
          results[r[:fg_id].to_s] = { projected_pts: pts, proj_ip: ip }
        end
      end

      results
    rescue => e
      Rails.logger.warn("OttoneuFreeAgentsService projection fetch: #{e.message}")
      {}
    end

    # Merge fair_value_salary, projected_pts, vs_projection, and level onto each FA row.
    # vs_projection = pts above/below projection at full projected PA/IP pace.
    # Positive = outperforming (buy-low before market adjusts). Negative = underperforming.
    def enrich_with_projection(row, projections, group)
      actual_pts = row[:approx_fg_pts]
      proj       = projections[row[:fg_id].to_s]
      proj_pts   = proj&.dig(:projected_pts)
      fair_value = actual_pts ? (actual_pts / FAIR_PPD).round(1) : nil

      vs_projection =
        if actual_pts && proj_pts
          if group == :batter
            actual_pa = row[:ab].to_f + row[:bb].to_f
            proj_pa   = proj[:proj_pa].to_f
            ((actual_pts / actual_pa * proj_pa) - proj_pts).round(1) if actual_pa > 0 && proj_pa > 0
          else
            actual_ip = row[:ip].to_f
            proj_ip   = proj[:proj_ip].to_f
            ((actual_pts / actual_ip * proj_ip) - proj_pts).round(1) if actual_ip > 0 && proj_ip > 0
          end
        end

      row.merge(
        level:             level_for(row[:team].to_s),
        fair_value_salary: fair_value,
        projected_pts:     proj_pts,
        vs_projection:     vs_projection
      )
    end

    def level_for(team_str)
      team_str.match?(/AAA|AA|A\+|A-/i) ? "MiLB" : "MLB"
    end

    def approx_batter_fg_pts(r)
      ab  = r[:ab].to_f
      return nil if ab.zero?
      h   = r[:h].to_f
      dbl = r[:doubles].to_f
      tpl = r[:triples].to_f
      hr  = r[:hr].to_f
      bb  = r[:bb].to_f
      hbp = r[:hbp].to_f
      sb  = r[:sb].to_f
      cs  = r[:cs].to_f
      (ab * -1.0 + h * 5.6 + dbl * 2.9 + tpl * 5.7 + hr * 9.4 + bb * 3.0 + hbp * 3.0 + sb * 1.9 + cs * -2.8).round(1)
    end

    def approx_pitcher_fg_pts(r)
      ip = r[:ip].to_f
      return nil if ip.zero?
      k   = r[:k].to_f
      h   = r[:h].to_f
      bb  = r[:bb].to_f
      hbp = r[:hbp].to_f
      hr  = r[:hr].to_f
      sv  = r[:sv].to_f
      hld = r[:hld].to_f
      (ip * 7.4 + k * 2.0 + h * -2.6 + bb * -3.0 + hbp * -3.0 + hr * -12.3 + sv * 5.0 + hld * 4.0).round(1)
    end

    def extra_cols(table, cols)
      avail = Warehouse::Manager.table_columns(table)
      cols.map { |c| avail.include?(c) ? c : "0 AS #{c}" }.join(", ")
    end

    def run_query(sql, limit = SQL_LIMIT)
      result = Sandbox::QueryService.run(sql: sql, limit: limit)
      cols   = result[:columns] || []
      Array(result[:rows]).map { |row| cols.zip(row).to_h.transform_keys(&:to_sym) }
    rescue => e
      Rails.logger.warn("OttoneuFreeAgentsService DuckDB error: #{e.message}")
      []
    end

    def roster_summary(players)
      Array(players)
        .group_by { |p| p[:positions].to_s.split("/").first.to_s.strip }
        .transform_values(&:size)
    end

    def normalize_factoids(output)
      Array(output["factoids"] || output[:factoids]).map(&:to_s).map(&:strip).reject(&:blank?).first(6)
    end

    def current_season
      Date.today.year
    end

    def system_prompt
      <<~PROMPT
        You are a sharp Ottoneu fantasy baseball analyst. Return only valid JSON: { "factoids": ["string", ...] }.

        Scoring: H2H FanGraphs Points.
        Hitting: AB -1.0 · H +5.6 · HR +9.4 · BB +3.0 · SB +1.9 (approximation — 2B/3B/HBP/CS omitted from data)
        Pitching: IP +7.4 · K +2.0 · H -2.6 · BB -3.0 · HR -12.3 · SV +5.0 · HLD +4.0

        THE CORE PRINCIPLE: Salary efficiency. Every recommendation must cite a specific dollar figure and expected PPD or surplus.

        Data you receive per player:
        - approx_fg_pts: season FG points to date (approximate)
        - fair_value_salary: the max bid where PPD = 10.0 (break-even point). Bidding under this generates surplus.
        - projected_pts: full-season Steamer FG point projection
        - vs_projection: pts above/below full-season projection pace. Positive = outperforming (buy signal before market adjusts). Negative = underperforming.

        You also receive roster_summary (position → player count on Dingers) and cap_space. Use positional need to prioritize:
        - If a position has 1 player, an add there is higher priority than a position with 4.
        - If cap_space is under $30, flag cost efficiency even more aggressively — expensive bids are off the table.

        Value framework:
        - PPD = pts ÷ bid. Fair = 10. Good = 15+. Elite = 20+.
        - Surplus = pts − (bid × 10). Positive = underpriced. Cite the dollar figure (e.g. "+$45 surplus at a $3 bid").
        - Waiver claims are the best value — no bidding war, instant surplus at the listed salary. Always flag waiver players first.

        OUTPUT FORMAT — strict rules:
        - Write exactly 4 to 5 factoids. Each is ONE clear sentence.
        - NEVER write field names ("fair_value_salary", "vs_projection", "approx_fg_pts") in output. Use plain language: "fair-value bid of ~$X", "outperforming projection by X pts", "X FG pts so far".
        - Always name the player. Always include a dollar figure. Always include PPD or surplus estimate.
        - Waiver players: state their exact salary. Free agents: give a realistic winning bid range.
        - If vs_projection is positive, call it out explicitly — it's a buy-low signal before prices rise.
        - No hedging. No fluff. Write for a manager who has 10 seconds to decide.
      PROMPT
    end
  end
end
