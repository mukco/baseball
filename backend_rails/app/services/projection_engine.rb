class ProjectionEngine
  # Stabilization constants (PA/BF needed to reach ~50% reliability)
  # Source: Tango/MGL research
  STABILIZATION = {
    # Batter components
    k_pct_batter:  60,
    bb_pct_batter: 120,
    iso:           250,
    hr_fb_pct:     300,
    babip_batter:  820,
    fb_pct:        80,
    # Pitcher components
    k_pct_pitcher:  70,
    bb_pct_pitcher: 170,
    hr_fb_pct_pitcher: 200,
    babip_pitcher: 2000,
    gb_pct:        80,
  }.freeze

  # wOBA weights for current run environment (~2024 MLB)
  WOBA_WEIGHTS = {
    ubb:  0.690,
    hbp:  0.722,
    single: 0.881,
    double: 1.243,
    triple: 1.569,
    hr:   2.082,
  }.freeze

  WOBA_SCALE       = 1.157  # converts wOBA to wRC+
  LEAGUE_WOBA      = 0.317  # ~2024 MLB average wOBA
  LEAGUE_RC_PER_PA = 0.115  # ~2024 MLB runs created per plate appearance

  FIP_CONSTANT = 3.20  # ~2024 MLB FIP constant

  # Batters faced per inning of work (~neutral MLB average)
  AVG_BATTERS_FACED_PER_INNING = 4.3

  # Share of non-HR in-play hits that are singles, doubles, and triples (rough MLB averages)
  SINGLE_RATE_OF_IN_PLAY_HITS = 0.77
  DOUBLE_RATE_OF_IN_PLAY_HITS = 0.20
  TRIPLE_RATE_OF_IN_PLAY_HITS = 0.03

  # ~10% of batted balls are line drives; treated as a constant since we lack per-pitcher LD data
  ASSUMED_LINE_DRIVE_RATE = 0.10

  # Empirical conversion: expected runs allowed per baserunner per inning
  RUNS_PER_BASERUNNER = 0.32

  # ERA is blended equally between the BABIP-based estimate and FIP to prevent BABIP from drifting too far
  ERA_FIP_BLEND_WEIGHT = 0.5

  # League-average HR/FB rate used to normalize xFIP (removes pitcher luck on HR/FB)
  XFIP_NORMALIZING_HR_FB_PCT = 0.105

  class << self
    # -------------------------------------------------------------------------
    # Weighted average of a component across multiple seasons.
    # history: [{ season:, pa:, <stat>: value }, ...]
    # year_weights: { 0 => 5, 1 => 4, 2 => 3 } (0 = most recent)
    # stat: symbol key in each history entry
    # Returns the PA-weighted, year-weighted rate.
    # -------------------------------------------------------------------------
    def weighted_average(history, year_weights, stat)
      total_weight = 0.0
      weighted_sum = 0.0

      history.each_with_index do |season_data, year_index|
        next unless season_data[stat]

        volume      = (season_data[:pa] || season_data[:ip_faced] || 1).to_f
        year_weight = year_weights.fetch(year_index, 0).to_f
        weight      = volume * year_weight

        weighted_sum  += season_data[stat].to_f * weight
        total_weight  += weight
      end

      return nil if total_weight.zero?

      weighted_sum / total_weight
    end

    # -------------------------------------------------------------------------
    # Regress a rate toward league mean based on sample size.
    # Tango's formula: (rate * n + mean * k) / (n + k)
    # stabilization_key: key in STABILIZATION constant
    # regression_factor: scenario multiplier (1.0 = standard, 2.0 = more regression)
    # -------------------------------------------------------------------------
    def regress_to_mean(rate, sample_size, league_mean, stabilization_key, regression_factor: 1.0)
      return league_mean if rate.nil?

      k = STABILIZATION.fetch(stabilization_key, 200) * regression_factor
      (rate * sample_size + league_mean * k) / (sample_size + k)
    end

    # -------------------------------------------------------------------------
    # Age adjustment multiplier relative to peak age.
    # Returns a hash of per-component multipliers.
    # stat_categories: :power, :contact, :speed, :command, :overall
    # -------------------------------------------------------------------------
    def age_multipliers(player_age, age_curve_factor: 1.0)
      {
        power:   age_delta(player_age, peak: 28, rates: { under: 0.005, early: -0.005, mid: -0.010, late: -0.015 }, factor: age_curve_factor),
        contact: age_delta(player_age, peak: 28, rates: { under: 0.003, early: -0.003, mid: -0.007, late: -0.012 }, factor: age_curve_factor),
        speed:   age_delta(player_age, peak: 24, rates: { under: 0.008, early: -0.010, mid: -0.018, late: -0.025 }, factor: age_curve_factor),
        command: age_delta(player_age, peak: 27, rates: { under: 0.004, early: -0.004, mid: -0.009, late: -0.014 }, factor: age_curve_factor),
      }
    end

    # -------------------------------------------------------------------------
    # Apply age multipliers to batter components.
    # components: { bb_pct:, k_pct:, babip:, iso:, hr_fb_pct:, fb_pct: }
    # -------------------------------------------------------------------------
    def apply_batter_age_curve(components, player_age, age_curve_factor: 1.0)
      mults = age_multipliers(player_age, age_curve_factor:)
      components.merge(
        iso:       components[:iso]       * (1 + mults[:power]),
        hr_fb_pct: components[:hr_fb_pct] * (1 + mults[:power]),
        babip:     components[:babip]     * (1 + mults[:contact]),
        k_pct:     components[:k_pct]     * (1 - mults[:contact]),  # contact improves → K% drops
        bb_pct:    components[:bb_pct]    * (1 + mults[:command]),
      )
    end

    # -------------------------------------------------------------------------
    # Apply age multipliers to pitcher components.
    # components: { k_pct:, bb_pct:, hr_fb_pct:, babip:, gb_pct: }
    # -------------------------------------------------------------------------
    def apply_pitcher_age_curve(components, player_age, age_curve_factor: 1.0)
      # Pitchers peak earlier than batters (26 vs 28), so we use separate multipliers
      pm = age_multipliers_pitcher(player_age, age_curve_factor:)
      components.merge(
        k_pct:     components[:k_pct]     * (1 + pm[:stuff]),
        bb_pct:    components[:bb_pct]    * (1 - pm[:command]),
        hr_fb_pct: components[:hr_fb_pct] * (1 + pm[:power_allowed]),
      )
    end

    # -------------------------------------------------------------------------
    # Derive full batter stat line from component rates.
    # components: { bb_pct:, k_pct:, babip:, iso:, hr_fb_pct:, fb_pct:, hbp_pct:, pa: }
    # Returns hash of projected counting + rate stats.
    # -------------------------------------------------------------------------
    def derive_batter_stats(components)
      pa         = components[:pa].to_f
      bb_pct     = components[:bb_pct].to_f
      k_pct      = components[:k_pct].to_f
      babip      = components[:babip].to_f
      iso        = components[:iso].to_f
      hr_fb_pct  = components[:hr_fb_pct].to_f
      fb_pct     = components[:fb_pct].to_f
      hbp_pct    = components.fetch(:hbp_pct, 0.010).to_f

      # Clamp to sane ranges
      bb_pct    = bb_pct.clamp(0.03, 0.25)
      k_pct     = k_pct.clamp(0.05, 0.40)
      babip     = babip.clamp(0.200, 0.420)
      iso       = iso.clamp(0.020, 0.350)
      hr_fb_pct = hr_fb_pct.clamp(0.02, 0.35)
      fb_pct    = fb_pct.clamp(0.20, 0.55)

      # Rate of plate appearances that result in a ball in play (not BB, K, or HBP)
      balls_in_play_rate = (1 - bb_pct - k_pct - hbp_pct).clamp(0.35, 0.85)

      # Home run rate per PA: HR/FB% × fly ball rate × BIP rate
      hr_per_pa = hr_fb_pct * fb_pct * balls_in_play_rate

      # Non-HR hits that land in play (BABIP applies only to non-HR batted balls)
      in_play_hit_rate = babip * balls_in_play_rate * (1 - hr_fb_pct * fb_pct)

      # Hit breakdown: singles/doubles/triples share of non-HR in-play hits
      hit_rate    = in_play_hit_rate + hr_per_pa
      single_rate = in_play_hit_rate * SINGLE_RATE_OF_IN_PLAY_HITS
      double_rate = in_play_hit_rate * DOUBLE_RATE_OF_IN_PLAY_HITS
      triple_rate = in_play_hit_rate * TRIPLE_RATE_OF_IN_PLAY_HITS

      # AVG = hits / AB (not hits / PA); AB ≈ PA − BB − HBP
      at_bat_rate = (1 - bb_pct - hbp_pct).clamp(0.60, 0.95)
      avg = (hit_rate / at_bat_rate).clamp(0.100, 0.400)
      # OBP numerator is hits+BB+HBP per PA — use hit_rate, not avg
      obp = (hit_rate + bb_pct + hbp_pct).clamp(0.200, 0.500)
      slg = (avg + iso).clamp(0.200, 0.750)
      ops = obp + slg

      # wOBA
      woba = (
        WOBA_WEIGHTS[:ubb]    * (bb_pct     * pa) +
        WOBA_WEIGHTS[:hbp]    * (hbp_pct    * pa) +
        WOBA_WEIGHTS[:single] * (single_rate * pa) +
        WOBA_WEIGHTS[:double] * (double_rate * pa) +
        WOBA_WEIGHTS[:triple] * (triple_rate * pa) +
        WOBA_WEIGHTS[:hr]     * (hr_per_pa   * pa)
      ) / pa

      # wRC+ (simplified; league context = 100)
      wrc_plus = ((woba - LEAGUE_WOBA) / WOBA_SCALE + LEAGUE_RC_PER_PA) / LEAGUE_RC_PER_PA * 100

      # Counting stats
      projected_hr   = (hr_per_pa   * pa).round
      projected_bb   = (bb_pct      * pa).round
      projected_hits = (hit_rate     * pa).round
      projected_ab   = (pa - projected_bb - hbp_pct * pa).round
      projected_runs = (wrc_plus / 100.0 * pa * LEAGUE_RC_PER_PA).round
      projected_rbi  = projected_runs

      {
        pa: pa.round,
        ab: projected_ab,
        h: projected_hits,
        hr: projected_hr,
        bb: projected_bb,
        avg: avg.round(3),
        obp: obp.round(3),
        slg: slg.round(3),
        ops: ops.round(3),
        iso: iso.round(3),
        woba: woba.round(3),
        wrc_plus: wrc_plus.round(1),
        r: projected_runs,
        rbi: projected_rbi,
        k_pct: k_pct.round(3),
        bb_pct: bb_pct.round(3),
        babip: babip.round(3),
        hr_fb_pct: hr_fb_pct.round(3),
      }
    end

    # -------------------------------------------------------------------------
    # Derive full pitcher stat line from component rates.
    # components: { k_pct:, bb_pct:, hr_fb_pct:, babip:, gb_pct:, ip: }
    # -------------------------------------------------------------------------
    def derive_pitcher_stats(components)
      ip         = components[:ip].to_f
      k_pct      = components[:k_pct].to_f
      bb_pct     = components[:bb_pct].to_f
      hr_fb_pct  = components[:hr_fb_pct].to_f
      babip      = components[:babip].to_f
      gb_pct     = components[:gb_pct].to_f

      # Clamp
      k_pct     = k_pct.clamp(0.10, 0.45)
      bb_pct    = bb_pct.clamp(0.03, 0.18)
      hr_fb_pct = hr_fb_pct.clamp(0.05, 0.30)
      babip     = babip.clamp(0.240, 0.360)
      gb_pct    = gb_pct.clamp(0.30, 0.65)

      batters_faced = ip * AVG_BATTERS_FACED_PER_INNING

      # Fly ball % = everything that isn't a ground ball or line drive
      fly_ball_pct = 1 - gb_pct - ASSUMED_LINE_DRIVE_RATE
      fly_ball_pct = fly_ball_pct.clamp(0.10, 0.50)

      k_per_9  = k_pct  * AVG_BATTERS_FACED_PER_INNING * 9
      bb_per_9 = bb_pct * AVG_BATTERS_FACED_PER_INNING * 9

      # HR allowed per 9 innings: HR/FB% × fly ball rate × BF/IP
      hr_per_9 = fly_ball_pct * hr_fb_pct * AVG_BATTERS_FACED_PER_INNING * 9

      # FIP — scale per-9 values to per-inning for the formula
      hr_per_inning = hr_per_9 / 9.0
      bb_per_inning = bb_per_9 / 9.0
      k_per_inning  = k_per_9  / 9.0
      fip = (13 * hr_per_inning + 3 * bb_per_inning - 2 * k_per_inning) + FIP_CONSTANT

      # xFIP normalizes HR/FB% to a league-average rate, removing the pitcher's luck on HR
      xfip_hr_per_inning = fly_ball_pct * XFIP_NORMALIZING_HR_FB_PCT * AVG_BATTERS_FACED_PER_INNING
      xfip = (13 * xfip_hr_per_inning + 3 * bb_per_inning - 2 * k_per_inning) + FIP_CONSTANT

      # ERA — BABIP applies only to true balls in play (exclude BB, K, HR)
      hr_rate_per_bf       = fly_ball_pct * hr_fb_pct
      true_bip_rate        = (1 - bb_pct - k_pct - hr_rate_per_bf).clamp(0.30, 0.70)
      hits_per_inning      = babip * true_bip_rate * AVG_BATTERS_FACED_PER_INNING
      # Anchor ERA to FIP so the BABIP component can't drift too far
      baserunners_per_inning = hits_per_inning + bb_per_inning + hr_per_inning
      babip_based_era = baserunners_per_inning * RUNS_PER_BASERUNNER * 9
      era = (babip_based_era * ERA_FIP_BLEND_WEIGHT + fip * ERA_FIP_BLEND_WEIGHT).clamp(1.50, 8.00)

      whip = (hits_per_inning + bb_per_inning).round(2)

      projected_strikeouts   = (k_pct  * batters_faced).round
      projected_walks        = (bb_pct * batters_faced).round
      projected_home_runs    = (hr_per_9 / 9.0 * ip).round

      {
        ip: ip.round(1),
        era: era.clamp(1.50, 8.00).round(2),
        fip: fip.clamp(1.50, 8.00).round(2),
        xfip: xfip.clamp(1.50, 8.00).round(2),
        whip: whip,
        k9: k_per_9.round(2),
        bb9: bb_per_9.round(2),
        k_pct: k_pct.round(3),
        bb_pct: bb_pct.round(3),
        hr9: hr_per_9.round(2),
        babip: babip.round(3),
        gb_pct: gb_pct.round(3),
        ks: projected_strikeouts,
        bbs: projected_walks,
        hrs: projected_home_runs,
      }
    end

    private

    def age_delta(player_age, peak:, rates:, factor:)
      years_from_peak = player_age - peak
      rate = if years_from_peak < -3
        rates[:under]           # still developing
      elsif years_from_peak < 0
        rates[:under]
      elsif years_from_peak < 3
        rates[:early]           # just past peak
      elsif years_from_peak < 7
        rates[:mid]             # mid decline
      else
        rates[:late]            # steep decline
      end

      delta = rate * years_from_peak.abs * factor
      # Cap total adjustment at ±15%
      delta.clamp(-0.15, 0.15)
    end

    def age_multipliers_pitcher(player_age, age_curve_factor: 1.0)
      {
        stuff:         age_delta(player_age, peak: 26, rates: { under: 0.005, early: -0.008, mid: -0.012, late: -0.018 }, factor: age_curve_factor),
        command:       age_delta(player_age, peak: 27, rates: { under: 0.004, early: -0.004, mid: -0.009, late: -0.014 }, factor: age_curve_factor),
        power_allowed: age_delta(player_age, peak: 26, rates: { under: -0.003, early: 0.005, mid: 0.010, late: 0.015 }, factor: age_curve_factor),
      }
    end
  end
end
