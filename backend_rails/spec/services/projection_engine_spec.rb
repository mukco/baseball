require "rails_helper"

RSpec.describe ProjectionEngine do
  # -----------------------------------------------------------------------
  # weighted_average
  # -----------------------------------------------------------------------
  describe ".weighted_average" do
    let(:year_weights) { { 0 => 5, 1 => 4, 2 => 3 } }

    it "computes PA-weighted, year-weighted average across seasons" do
      history = [
        { pa: 600, k_pct: 0.20 },
        { pa: 500, k_pct: 0.22 },
        { pa: 400, k_pct: 0.24 },
      ]
      result = described_class.weighted_average(history, year_weights, :k_pct)
      expect(result).to be_within(0.001).of(
        (600 * 5 * 0.20 + 500 * 4 * 0.22 + 400 * 3 * 0.24) /
        (600 * 5.0 + 500 * 4.0 + 400 * 3.0)
      )
    end

    it "returns nil when all history entries are missing the stat" do
      history = [{ pa: 600 }, { pa: 500 }]
      expect(described_class.weighted_average(history, year_weights, :k_pct)).to be_nil
    end

    it "ignores seasons with zero weight" do
      history = [{ pa: 600, k_pct: 0.20 }, { pa: 500, k_pct: 0.22 }]
      weights = { 0 => 5, 1 => 0 }
      result = described_class.weighted_average(history, weights, :k_pct)
      expect(result).to be_within(0.001).of(0.20)
    end
  end

  # -----------------------------------------------------------------------
  # regress_to_mean
  # -----------------------------------------------------------------------
  describe ".regress_to_mean" do
    it "returns league mean when rate is nil" do
      result = described_class.regress_to_mean(nil, 500, 0.225, :k_pct_batter)
      expect(result).to eq(0.225)
    end

    it "regresses a small sample strongly toward the mean" do
      small = described_class.regress_to_mean(0.100, 10, 0.225, :k_pct_batter)
      large = described_class.regress_to_mean(0.100, 600, 0.225, :k_pct_batter)
      expect(small).to be > large
    end

    it "is stable at large sample sizes" do
      result = described_class.regress_to_mean(0.150, 2000, 0.225, :k_pct_batter)
      expect(result).to be_within(0.005).of(0.150)
    end

    it "respects the regression_factor multiplier" do
      base   = described_class.regress_to_mean(0.100, 300, 0.225, :k_pct_batter, regression_factor: 1.0)
      higher = described_class.regress_to_mean(0.100, 300, 0.225, :k_pct_batter, regression_factor: 2.0)
      expect(higher).to be > base
    end
  end

  # -----------------------------------------------------------------------
  # age_multipliers
  # -----------------------------------------------------------------------
  describe ".age_multipliers" do
    it "returns a hash with power, contact, speed, command keys" do
      mults = described_class.age_multipliers(28)
      expect(mults.keys).to contain_exactly(:power, :contact, :speed, :command)
    end

    it "applies negative adjustments for players past peak" do
      young = described_class.age_multipliers(24)
      old   = described_class.age_multipliers(35)
      expect(old[:power]).to be < young[:power]
    end

    it "caps adjustments at ±15%" do
      mults = described_class.age_multipliers(45)
      mults.each_value { |v| expect(v.abs).to be <= 0.15 }
    end
  end

  # -----------------------------------------------------------------------
  # derive_batter_stats
  # -----------------------------------------------------------------------
  describe ".derive_batter_stats" do
    let(:components) do
      {
        bb_pct: 0.090, k_pct: 0.220, babip: 0.300,
        iso: 0.160, hr_fb_pct: 0.130, fb_pct: 0.360,
        hbp_pct: 0.010, pa: 600
      }
    end

    subject(:stats) { described_class.derive_batter_stats(components) }

    it "returns a hash with expected keys" do
      expect(stats.keys).to include(:pa, :hr, :avg, :obp, :slg, :ops, :woba, :wrc_plus, :k_pct, :bb_pct)
    end

    it "avg is between 0.100 and 0.400" do
      expect(stats[:avg]).to be_between(0.100, 0.400)
    end

    it "obp >= avg (walks + hbp push it up)" do
      expect(stats[:obp]).to be >= stats[:avg]
    end

    it "slg >= avg (extra-base hits push it up)" do
      expect(stats[:slg]).to be >= stats[:avg]
    end

    it "ops = obp + slg" do
      expect(stats[:ops]).to be_within(0.002).of(stats[:obp] + stats[:slg])
    end

    it "wrc_plus is near 100 for league-average inputs" do
      expect(stats[:wrc_plus]).to be_within(15).of(100)
    end

    it "higher ISO produces higher HR count" do
      power_comps = components.merge(iso: 0.280, hr_fb_pct: 0.250)
      low_comps   = components.merge(iso: 0.050, hr_fb_pct: 0.040)
      high_hr = described_class.derive_batter_stats(power_comps)[:hr]
      low_hr  = described_class.derive_batter_stats(low_comps)[:hr]
      expect(high_hr).to be > low_hr
    end
  end

  # -----------------------------------------------------------------------
  # derive_pitcher_stats
  # -----------------------------------------------------------------------
  describe ".derive_pitcher_stats" do
    let(:components) do
      {
        k_pct: 0.245, bb_pct: 0.075, hr_fb_pct: 0.105,
        babip: 0.295, gb_pct: 0.440, ip: 180
      }
    end

    subject(:stats) { described_class.derive_pitcher_stats(components) }

    it "returns a hash with expected keys" do
      expect(stats.keys).to include(:ip, :era, :fip, :xfip, :whip, :k9, :bb9, :ks, :bbs)
    end

    it "ERA is within realistic bounds (1.50–8.00)" do
      expect(stats[:era]).to be_between(1.50, 8.00)
    end

    it "FIP is within realistic bounds" do
      expect(stats[:fip]).to be_between(1.50, 8.00)
    end

    it "higher K% produces higher K/9" do
      elite = described_class.derive_pitcher_stats(components.merge(k_pct: 0.35))
      below = described_class.derive_pitcher_stats(components.merge(k_pct: 0.15))
      expect(elite[:k9]).to be > below[:k9]
    end

    it "higher BB% produces higher BB/9" do
      wild     = described_class.derive_pitcher_stats(components.merge(bb_pct: 0.15))
      accurate = described_class.derive_pitcher_stats(components.merge(bb_pct: 0.04))
      expect(wild[:bb9]).to be > accurate[:bb9]
    end

    it "strikeout count is positive for a 180-IP pitcher" do
      expect(stats[:ks]).to be > 0
    end
  end

  # -----------------------------------------------------------------------
  # apply_batter_age_curve
  # -----------------------------------------------------------------------
  describe ".apply_batter_age_curve" do
    let(:components) do
      { bb_pct: 0.09, k_pct: 0.22, babip: 0.300, iso: 0.160,
        hr_fb_pct: 0.130, fb_pct: 0.360 }
    end

    it "returns a hash with the same keys as input" do
      result = described_class.apply_batter_age_curve(components, 30)
      expect(result.keys).to match_array(components.keys)
    end

    it "reduces ISO for an aging player (35) vs. a young one (25)" do
      young = described_class.apply_batter_age_curve(components, 25)[:iso]
      old   = described_class.apply_batter_age_curve(components, 35)[:iso]
      expect(old).to be < young
    end
  end
end
