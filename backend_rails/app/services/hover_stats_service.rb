class HoverStatsService
  class << self
    def call(player_id:)
      season = Date.today.year
      mlb    = MlbApiService.new

      info = mlb.player_info(player_id)
      return { error: "not found" } unless info

      season_stats = mlb.player_season_stats(player_id, season)
      pos          = info[:position].to_s
      is_pitcher   = %w[SP RP P].include?(pos)

      if is_pitcher
        pitcher_stats(mlb, player_id, season, info, season_stats, pos)
      else
        batter_stats(mlb, player_id, season, info, season_stats, pos)
      end
    rescue StandardError => e
      { error: e.message }
    end

    private

    def pitcher_stats(mlb, player_id, season, info, season_stats, pos)
      pit   = season_stats[:pitching] || {}
      parts = pit["inningsPitched"].to_s.split(".")
      ip    = parts[0].to_i + (parts[1]&.to_i || 0) / 3.0
      xwoba = StatcastService.pitcher(player_id, season).dig(:summary, :xwOBA)
      trend = safe_career(mlb, player_id, group: "pitching").last(5).filter_map { |s| s["era"]&.to_f }

      {
        name:       info[:name],
        position:   pos,
        team:       info[:teamAbbrev],
        playerType: "pitcher",
        era:        pit["era"]&.to_f,
        whip:       pit["whip"]&.to_f,
        k9:         ip > 0 ? (pit["strikeOuts"].to_f * 9 / ip).round(2) : nil,
        xwoba:      xwoba,
        ip:         pit["inningsPitched"],
        trend:      trend,
        trendLabel: "ERA",
        season:     season,
      }
    end

    def batter_stats(mlb, player_id, season, info, season_stats, pos)
      hit   = season_stats[:hitting] || {}
      xwoba = StatcastService.batter(player_id, season).dig(:summary, :xwOBA)
      trend = safe_career(mlb, player_id, group: "hitting").last(5).filter_map { |s| s["slg"]&.to_f }

      {
        name:       info[:name],
        position:   pos,
        team:       info[:teamAbbrev],
        playerType: "batter",
        avg:        hit["avg"]&.to_f,
        obp:        hit["obp"]&.to_f,
        slg:        hit["slg"]&.to_f,
        ops:        hit["ops"]&.to_f,
        xwoba:      xwoba,
        pa:         hit["plateAppearances"]&.to_i,
        trend:      trend,
        trendLabel: "SLG",
        season:     season,
      }
    end

    def safe_career(mlb, player_id, group:)
      result = mlb.player_career_stats(player_id, group: group)
      result.is_a?(Array) ? result : []
    end
  end
end
