class GameSimulationEngine
  def self.league_avg_batter
    constants = LeagueConstantsService.batter
    {
      k_pct:     constants["k_pct"],
      bb_pct:    constants["bb_pct"],
      hbp_pct:   constants["hbp_pct"],
      hr_fb_pct: constants["hr_fb_pct"],
      fb_pct:    constants["fb_pct"],
      gb_pct:    constants["gb_pct"],
      babip:     constants["babip"],
      pull_pct:  constants["pull_pct"],
      cent_pct:  constants["cent_pct"],
      oppo_pct:  constants["oppo_pct"],
    }
  end

  def self.league_avg_reliever
    constants = LeagueConstantsService.pitcher_reliever
    {
      k_pct:     constants["k_pct"],
      bb_pct:    constants["bb_pct"],
      hr_fb_pct: constants["hr_fb_pct"],
      gb_pct:    constants["gb_pct"],
      fb_pct:    constants["fb_pct"],
      babip:     constants["babip"],
    }
  end

  SP_MAX_BF            = 27   # ~5-6 IP before considering bullpen
  MAX_ER_BEFORE_RELIEF = 5    # starter or reliever blown up — go to the pen
  RP_MAX_BF            = 5    # ~1 inning per reliever appearance

  # Assumed line-drive rate when a pitcher's fb_pct is unknown.
  # Used to derive fly-ball% from ground-ball%: fb ≈ 1 - gb - ld.
  ASSUMED_LD_PCT = 0.10

  # Baserunner advancement probabilities
  SINGLE_SCORE_FROM_2B = 0.60
  SINGLE_ADV_1B_TO_3B  = 0.30
  DOUBLE_SCORE_FROM_1B = 0.45
  SAC_FLY_PROB         = 0.25
  DP_PROB              = 0.35

  # Hit type distribution (cumulative, of non-HR BABIP hits)
  SINGLE_CUM = 0.77
  DOUBLE_CUM = 0.97

  GROUND_BALL_OUT_PROB = 0.55

  MAX_INNINGS = 15

  class << self
    # -------------------------------------------------------------------------
    # Main entry point.
    # home_lineup / away_lineup: Array of { player_id:, name:, rates: {} }
    # home_pitchers / away_pitchers: Array with SP first, relievers following
    # blend: fraction of outcome credited to batter (0.45 = pitcher-leaning)
    # -------------------------------------------------------------------------
    def simulate_game(home_lineup:, away_lineup:, home_pitchers:, away_pitchers:, blend: 0.45, home_roles: {}, away_roles: {}, config: {})
      batter_stats  = {}
      pitcher_stats = {}

      all_batters  = home_lineup + away_lineup
      all_pitchers = home_pitchers + away_pitchers
      init_stats(all_batters, batter_stats, :batter)
      init_stats(all_pitchers, pitcher_stats, :pitcher)

      home_bat_pos   = 0
      away_bat_pos   = 0
      home_pitch_idx = 0
      away_pitch_idx = 0
      home_score     = 0
      away_score     = 0
      linescore      = []

      (1..MAX_INNINGS).each do |inning|
        # --- Top half: away bats vs current home pitcher ---
        home_pitcher = home_pitchers[home_pitch_idx] || fallback_pitcher
        pitcher_stats[home_pitcher[:player_id]] ||= blank_pitcher_stat

        away_runs, away_bat_pos = simulate_half_inning(
          lineup:        away_lineup,
          pitcher:       home_pitcher,
          bat_pos:       away_bat_pos,
          batter_stats:  batter_stats,
          pitcher_stats: pitcher_stats,
          blend:         blend,
          config:        config
        )
        away_score += away_runs
        home_pitch_idx = maybe_pull_pitcher(
          home_pitchers, home_pitch_idx, pitcher_stats,
          inning: inning, score_diff: home_score - away_score, roles: home_roles
        )

        # --- Bottom half: home bats vs current away pitcher ---
        # Walk-off eligible: skip bottom of inning if home team already leads after the 9th
        home_runs = 0
        unless inning >= 9 && home_score > away_score
          away_pitcher = away_pitchers[away_pitch_idx] || fallback_pitcher
          pitcher_stats[away_pitcher[:player_id]] ||= blank_pitcher_stat

          home_runs, home_bat_pos = simulate_half_inning(
            lineup:        home_lineup,
            pitcher:       away_pitcher,
            bat_pos:       home_bat_pos,
            batter_stats:  batter_stats,
            pitcher_stats: pitcher_stats,
            blend:         blend,
            config:        config
          )
          home_score += home_runs
          away_pitch_idx = maybe_pull_pitcher(
            away_pitchers, away_pitch_idx, pitcher_stats,
            inning: inning, score_diff: away_score - home_score, roles: away_roles
          )
        end

        linescore << [away_runs, home_runs]

        break if inning >= 9 && home_score != away_score
      end

      assign_decisions(home_pitchers, away_pitchers, pitcher_stats, home_score, away_score)

      {
        home_score:    home_score,
        away_score:    away_score,
        linescore:     linescore,
        batter_stats:  batter_stats,
        pitcher_stats: pitcher_stats,
      }
    end

    private

    def simulate_half_inning(lineup:, pitcher:, bat_pos:, batter_stats:, pitcher_stats:, blend:, config: {})
      outs       = 0
      bases      = [nil, nil, nil]
      runs       = 0
      lineup_pos = bat_pos

      pitcher_id    = pitcher[:player_id]
      pitcher_rates = pitcher[:rates] || league_avg_reliever
      pitcher_stats[pitcher_id] ||= blank_pitcher_stat

      while outs < 3
        batter = lineup[lineup_pos % lineup.size]
        lineup_pos += 1
        batter_id    = batter[:player_id]
        batter_rates = batter[:rates] || league_avg_batter
        batter_stats[batter_id] ||= blank_batter_stat

        outcome = simulate_pa(batter_rates, pitcher_rates, blend, config)
        pitcher_stats[pitcher_id][:bf] += 1

        case outcome
        when :walk
          batter_stats[batter_id][:bb] += 1
          scored, bases, scorers = apply_walk(bases, batter_id)
          runs += scored
          credit_scorers(batter_stats, scorers)
          pitcher_stats[pitcher_id][:bb] += 1
          pitcher_stats[pitcher_id][:er] += scored

        when :hbp
          batter_stats[batter_id][:hbp] += 1
          scored, bases, scorers = apply_walk(bases, batter_id)
          runs += scored
          credit_scorers(batter_stats, scorers)
          pitcher_stats[pitcher_id][:er] += scored

        when :strikeout
          batter_stats[batter_id][:ab] += 1
          batter_stats[batter_id][:k]  += 1
          pitcher_stats[pitcher_id][:k]    += 1
          pitcher_stats[pitcher_id][:outs] += 1
          outs += 1

        when :home_run
          batter_stats[batter_id][:ab]  += 1
          batter_stats[batter_id][:h]   += 1
          batter_stats[batter_id][:hr]  += 1
          scored = 1 + bases.count { |b| b }
          batter_stats[batter_id][:rbi] += scored
          batter_stats[batter_id][:r]   += 1
          credit_scorers(batter_stats, bases.compact)
          runs += scored
          pitcher_stats[pitcher_id][:h]  += 1
          pitcher_stats[pitcher_id][:hr] += 1
          pitcher_stats[pitcher_id][:er] += scored
          bases = [nil, nil, nil]

        when :single
          batter_stats[batter_id][:ab] += 1
          batter_stats[batter_id][:h]  += 1
          scored, rbis, bases, scorers = apply_single(bases, batter_id)
          batter_stats[batter_id][:rbi] += rbis
          runs += scored
          credit_scorers(batter_stats, scorers)
          pitcher_stats[pitcher_id][:h]  += 1
          pitcher_stats[pitcher_id][:er] += scored

        when :double
          batter_stats[batter_id][:ab]     += 1
          batter_stats[batter_id][:h]      += 1
          batter_stats[batter_id][:double] += 1
          scored, rbis, bases, scorers = apply_double(bases, batter_id)
          batter_stats[batter_id][:rbi] += rbis
          runs += scored
          credit_scorers(batter_stats, scorers)
          pitcher_stats[pitcher_id][:h]  += 1
          pitcher_stats[pitcher_id][:er] += scored

        when :triple
          batter_stats[batter_id][:ab]     += 1
          batter_stats[batter_id][:h]      += 1
          batter_stats[batter_id][:triple] += 1
          scorers = bases.compact
          scored  = scorers.size
          batter_stats[batter_id][:rbi] += scored
          runs += scored
          credit_scorers(batter_stats, scorers)
          pitcher_stats[pitcher_id][:h]  += 1
          pitcher_stats[pitcher_id][:er] += scored
          bases = [nil, nil, batter_id]

        when :ground_out
          batter_stats[batter_id][:ab]       += 1
          pitcher_stats[pitcher_id][:outs]   += 1
          outs += 1
          if bases[0] && outs < 3 && rand < DP_PROB
            pitcher_stats[pitcher_id][:outs] += 1
            outs += 1
            bases[0] = nil
          end

        when :fly_out
          batter_stats[batter_id][:ab]     += 1
          pitcher_stats[pitcher_id][:outs] += 1
          outs += 1
          if bases[2] && rand < SAC_FLY_PROB
            scorer = bases[2]
            batter_stats[batter_id][:ab]  -= 1
            batter_stats[batter_id][:sf]  += 1
            batter_stats[batter_id][:rbi] += 1
            batter_stats[scorer][:r]      += 1 if batter_stats.key?(scorer)
            runs += 1
            pitcher_stats[pitcher_id][:er] += 1
            bases[2] = nil
          end
        end
      end

      [runs, lineup_pos % lineup.size]
    end

    def simulate_pa(batter_rates, pitcher_rates, blend, config = {})
      batter_weight  = blend.to_f.clamp(0.0, 1.0)
      pitcher_weight = 1.0 - batter_weight
      league_batter  = league_avg_batter
      league_pitcher = league_avg_reliever

      # Blends a rate key from batter/pitcher projections against league-average defaults
      blended = ->(key) {
        rate_for(batter_rates, key, league_batter)  * batter_weight +
        rate_for(pitcher_rates, key, league_pitcher) * pitcher_weight
      }

      run_environment = (config["run_environment"] || 1.0).to_f.clamp(0.5, 2.0)
      hr_environment  = (config["hr_environment"]  || 1.0).to_f.clamp(0.3, 3.0)

      bb_pct    = clamp(blended.call(:bb_pct),    0.03, 0.20)
      hbp_pct   = rate_for(batter_rates, :hbp_pct, league_batter).to_f
      k_pct     = clamp(blended.call(:k_pct),     0.05, 0.38)
      babip     = clamp(blended.call(:babip),      0.200, 0.380) * run_environment
      hr_fb_pct = clamp(blended.call(:hr_fb_pct),  0.02, 0.32)  * hr_environment
      fb_pct    = clamp(
        rate_for(batter_rates, :fb_pct, league_batter)        * batter_weight +
        pitcher_fly_ball_pct(pitcher_rates, league_pitcher)   * pitcher_weight,
        0.20, 0.55
      )

      bip_rate = [1.0 - bb_pct - hbp_pct - k_pct, 0.10].max
      hr_rate  = hr_fb_pct * fb_pct * bip_rate
      hit_rate = babip * (bip_rate - hr_rate)

      roll      = rand
      threshold = 0.0
      threshold += bb_pct;   return :walk      if roll < threshold
      threshold += hbp_pct;  return :hbp       if roll < threshold
      threshold += k_pct;    return :strikeout if roll < threshold
      threshold += hr_rate;  return :home_run  if roll < threshold
      threshold += hit_rate
      if roll < threshold
        hit_type_roll = rand
        return :single if hit_type_roll < SINGLE_CUM
        return :double if hit_type_roll < DOUBLE_CUM
        return :triple
      end

      rand < GROUND_BALL_OUT_PROB ? :ground_out : :fly_out
    end

    def apply_walk(bases, batter_id)
      runs    = 0
      scorers = []
      if bases[0] && bases[1] && bases[2]
        runs    = 1
        scorers = [bases[2]]
        bases   = [batter_id, bases[0], bases[1]]
      elsif bases[0] && bases[1]
        bases = [batter_id, bases[0], bases[1]]
      elsif bases[0]
        bases = [batter_id, bases[0], bases[2]]
      else
        bases = [batter_id, bases[1], bases[2]]
      end
      [runs, bases, scorers]
    end

    def apply_single(bases, batter_id)
      runs      = 0
      rbis      = 0
      scorers   = []
      new_first = batter_id
      new_two   = nil
      new_three = nil

      if bases[2];  runs += 1; rbis += 1; scorers << bases[2]; end

      if bases[1]
        if rand < SINGLE_SCORE_FROM_2B;  runs += 1; rbis += 1; scorers << bases[1]
        else;                             new_three = bases[1]
        end
      end

      if bases[0]
        if rand < SINGLE_ADV_1B_TO_3B && new_three.nil?;  new_three = bases[0]
        else;                                               new_two   = bases[0]
        end
      end

      [runs, rbis, [new_first, new_two, new_three], scorers]
    end

    def apply_double(bases, batter_id)
      runs      = 0
      rbis      = 0
      scorers   = []
      new_three = nil

      if bases[2];  runs += 1; rbis += 1; scorers << bases[2]; end
      if bases[1];  runs += 1; rbis += 1; scorers << bases[1]; end

      if bases[0]
        if rand < DOUBLE_SCORE_FROM_1B;  runs += 1; rbis += 1; scorers << bases[0]
        else;                             new_three = bases[0]
        end
      end

      [runs, rbis, [nil, batter_id, new_three], scorers]
    end

    # Assign W/L/SV to pitchers based on game result
    def assign_decisions(home_pitchers, away_pitchers, pitcher_stats, home_score, away_score)
      winning_pitchers = home_score > away_score ? home_pitchers : away_pitchers
      losing_pitchers  = home_score > away_score ? away_pitchers : home_pitchers

      # Win goes to pitcher who was pitching when winning team took the lead (simplified: last SP or first RP who held the lead)
      wp = winning_pitchers.find { |p| pitcher_stats[p[:player_id]]&.dig(:outs).to_i >= 3 } || winning_pitchers.first
      lp = losing_pitchers.first

      pitcher_stats[wp[:player_id]][:decision] = "W" if wp
      pitcher_stats[lp[:player_id]][:decision] = "L" if lp

      # Save: last reliever for winning team if not the pitcher of record
      last_rp = winning_pitchers.reverse.find { |p| pitcher_stats[p[:player_id]]&.dig(:outs).to_i > 0 }
      if last_rp && last_rp[:player_id] != wp&.dig(:player_id)
        pitcher_stats[last_rp[:player_id]][:decision] = "S"
      end
    end

    def maybe_pull_pitcher(pitchers, idx, pitcher_stats, inning: 1, score_diff: 0, roles: {})
      return idx if idx >= pitchers.size - 1

      current_pitcher_stat = pitcher_stats[pitchers[idx][:player_id]]
      return idx unless current_pitcher_stat

      max_bf      = idx == 0 ? SP_MAX_BF : RP_MAX_BF
      should_pull = current_pitcher_stat[:bf] >= max_bf ||
                    current_pitcher_stat[:er] >= MAX_ER_BEFORE_RELIEF
      return idx unless should_pull

      # Role-based selection: closer in 9th with lead, setup in 7th-8th, long relief early
      next_idx = role_based_next(pitchers, idx, inning, score_diff, roles) || idx + 1
      next_idx = next_idx.clamp(idx + 1, pitchers.size - 1)
      pitcher_stats[pitchers[next_idx][:player_id]] ||= blank_pitcher_stat if pitchers[next_idx]
      next_idx
    end

    def role_based_next(pitchers, current_idx, inning, score_diff, roles)
      return nil if roles.nil? || roles.empty?

      target_id = if inning >= 9 && score_diff > 0 && roles[:closer_id]
                    roles[:closer_id]
                  elsif inning >= 7 && roles[:setup_ids]&.any?
                    roles[:setup_ids].find { |id| pitcher_available?(pitchers, id, current_idx) }
                  elsif inning <= 6 && roles[:long_ids]&.any?
                    roles[:long_ids].find { |id| pitcher_available?(pitchers, id, current_idx) }
                  end

      return nil unless target_id
      pitchers.index { |p| p[:player_id].to_i == target_id.to_i && pitchers.index(p) > current_idx }
    end

    def pitcher_available?(pitchers, player_id, after_idx)
      pitchers.index { |p| p[:player_id].to_i == player_id.to_i }&.then { |i| i > after_idx }
    end

    def init_stats(players, stats_hash, type)
      players.each do |p|
        stats_hash[p[:player_id]] ||= (type == :batter ? blank_batter_stat : blank_pitcher_stat)
      end
    end

    def blank_batter_stat
      { ab: 0, h: 0, hr: 0, rbi: 0, bb: 0, k: 0, r: 0, double: 0, triple: 0, hbp: 0, sf: 0 }
    end

    def blank_pitcher_stat
      { bf: 0, outs: 0, h: 0, er: 0, bb: 0, k: 0, hr: 0, decision: nil }
    end

    def fallback_pitcher
      { player_id: :league_avg_rp, name: "Bullpen", rates: league_avg_reliever }
    end

    def credit_scorers(batter_stats, scorers)
      scorers.each { |id| batter_stats[id][:r] += 1 if batter_stats.key?(id) }
    end

    def rate_for(rates, key, defaults)
      rates[key]&.to_f || defaults[key].to_f
    end

    def pitcher_fly_ball_pct(rates, defaults)
      rates[:fb_pct]&.to_f ||
        (1.0 - (rates[:gb_pct] || defaults[:gb_pct]).to_f - ASSUMED_LD_PCT).clamp(0.20, 0.55)
    end

    def clamp(val, min, max)
      [[val.to_f, min].max, max].min
    end
  end
end
