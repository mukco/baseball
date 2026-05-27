class OttoneuLeagueStatsService
  FAIR_PPD = 10.0

  BATTER_CORE  = "CAST(fg_id AS VARCHAR) AS fg_id, player_id, name, avg, obp, slg, ops, woba, wrc_plus, ab, h, hr, bb, sb".freeze
  PITCHER_CORE = "CAST(fg_id AS VARCHAR) AS fg_id, player_id, name, era, fip, k_pct, whip, k_per_9, ip, k, h, bb, hr, sv".freeze

  # Columns added in the schema update — may not exist in older warehouse builds.
  BATTER_EXTRA  = %w[doubles triples hbp cs].freeze
  PITCHER_EXTRA = %w[hbp hld].freeze

  FA_BATTER_LIMIT  = 120
  FA_PITCHER_LIMIT = 80

  CACHE_TTL = 60.minutes

  class << self
    def call(refresh: false)
      cache_key = "ottoneu_league_stats"
      Rails.cache.delete(cache_key) if refresh
      Rails.cache.fetch(cache_key, expires_in: CACHE_TTL) { generate }
    rescue => e
      Rails.logger.warn("OttoneuLeagueStatsService: #{e.message}")
      []
    end

    private

    def generate
      rosters = OttoneuService.all_rosters
      return [] if rosters.is_a?(Hash) && rosters[:error]
      return [] if rosters.blank?
      return [] unless Warehouse::Manager.exists?

      salary_map = {}
      Array(rosters).each do |team|
        Array(team[:players]).each do |player|
          fid = player[:fg_id].to_s.strip
          next if fid.blank?
          salary_map[fid] = {
            roster_team: team[:team_name].to_s,
            salary:      player[:salary].to_i,
            positions:   player[:positions].to_s,
            mlb_team:    player[:mlb_team].to_s,
          }
        end
      end

      return [] if salary_map.empty?

      fg_ids = salary_map.keys
      quoted = fg_ids.map { |id| "'#{id.gsub("'", "''")}'" }.join(", ")
      lim    = [fg_ids.size + 50, 600].max

      bat_cols = batter_cols
      pit_cols = pitcher_cols

      bat_rows = dedup_by_fg_id(run("SELECT #{bat_cols}  FROM batters  WHERE season = #{current_season} AND fg_id IN (#{quoted})", lim), :ab)
      pit_rows = dedup_by_fg_id(run("SELECT #{pit_cols} FROM pitchers WHERE season = #{current_season} AND fg_id IN (#{quoted})", lim), :ip)

      results = []

      bat_rows.each do |r|
        roster = salary_map[r[:fg_id].to_s] || {}
        next if roster.empty?
        pts    = approx_batter_pts(r)
        salary = roster[:salary]
        results << build_row(r, :batter, pts, salary, roster)
      end

      pit_rows.each do |r|
        roster = salary_map[r[:fg_id].to_s] || {}
        next if roster.empty?
        pts    = approx_pitcher_pts(r)
        salary = roster[:salary]
        results << build_row(r, :pitcher, pts, salary, roster)
      end

      # Free agents — top unrostered players from the warehouse
      excl_clause = "AND CAST(fg_id AS VARCHAR) NOT IN (#{quoted})"
      minor_excl  = "AND team NOT LIKE '%AAA%' AND team NOT LIKE '%AA%' AND team NOT LIKE '%A+%' AND team NOT LIKE '%A-%'"

      fa_bat = dedup_by_fg_id(run(<<~SQL.squish, FA_BATTER_LIMIT), :ab)
        SELECT #{bat_cols}, team FROM batters
        WHERE season = #{current_season} AND fg_id IS NOT NULL #{minor_excl} #{excl_clause}
        ORDER BY woba DESC NULLS LAST LIMIT #{FA_BATTER_LIMIT}
      SQL

      fa_pit = dedup_by_fg_id(run(<<~SQL.squish, FA_PITCHER_LIMIT), :ip)
        SELECT #{pit_cols}, team FROM pitchers
        WHERE season = #{current_season} AND fg_id IS NOT NULL #{minor_excl} #{excl_clause}
        ORDER BY fip ASC NULLS LAST LIMIT #{FA_PITCHER_LIMIT}
      SQL

      fa_bat.each do |r|
        pts = approx_batter_pts(r)
        results << build_row(r, :batter, pts, nil, { roster_team: nil, salary: nil, positions: nil, mlb_team: r[:team].to_s })
      end

      fa_pit.each do |r|
        pts = approx_pitcher_pts(r)
        results << build_row(r, :pitcher, pts, nil, { roster_team: nil, salary: nil, positions: nil, mlb_team: r[:team].to_s })
      end

      # Final dedup: a two-way player can appear in both bat and pit queries.
      # Deduplicate within each group so no fg_id appears twice as 'batter' or twice as 'pitcher'.
      results
        .group_by { |r| "#{r[:fg_id]}_#{r[:group]}" }
        .map { |_, dupes| dupes.find { |e| e[:approx_fg_pts] } || dupes.first }
        .sort_by { |r| -(r[:approx_fg_pts] || 0) }
    end

    def build_row(r, group, pts, salary, roster)
      ppd     = (pts && salary && salary > 0) ? (pts / salary.to_f).round(2) : nil
      surplus = (pts && salary)               ? ((pts - salary * FAIR_PPD).round(1)) : nil
      r.merge(
        group:         group.to_s,
        approx_fg_pts: pts,
        ppd:           ppd,
        surplus:       surplus,
        roster_team:   roster[:roster_team],
        salary:        salary,
        positions:     roster[:positions],
        mlb_team:      roster[:mlb_team],
      )
    end

    # FanGraphs returns one row per team stint for traded players plus a combined row.
    # Keep the row with the highest volume stat (ab or ip) — that's always the season total.
    def dedup_by_fg_id(rows, volume_col)
      rows.group_by { |r| r[:fg_id].to_s }.map { |_, dupes| dupes.max_by { |r| r[volume_col].to_f } }
    end

    def batter_cols
      avail = Warehouse::Manager.table_columns("batters")
      extra = BATTER_EXTRA.map { |c| avail.include?(c) ? c : "0 AS #{c}" }.join(", ")
      "#{BATTER_CORE}, #{extra}"
    end

    def pitcher_cols
      avail = Warehouse::Manager.table_columns("pitchers")
      extra = PITCHER_EXTRA.map { |c| avail.include?(c) ? c : "0 AS #{c}" }.join(", ")
      "#{PITCHER_CORE}, #{extra}"
    end

    def run(sql, limit)
      result = Sandbox::QueryService.run(sql: sql, limit: limit)
      cols   = result[:columns] || []
      Array(result[:rows]).map { |row| cols.zip(row).to_h.transform_keys(&:to_sym) }
    end

    def approx_batter_pts(r)
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

    def approx_pitcher_pts(r)
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

    def current_season
      Date.today.year
    end
  end
end
