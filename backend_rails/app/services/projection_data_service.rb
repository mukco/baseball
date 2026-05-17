class ProjectionDataService
  # Minimum sample sizes for a season to be included in history
  MIN_PA_FOR_HISTORY  = 30
  MIN_IP_FOR_HISTORY  = 5.0

  # Season volume defaults when early-season pace is unavailable
  DEFAULT_FULL_SEASON_PA_ESTIMATE  = 550
  DEFAULT_FULL_SEASON_IP_ESTIMATE  = 160.0

  # Age calculation
  DAYS_PER_YEAR     = 365.25
  NEUTRAL_AGE_DEFAULT = 28  # used when birth date is unavailable; neutral point on age curves

  # Default league-average component rates (~2024 MLB)
  LEAGUE_MEANS = {
    batter: {
      bb_pct:    0.083,
      k_pct:     0.225,
      babip:     0.299,
      iso:       0.165,
      hr_fb_pct: 0.130,
      fb_pct:    0.360,
      hbp_pct:   0.010,
    },
    pitcher: {
      k_pct:     0.225,
      bb_pct:    0.083,
      hr_fb_pct: 0.105,
      babip:     0.297,
      gb_pct:    0.430,
    },
  }.freeze

  # Approximate games per MLB season (used for RoS PA projection)
  GAMES_PER_SEASON = 162

  class << self
    # -----------------------------------------------------------------------
    # Batter history — last `years` seasons of component rates.
    # Returns array ordered most-recent first (index 0 = most recent).
    # -----------------------------------------------------------------------
    def batter_history(player_id, years: 3, before_season: nil)
      mlb    = MlbApiService.new
      latest = before_season ? (before_season - 1) : Date.today.year
      seasons = (0...years).map { |i| latest - i }

      seasons.filter_map do |season|
        stats         = mlb.player_season_stats(player_id, season)
        hitting_stats = stats[:hitting]
        next if hitting_stats.nil? || hitting_stats["atBats"].to_i < MIN_PA_FOR_HISTORY

        pa  = hitting_stats["plateAppearances"].to_i
        pa  = hitting_stats["atBats"].to_i + hitting_stats["baseOnBalls"].to_i + hitting_stats["hitByPitch"].to_i if pa.zero?
        next if pa < MIN_PA_FOR_HISTORY

        walks      = hitting_stats["baseOnBalls"].to_f
        strikeouts = hitting_stats["strikeOuts"].to_f
        home_runs  = hitting_stats["homeRuns"].to_f
        hits       = hitting_stats["hits"].to_f
        at_bats    = hitting_stats["atBats"].to_f
        sac_flies  = hitting_stats["sacFlies"].to_f
        avg        = hitting_stats["avg"].to_f
        slg        = hitting_stats["slg"].to_f

        babip = compute_babip(hits, home_runs, at_bats, strikeouts, sac_flies)
        iso   = (slg - avg).clamp(0.010, 0.400)

        walk_rate       = walks / pa
        strikeout_rate  = strikeouts / pa
        hbp_rate        = hitting_stats["hitByPitch"].to_f / pa
        # Estimate HR/FB from actual HR count using league-average FB% as denominator.
        # HR/PA ÷ (FB% × BIP%) gives a per-player HR/FB implied rate.
        # 1.0 = 100% of PA; subtract non-BIP outcomes to get the fraction that result in a batted ball
        balls_in_play_rate = (1.0 - walk_rate - strikeout_rate - hbp_rate).clamp(0.30, 0.90)
        hr_per_pa          = pa > 0 ? home_runs / pa : 0.0
        league_fly_ball_pct = LEAGUE_MEANS[:batter][:fb_pct]
        hr_fb_rate_est = (league_fly_ball_pct * balls_in_play_rate) > 0 ?
          (hr_per_pa / (league_fly_ball_pct * balls_in_play_rate)).clamp(0.02, 0.40) : nil

        # Statcast enhancement for most-recent season
        statcast_result = StatcastService.batter(player_id, season)
        statcast_data   = statcast_result[:error] ? {} : (statcast_result[:summary] || {})

        {
          season: season,
          pa: pa,
          bb_pct:    walk_rate,
          k_pct:     strikeout_rate,
          babip:     babip,
          iso:       iso,
          hr_fb_pct: hr_fb_rate_est,
          fb_pct:    nil,  # league default applied in projection service
          hbp_pct:   hbp_rate,
          # Statcast fields (nil if unavailable)
          x_ba:          statcast_data[:xBA],
          x_woba:        statcast_data[:xwOBA],
          barrel_pct:    statcast_data[:barrelPct].then { |v| v&. / 100.0 },
          hard_hit_pct:  statcast_data[:hardHitPct].then { |v| v&. / 100.0 },
          sprint_speed:  statcast_data[:sprintSpeed],
          avg_exit_velo: statcast_data[:avgExitVelo],
        }
      end
    end

    # -----------------------------------------------------------------------
    # Pitcher history — last `years` seasons of component rates.
    # Returns array ordered most-recent first (index 0 = most recent).
    # -----------------------------------------------------------------------
    def pitcher_history(player_id, years: 3, before_season: nil)
      mlb    = MlbApiService.new
      latest = before_season ? (before_season - 1) : Date.today.year
      seasons = (0...years).map { |i| latest - i }

      seasons.filter_map do |season|
        stats = mlb.player_season_stats(player_id, season)
        pitching_stats = stats[:pitching]
        next if pitching_stats.nil?

        ip = ip_to_float(pitching_stats["inningsPitched"].to_s)
        next if ip < MIN_IP_FOR_HISTORY

        batters_faced = (ip * ProjectionEngine::AVG_BATTERS_FACED_PER_INNING).round
        strikeouts    = pitching_stats["strikeOuts"].to_f
        walks         = pitching_stats["baseOnBalls"].to_f
        home_runs     = pitching_stats["homeRuns"].to_f
        hits_allowed  = pitching_stats["hits"].to_f
        k_pct  = batters_faced.positive? ? strikeouts / batters_faced : LEAGUE_MEANS[:pitcher][:k_pct]
        bb_pct = batters_faced.positive? ? walks      / batters_faced : LEAGUE_MEANS[:pitcher][:bb_pct]

        # BABIP for pitchers: (H - HR) / (BF - K - BB - HR)
        balls_in_play = batters_faced - strikeouts - walks - home_runs
        babip = balls_in_play.positive? ? (hits_allowed - home_runs) / balls_in_play : LEAGUE_MEANS[:pitcher][:babip]

        # Statcast for recent season
        statcast_result = StatcastService.pitcher(player_id, season)
        statcast_data   = statcast_result[:error] ? {} : (statcast_result[:summary] || {})

        {
          season:    season,
          ip:        ip,
          bf:        batters_faced,
          ip_faced:  batters_faced,  # alias so weighted_average can volume-weight by BF
          k_pct:     k_pct,
          bb_pct:    bb_pct,
          hr_fb_pct: nil,   # will use league mean + Statcast hard-hit adjustment
          babip:     babip,
          gb_pct:    nil,   # no source without FanGraphs; league default applied downstream
          x_woba:    statcast_data[:xwOBA],
          hard_hit_pct: statcast_data[:hardHitPct].then { |v| v&. / 100.0 },
          avg_velo:  statcast_data[:avgFastballVelo],
        }
      end
    end

    # -----------------------------------------------------------------------
    # League means for regression targets.
    # player_type: :batter or :pitcher
    # -----------------------------------------------------------------------
    def league_means(player_type:)
      LEAGUE_MEANS.fetch(player_type)
    end

    # -----------------------------------------------------------------------
    # Remaining games + PA/IP in current season for RoS projection.
    # -----------------------------------------------------------------------
    def remaining_season_context(player_id, player_type:)
      current_year = Date.today.year
      mlb = MlbApiService.new

      # Approximate games played so far
      season_start  = Date.new(current_year, 3, 20)  # ~MLB opening day
      season_end    = Date.new(current_year, 10, 1)
      today         = Date.today
      total_days    = (season_end - season_start).to_i
      elapsed_days  = [(today - season_start).to_i, 0].max
      pct_remaining = [1.0 - elapsed_days.to_f / total_days, 0.0].max

      stats = mlb.player_season_stats(player_id, current_year)

      if player_type == :batter
        h   = stats[:hitting] || {}
        pa_to_date = h["plateAppearances"].to_i
        pa_to_date = h["atBats"].to_i + h["baseOnBalls"].to_i + h["hitByPitch"].to_i if pa_to_date.zero?
        # Project full-season pace, then take remaining portion
        pa_full_pace = pct_remaining < 1.0 && (elapsed_days > 10) ? (pa_to_date / (1 - pct_remaining)).round : DEFAULT_FULL_SEASON_PA_ESTIMATE
        pa_remaining = [pa_full_pace * pct_remaining, 0].max.round
        { pa_to_date: pa_to_date, pa_remaining: pa_remaining, pct_remaining: pct_remaining }
      else
        p  = stats[:pitching] || {}
        ip_to_date = ip_to_float(p["inningsPitched"].to_s)
        ip_full_pace = pct_remaining < 1.0 && (elapsed_days > 10) ? (ip_to_date / (1 - pct_remaining)).round(1) : DEFAULT_FULL_SEASON_IP_ESTIMATE
        ip_remaining = [(ip_full_pace * pct_remaining).round(1), 0].max
        { ip_to_date: ip_to_date, ip_remaining: ip_remaining, pct_remaining: pct_remaining }
      end
    end

    # -----------------------------------------------------------------------
    # Player age at the start of the given season.
    # -----------------------------------------------------------------------
    def player_age(player_id, season: Date.today.year)
      mlb  = MlbApiService.new
      info = mlb.player_info(player_id)
      return NEUTRAL_AGE_DEFAULT if info[:error]

      dob = Date.parse(info.dig(:person, :birthDate).to_s)
      season_start = Date.new(season, 7, 1)  # age at midseason
      ((season_start - dob) / DAYS_PER_YEAR).floor
    rescue ArgumentError
      NEUTRAL_AGE_DEFAULT
    end

    # -----------------------------------------------------------------------
    # Player display name — fetched from cached player_info.
    # -----------------------------------------------------------------------
    def player_name(player_id)
      mlb  = MlbApiService.new
      info = mlb.player_info(player_id)
      return nil if info.nil? || info[:error]
      info[:name]
    rescue
      nil
    end

    # -----------------------------------------------------------------------
    # Detect whether a player is primarily a batter or pitcher.
    # -----------------------------------------------------------------------
    def detect_player_type(player_id)
      mlb   = MlbApiService.new
      stats = mlb.player_season_stats(player_id, Date.today.year)
      if stats[:pitching] && ip_to_float(stats.dig(:pitching, "inningsPitched").to_s) >= 10
        :pitcher
      elsif stats[:hitting] && stats.dig(:hitting, "atBats").to_i >= 10
        :batter
      else
        # Fallback: check career
        hitting_career = mlb.player_career_stats(player_id, group: "hitting")
        pitching_career = mlb.player_career_stats(player_id, group: "pitching")
        h_pa = hitting_career.sum { |s| s["plateAppearances"].to_i }
        p_ip = pitching_career.sum { |s| ip_to_float(s["inningsPitched"].to_s) }
        p_ip * 4 > h_pa ? :pitcher : :batter
      end
    rescue
      :batter
    end

    private

    def compute_babip(h, hr, ab, k, sf)
      numerator   = h - hr
      denominator = ab - k - hr + sf
      return LEAGUE_MEANS[:batter][:babip] if denominator <= 0
      (numerator / denominator).clamp(0.100, 0.500)
    end

    def ip_to_float(ip_str)
      return 0.0 if ip_str.blank?
      parts = ip_str.to_s.split(".")
      full_innings  = parts[0].to_i
      partial_outs  = parts[1].to_i
      full_innings + partial_outs / 3.0
    end
  end
end
