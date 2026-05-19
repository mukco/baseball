require "json"
require "open3"

class LeagueConstantsService
  CONSTANTS_PATH = Rails.root.join("tmp", "warehouse", "league_constants.json")

  # Hardcoded fallbacks — used when DuckDB is unavailable (cold start, missing file).
  # Values are the previously hardcoded estimates; real derived values replace these at runtime.
  FALLBACK = {
    "derived_at" => nil,
    "batter" => {
      "k_pct"     => 0.215,
      "bb_pct"    => 0.087,
      "babip"     => 0.298,
      "iso"       => 0.165,
      "hr_fb_pct" => 0.105,
      "fb_pct"    => 0.36,
      "gb_pct"    => 0.44,
      "hbp_pct"   => 0.010,
      "pull_pct"  => 0.40,
      "cent_pct"  => 0.33,
      "oppo_pct"  => 0.27,
    },
    "pitcher" => {
      "k_pct"     => 0.225,
      "bb_pct"    => 0.083,
      "babip"     => 0.297,
      "hr_fb_pct" => 0.105,
      "gb_pct"    => 0.430,
      "fb_pct"    => 0.360,
    },
    "pitcher_reliever" => {
      "k_pct"     => 0.235,
      "bb_pct"    => 0.085,
      "babip"     => 0.295,
      "hr_fb_pct" => 0.105,
      "gb_pct"    => 0.44,
      "fb_pct"    => 0.36,
    },
    "league" => {
      "woba"             => 0.317,
      "rc_per_pa"        => 0.115,
      "fip_constant"     => 3.20,
      "xfip_hr_fb_pct"   => 0.105,
    },
  }.freeze

  class << self
    def all
      load_or_fallback
    end

    def batter
      all["batter"]
    end

    def pitcher
      all["pitcher"]
    end

    def pitcher_reliever
      all["pitcher_reliever"]
    end

    def league
      all["league"]
    end

    def derived_at
      ts = all["derived_at"]
      ts ? Time.parse(ts) : nil
    rescue ArgumentError
      nil
    end

    def refresh!
      constants = derive_from_duckdb
      payload   = constants.merge("derived_at" => Time.now.utc.iso8601)
      File.write(CONSTANTS_PATH, JSON.pretty_generate(payload))
      Rails.logger.info("[LeagueConstantsService] refreshed constants from warehouse")
      payload
    rescue => e
      Rails.logger.warn("[LeagueConstantsService] refresh failed: #{e.message} — keeping existing")
      nil
    end

    private

    def load_or_fallback
      if File.exist?(CONSTANTS_PATH)
        JSON.parse(File.read(CONSTANTS_PATH))
      else
        Rails.logger.warn("[LeagueConstantsService] constants file missing — using fallback")
        FALLBACK
      end
    rescue JSON::ParserError
      FALLBACK
    end

    def derive_from_duckdb
      db = Warehouse::Manager.duckdb_path
      raise "DuckDB not found at #{db}" unless File.exist?(db)

      batter_row   = query_one(db, batter_sql)
      pitcher_row  = query_one(db, pitcher_sql)
      reliever_row = query_one(db, reliever_sql)
      league_row   = query_one(db, league_sql)

      {
        "batter" => {
          "k_pct"     => pct(batter_row["k_pct"]),
          "bb_pct"    => pct(batter_row["bb_pct"]),
          "babip"     => round(batter_row["babip"]),
          "iso"       => round(batter_row["iso"]),
          "hr_fb_pct" => pct(batter_row["hr_fb_pct"]),
          "fb_pct"    => pct(batter_row["fb_pct"]),
          "gb_pct"    => pct(batter_row["gb_pct"]),
          # No warehouse columns for these — keep at known stable values
          "hbp_pct"   => 0.010,
          "pull_pct"  => 0.40,
          "cent_pct"  => 0.33,
          "oppo_pct"  => 0.27,
        },
        "pitcher" => {
          "k_pct"     => pct(pitcher_row["k_pct"]),
          "bb_pct"    => pct(pitcher_row["bb_pct"]),
          "babip"     => round(pitcher_row["babip"]),
          "hr_fb_pct" => round(pitcher_row["hr_fb_pct"]),
          "gb_pct"    => pct(pitcher_row["gb_pct"]),
          "fb_pct"    => pct(pitcher_row["fb_pct"]),
        },
        "pitcher_reliever" => {
          "k_pct"     => pct(reliever_row["k_pct"]),
          "bb_pct"    => pct(reliever_row["bb_pct"]),
          "babip"     => round(reliever_row["babip"]),
          "hr_fb_pct" => round(reliever_row["hr_fb_pct"]),
          "gb_pct"    => pct(reliever_row["gb_pct"]),
          "fb_pct"    => pct(reliever_row["fb_pct"]),
        },
        "league" => {
          "woba"           => round(league_row["woba"]),
          "rc_per_pa"      => round(league_row["rc_per_pa"]),
          "fip_constant"   => round(league_row["fip_constant"]),
          "xfip_hr_fb_pct" => round(pitcher_row["hr_fb_pct"]),
        },
      }
    end

    # Run a single-row aggregate query against the warehouse DuckDB.
    def query_one(db_path, sql)
      payload = JSON.generate({ sql: sql, duckdb_path: db_path, tables: [], limit: 1 })
      script  = Rails.root.join("script", "sandbox_duckdb_query.py").to_s
      stdout, stderr, status = Open3.capture3("python", script, stdin_data: payload)
      raise "DuckDB query failed: #{stderr.strip}" unless status.success?

      result = JSON.parse(stdout)
      raise result["error"] if result["error"].present?

      cols = result["columns"]
      row  = result["rows"]&.first
      raise "Empty result for league constants query" if row.nil?

      cols.zip(row).to_h
    end

    # Warehouse stores rates as percentages (22.5 = 22.5%); convert to decimal.
    def pct(val)
      return nil if val.nil?
      (val.to_f / 100.0).round(4)
    end

    def round(val)
      val&.to_f&.round(4)
    end

    # -----------------------------------------------------------------------
    # SQL definitions — PA/TBF-weighted averages across the last 2 completed
    # seasons. Season filter uses MAX(season) so the queries stay correct
    # as the warehouse rolls forward each year.
    # -----------------------------------------------------------------------

    def batter_sql
      <<~SQL.squish
        WITH max_s AS (SELECT MAX(season) AS s FROM batters)
        SELECT
          SUM(pa * k_pct)     / SUM(pa) AS k_pct,
          SUM(pa * bb_pct)    / SUM(pa) AS bb_pct,
          SUM(pa * babip)     / SUM(pa) AS babip,
          SUM(pa * iso)       / SUM(pa) AS iso,
          SUM(pa * hr_fb_pct) / SUM(pa) AS hr_fb_pct,
          SUM(pa * fb_pct)    / SUM(pa) AS fb_pct,
          SUM(pa * gb_pct)    / SUM(pa) AS gb_pct
        FROM batters, max_s
        WHERE pa >= 100
          AND season >= max_s.s - 1
      SQL
    end

    def pitcher_sql
      <<~SQL.squish
        WITH max_s AS (SELECT MAX(season) AS s FROM pitchers)
        SELECT
          SUM(tbf * k_pct)  / SUM(tbf)  AS k_pct,
          SUM(tbf * bb_pct) / SUM(tbf)  AS bb_pct,
          SUM(tbf * babip)  / SUM(tbf)  AS babip,
          SUM(ip * gb_pct)  / SUM(ip)   AS gb_pct,
          SUM(ip * fb_pct)  / SUM(ip)   AS fb_pct,
          SUM(hr) * 1.0
            / NULLIF(SUM(CAST(ROUND(ip * fb_pct / 100.0 * 3) AS INTEGER)), 0)
            AS hr_fb_pct
        FROM pitchers, max_s
        WHERE ip >= 10
          AND season >= max_s.s - 1
      SQL
    end

    def reliever_sql
      <<~SQL.squish
        WITH max_s AS (SELECT MAX(season) AS s FROM pitchers)
        SELECT
          SUM(tbf * k_pct)  / SUM(tbf)  AS k_pct,
          SUM(tbf * bb_pct) / SUM(tbf)  AS bb_pct,
          SUM(tbf * babip)  / SUM(tbf)  AS babip,
          SUM(ip * gb_pct)  / SUM(ip)   AS gb_pct,
          SUM(ip * fb_pct)  / SUM(ip)   AS fb_pct,
          SUM(hr) * 1.0
            / NULLIF(SUM(CAST(ROUND(ip * fb_pct / 100.0 * 3) AS INTEGER)), 0)
            AS hr_fb_pct
        FROM pitchers, max_s
        WHERE gs = 0
          AND ip >= 5
          AND season >= max_s.s - 1
      SQL
    end

    def league_sql
      <<~SQL.squish
        WITH max_s AS (SELECT MAX(season) AS s FROM teams_batting),
        batting AS (
          SELECT
            SUM(woba * (ab + bb)) / SUM(ab + bb) AS woba,
            SUM(r) * 1.0 / NULLIF(SUM(ab + bb), 0) AS rc_per_pa
          FROM teams_batting, max_s
          WHERE season >= max_s.s - 1
        ),
        fip AS (
          SELECT
            SUM(era * ip) / SUM(ip)
              - (13.0 * SUM(hr) + 3.0 * SUM(bb) - 2.0 * SUM(k)) / SUM(ip)
              AS fip_constant
          FROM pitchers, max_s
          WHERE ip >= 10
            AND season >= max_s.s - 1
        )
        SELECT batting.woba, batting.rc_per_pa, fip.fip_constant
        FROM batting, fip
      SQL
    end
  end
end
