require "digest"

class OttoneuPlayerStatsService
  CACHE_TTL = 60.minutes

  class << self
    def fetch(fg_ids: [], names: [])
      return [] unless Warehouse::Manager.exists?

      fg_ids = Array(fg_ids).compact.map(&:to_s).reject(&:blank?).sort
      names  = Array(names).compact.map(&:to_s).reject(&:blank?).sort

      cache_key = "ottoneu_player_stats:#{Digest::MD5.hexdigest("#{fg_ids.join('|')}::#{names.join('|')}")}"
      Rails.cache.fetch(cache_key, expires_in: CACHE_TTL) do
        results = []
        results += fetch_by_fg_ids(fg_ids) if fg_ids.any?
        results += fetch_by_names(names)   if names.any?
        merge_results(results)
      end
    rescue => e
      Rails.logger.warn("OttoneuPlayerStatsService: #{e.message}")
      []
    end

    private

    BATTER_CORE  = "fg_id, name, avg, obp, slg, ops, babip, woba, wrc_plus, ab, h, hr, bb, sb, bb_pct".freeze
    PITCHER_CORE = "fg_id, name, era, fip, k_pct, whip, k_per_9, ip, k, h, bb, hr, sv".freeze

    BATTER_EXTRA  = %w[doubles triples hbp cs].freeze
    PITCHER_EXTRA = %w[hbp hld].freeze

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

    def fetch_by_fg_ids(ids)
      quoted = ids.map { |id| "'#{id.gsub("'", "''")}'" }.join(", ")
      bat = run("SELECT #{batter_cols}  FROM batters  WHERE season = #{current_season} AND CAST(fg_id AS VARCHAR) IN (#{quoted})")
      pit = run("SELECT #{pitcher_cols} FROM pitchers WHERE season = #{current_season} AND CAST(fg_id AS VARCHAR) IN (#{quoted})")
      merge_results(shape(bat, :batter) + shape(pit, :pitcher))
    end

    def fetch_by_names(names)
      quoted = names.map { |n| "'#{n.gsub("'", "''")}'" }.join(", ")
      bat = run("SELECT #{batter_cols}  FROM batters  WHERE season = #{current_season} AND name IN (#{quoted})")
      pit = run("SELECT #{pitcher_cols} FROM pitchers WHERE season = #{current_season} AND name IN (#{quoted})")
      merge_results(shape(bat, :batter) + shape(pit, :pitcher))
    end

    # When a player appears in both tables (e.g., a pitcher with a pinch-hit PA),
    # keep the entry with non-nil approx_fg_pts. Pitcher pts are more meaningful.
    def merge_results(rows)
      rows
        .group_by { |r| r[:fg_id].presence || r[:name] }
        .map { |_, entries| entries.find { |e| e[:approx_fg_pts] } || entries.first }
    end

    def run(sql)
      result = Sandbox::QueryService.run(sql: sql, limit: 100)
      cols   = result[:columns] || []
      Array(result[:rows]).map { |row| cols.zip(row).to_h.transform_keys(&:to_sym) }
    end

    def shape(rows, group)
      rows.map do |r|
        pts = group == :batter ? approx_batter_fg_pts(r) : approx_pitcher_fg_pts(r)
        r.merge(group: group.to_s, approx_fg_pts: pts)
      end
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

    def current_season
      Date.today.year
    end
  end
end
