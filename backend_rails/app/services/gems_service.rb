class GemsService
  CACHE_TTL = 30 * 60

  @@cache = {}
  @@cache_timestamps = {}

  CATEGORIES = {
    bat: [
      {
        id: "babip_unlucky",
        title: "BABIP Unlucky",
        signal: "Due for positive regression",
        description: "Hard-contact metrics intact but BABIP running well below career average — results haven't caught up yet.",
        direction: "buy"
      },
      {
        id: "emerging",
        title: "Emerging",
        signal: "Elite rate stats in limited time",
        description: "Small sample but elite discipline and wRC+ — players getting opportunity and making the most of it.",
        direction: "buy"
      },
      {
        id: "sell_high",
        title: "Sell High",
        signal: "BABIP-inflated performance",
        description: "BABIP running significantly above career average — current counting stats are unlikely to hold.",
        direction: "sell"
      }
    ],
    pit: [
      {
        id: "fip_divergence",
        title: "FIP Divergence",
        signal: "ERA will fall",
        description: "ERA is meaningfully higher than FIP/xFIP — pitching better than results show, ERA regression incoming.",
        direction: "buy"
      }
    ]
  }.freeze

  class << self
    def call(season:, group: "bat")
      key = "gems_#{group}_#{season}"
      return @@cache[key] if cache_fresh?(key)

      sym = group.to_sym
      meta = CATEGORIES.fetch(sym, [])
      players_by_id = sym == :pit ? pitcher_players(season) : batter_players(season)

      categories = meta.map do |cat|
        players = players_by_id.fetch(cat[:id], [])
        cat.merge(players: players)
      end

      result = { season: season, group: group, categories: categories }
      cache_set(key, result)
      result
    end

    private

    # ------------------------------------------------------------------ #
    # Batter categories — DuckDB multi-season queries
    # ------------------------------------------------------------------ #

    def batter_players(season)
      {
        "babip_unlucky" => run_query(babip_unlucky_sql(season)),
        "emerging"      => run_query(emerging_sql(season)),
        "sell_high"     => run_query(sell_high_sql(season))
      }
    end

    def babip_unlucky_sql(season)
      <<~SQL
        WITH career AS (
          SELECT player_id,
                 AVG(TRY_CAST(babip AS DOUBLE)) AS career_babip,
                 AVG(TRY_CAST(hard_pct AS DOUBLE)) AS avg_hard_pct
          FROM players
          WHERE season < #{season}
            AND TRY_CAST(pa AS INTEGER) >= 150
          GROUP BY player_id
          HAVING SUM(TRY_CAST(pa AS INTEGER)) >= 250
        )
        SELECT
          p.player_id,
          p.name,
          p.team,
          p.position,
          TRY_CAST(p.pa AS INTEGER)              AS pa,
          TRY_CAST(p.babip AS DOUBLE)            AS babip,
          ROUND(c.career_babip, 3)               AS career_babip,
          ROUND(c.career_babip - TRY_CAST(p.babip AS DOUBLE), 3) AS babip_gap,
          TRY_CAST(p.wrc_plus AS DOUBLE)         AS wrc_plus,
          TRY_CAST(p.woba AS DOUBLE)             AS woba,
          TRY_CAST(p.hard_pct AS DOUBLE)         AS hard_pct,
          TRY_CAST(p.k_pct AS DOUBLE)            AS k_pct,
          TRY_CAST(p.bb_pct AS DOUBLE)           AS bb_pct,
          TRY_CAST(p.ops AS DOUBLE)              AS ops
        FROM players p
        JOIN career c ON TRY_CAST(p.player_id AS INTEGER) = TRY_CAST(c.player_id AS INTEGER)
        WHERE p.season = #{season}
          AND TRY_CAST(p.pa AS INTEGER) >= 80
          AND TRY_CAST(p.babip AS DOUBLE) < 0.265
          AND (c.career_babip - TRY_CAST(p.babip AS DOUBLE)) > 0.040
          AND TRY_CAST(p.hard_pct AS DOUBLE) > 28
        ORDER BY babip_gap DESC
        LIMIT 10
      SQL
    end

    def emerging_sql(season)
      <<~SQL
        SELECT
          p.player_id,
          p.name,
          p.team,
          p.position,
          TRY_CAST(p.pa AS INTEGER)          AS pa,
          TRY_CAST(p.babip AS DOUBLE)        AS babip,
          TRY_CAST(p.wrc_plus AS DOUBLE)     AS wrc_plus,
          TRY_CAST(p.woba AS DOUBLE)         AS woba,
          TRY_CAST(p.hard_pct AS DOUBLE)     AS hard_pct,
          TRY_CAST(p.k_pct AS DOUBLE)        AS k_pct,
          TRY_CAST(p.bb_pct AS DOUBLE)       AS bb_pct,
          TRY_CAST(p.ops AS DOUBLE)          AS ops,
          NULL::DOUBLE                       AS career_babip,
          NULL::DOUBLE                       AS babip_gap
        FROM players p
        WHERE p.season = #{season}
          AND TRY_CAST(p.pa AS INTEGER) BETWEEN 50 AND 220
          AND TRY_CAST(p.wrc_plus AS DOUBLE) >= 120
          AND TRY_CAST(p.bb_pct AS DOUBLE) > 8.0
          AND TRY_CAST(p.k_pct AS DOUBLE) < 24.0
        ORDER BY wrc_plus DESC
        LIMIT 10
      SQL
    end

    def sell_high_sql(season)
      <<~SQL
        WITH career AS (
          SELECT player_id,
                 AVG(TRY_CAST(babip AS DOUBLE)) AS career_babip
          FROM players
          WHERE season < #{season}
            AND TRY_CAST(pa AS INTEGER) >= 150
          GROUP BY player_id
          HAVING SUM(TRY_CAST(pa AS INTEGER)) >= 250
        )
        SELECT
          p.player_id,
          p.name,
          p.team,
          p.position,
          TRY_CAST(p.pa AS INTEGER)              AS pa,
          TRY_CAST(p.babip AS DOUBLE)            AS babip,
          ROUND(c.career_babip, 3)               AS career_babip,
          ROUND(TRY_CAST(p.babip AS DOUBLE) - c.career_babip, 3) AS babip_gap,
          TRY_CAST(p.wrc_plus AS DOUBLE)         AS wrc_plus,
          TRY_CAST(p.woba AS DOUBLE)             AS woba,
          TRY_CAST(p.hard_pct AS DOUBLE)         AS hard_pct,
          TRY_CAST(p.k_pct AS DOUBLE)            AS k_pct,
          TRY_CAST(p.bb_pct AS DOUBLE)           AS bb_pct,
          TRY_CAST(p.ops AS DOUBLE)              AS ops
        FROM players p
        JOIN career c ON TRY_CAST(p.player_id AS INTEGER) = TRY_CAST(c.player_id AS INTEGER)
        WHERE p.season = #{season}
          AND TRY_CAST(p.pa AS INTEGER) >= 80
          AND TRY_CAST(p.babip AS DOUBLE) > 0.355
          AND (TRY_CAST(p.babip AS DOUBLE) - c.career_babip) > 0.055
        ORDER BY babip_gap DESC
        LIMIT 10
      SQL
    end

    # ------------------------------------------------------------------ #
    # Pitcher categories — FanGraphs leaderboard + Ruby filter
    # ------------------------------------------------------------------ #

    def pitcher_players(season)
      rows = StatcastService.pitching_leaderboard(season, min_ip: 20)

      fip_divergence = rows.filter_map do |row|
        era  = to_f(row["ERA"])
        fip  = to_f(row["FIP"])
        xfip = to_f(row["xFIP"])
        ip   = to_f(row["IP"])
        next if era.nil? || fip.nil? || ip.nil? || ip < 20 || fip <= 0

        gap = (era - fip).round(2)
        next if gap < 1.0

        {
          "player_id" => (row["xMLBAMID"] || row["MLBAMID"] || row["MLBID"] || row["PlayerId"])&.to_i,
          "name"      => row["Name"],
          "team"      => row["Team"],
          "position"  => "P",
          "ip"        => ip.round(1),
          "era"       => era.round(2),
          "fip"       => fip.round(2),
          "xfip"      => xfip&.positive? ? xfip.round(2) : nil,
          "era_fip_gap" => gap,
          "k_pct"     => to_f(row["K%"]),
          "bb_pct"    => to_f(row["BB%"]),
          "war"       => to_f(row["WAR"])
        }
      end.sort_by { |r| -r["era_fip_gap"] }.first(10)

      { "fip_divergence" => fip_divergence }
    end

    # ------------------------------------------------------------------ #
    # Helpers
    # ------------------------------------------------------------------ #

    def run_query(sql)
      result = Sandbox::QueryService.run(sql: sql, limit: 10)
      columns = result[:columns]
      result[:rows].map { |row| columns.zip(row).to_h }
    rescue StandardError => e
      Rails.logger.error("GemsService query error: #{e.message}")
      []
    end

    def to_f(value)
      return nil if value.nil?
      f = Float(value.to_s)
      f.finite? ? f : nil
    rescue ArgumentError, TypeError
      nil
    end

    def cache_fresh?(key)
      @@cache.key?(key) && @@cache_timestamps[key].to_i > Time.now.to_i - CACHE_TTL
    end

    def cache_set(key, value)
      @@cache[key] = value
      @@cache_timestamps[key] = Time.now.to_i
    end
  end
end
