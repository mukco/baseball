require "rails_helper"

RSpec.describe GameSimulationEngine do
  # Helpers to build minimal player structs
  def batter(id, rates = {})
    { player_id: id, name: "Player #{id}", rates: rates }
  end

  def pitcher(id, rates = {})
    { player_id: id, name: "Pitcher #{id}", rates: rates }
  end

  def lineup(ids, rates = {})
    ids.map { |id| batter(id, rates) }
  end

  def rotation(ids, rates = {})
    ids.map { |id| pitcher(id, rates) }
  end

  # Run N plate appearances with fixed rates and return outcome tallies
  def sample_outcomes(batter_rates, pitcher_rates, blend, n: 2000)
    outcomes = Hash.new(0)
    n.times do
      outcomes[described_class.send(:simulate_pa, batter_rates, pitcher_rates, blend)] += 1
    end
    outcomes
  end

  # -----------------------------------------------------------------------
  # simulate_pa
  # -----------------------------------------------------------------------
  describe ".simulate_pa (private)" do
    let(:avg_batter)  { {} }   # triggers LEAGUE_AVG_BATTER fallback
    let(:avg_pitcher) { {} }   # triggers LEAGUE_AVG_RELIEVER fallback
    let(:blend)       { 0.5 }

    it "returns only valid outcome symbols" do
      valid = %i[walk hbp strikeout home_run single double triple ground_out fly_out]
      1000.times do
        outcome = described_class.send(:simulate_pa, avg_batter, avg_pitcher, blend)
        expect(valid).to include(outcome)
      end
    end

    it "produces more walks with high bb_pct than with the league average" do
      high = sample_outcomes({ bb_pct: 0.20 }, avg_pitcher, 1.0)
      low  = sample_outcomes({ bb_pct: 0.03 }, avg_pitcher, 1.0)
      expect(high[:walk]).to be > low[:walk]
    end

    it "produces more strikeouts with high k_pct than with the league average" do
      high = sample_outcomes({ bb_pct: 0.05, k_pct: 0.38 }, avg_pitcher, 1.0)
      low  = sample_outcomes({ bb_pct: 0.05, k_pct: 0.05 }, avg_pitcher, 1.0)
      expect(high[:strikeout]).to be > low[:strikeout]
    end

    it "produces more home runs when hr_fb_pct and fb_pct are both high" do
      power  = sample_outcomes({ hr_fb_pct: 0.40, fb_pct: 0.55, bb_pct: 0.0, k_pct: 0.0 }, avg_pitcher, 1.0)
      weak   = sample_outcomes({ hr_fb_pct: 0.02, fb_pct: 0.20, bb_pct: 0.0, k_pct: 0.0 }, avg_pitcher, 1.0)
      expect(power[:home_run]).to be > weak[:home_run]
    end

    it "blend=1.0 uses only batter rates; blend=0.0 uses only pitcher rates" do
      batter_rates  = { bb_pct: 0.20, k_pct: 0.10 }
      pitcher_rates = { bb_pct: 0.05, k_pct: 0.35 }

      batter_heavy  = sample_outcomes(batter_rates, pitcher_rates, 1.0)
      pitcher_heavy = sample_outcomes(batter_rates, pitcher_rates, 0.0)

      # With batter blend=1.0, walks are driven by batter's 20% rate
      # With pitcher blend=0.0, walks are driven by pitcher's 5% rate
      expect(batter_heavy[:walk]).to be > pitcher_heavy[:walk]
      expect(pitcher_heavy[:strikeout]).to be > batter_heavy[:strikeout]
    end

    it "falls back to league averages when rates hash is empty" do
      expect {
        1000.times { described_class.send(:simulate_pa, {}, {}, 0.5) }
      }.not_to raise_error
    end
  end

  # -----------------------------------------------------------------------
  # simulate_game — output structure
  # -----------------------------------------------------------------------
  describe ".simulate_game" do
    let(:home_lineup)   { lineup((1..9).to_a) }
    let(:away_lineup)   { lineup((11..19).to_a) }
    let(:home_pitchers) { rotation([21, 22, 23]) }
    let(:away_pitchers) { rotation([31, 32, 33]) }

    subject(:result) do
      described_class.simulate_game(
        home_lineup:   home_lineup,
        away_lineup:   away_lineup,
        home_pitchers: home_pitchers,
        away_pitchers: away_pitchers,
        blend:         0.45
      )
    end

    it "returns a hash with the expected top-level keys" do
      expect(result.keys).to contain_exactly(
        :home_score, :away_score, :linescore, :batter_stats, :pitcher_stats
      )
    end

    it "scores are non-negative integers" do
      expect(result[:home_score]).to be >= 0
      expect(result[:away_score]).to be >= 0
    end

    it "linescore has at least 9 entries (one per inning)" do
      expect(result[:linescore].size).to be >= 9
    end

    it "linescore entries are [away_runs, home_runs] pairs of non-negative integers" do
      result[:linescore].each do |away_r, home_r|
        expect(away_r).to be_an(Integer).and be >= 0
        expect(home_r).to be_an(Integer).and be >= 0
      end
    end

    it "total linescore runs equal reported scores" do
      away_total = result[:linescore].sum { |a, _| a }
      home_total = result[:linescore].sum { |_, h| h }
      expect(away_total).to eq(result[:away_score])
      expect(home_total).to eq(result[:home_score])
    end

    it "batter_stats contains entries for all batters" do
      all_batter_ids = (home_lineup + away_lineup).map { |p| p[:player_id] }
      expect(result[:batter_stats].keys).to include(*all_batter_ids)
    end

    it "pitcher_stats contains entries for pitchers who appeared" do
      all_pitcher_ids = (home_pitchers + away_pitchers).map { |p| p[:player_id] }
      appeared = result[:pitcher_stats].keys
      expect(all_pitcher_ids).to include(*appeared)
    end

    it "each batter stat entry has the expected stat keys" do
      result[:batter_stats].each_value do |s|
        expect(s.keys).to include(:ab, :h, :hr, :rbi, :bb, :k, :r, :double, :triple, :hbp, :sf)
      end
    end

    it "each pitcher stat entry has the expected stat keys" do
      result[:pitcher_stats].each_value do |s|
        expect(s.keys).to include(:bf, :outs, :h, :er, :bb, :k, :hr, :decision)
      end
    end

    it "game does not end in a tie (some runs will differ in most games)" do
      results = 20.times.map do
        described_class.simulate_game(
          home_lineup: home_lineup, away_lineup: away_lineup,
          home_pitchers: home_pitchers, away_pitchers: away_pitchers,
          blend: 0.45
        )
      end
      tied = results.count { |r| r[:home_score] == r[:away_score] }
      expect(tied).to be < 5
    end

    context "with league-average fallback players (empty rates)" do
      let(:home_lineup)   { lineup((1..9).to_a, {}) }
      let(:away_lineup)   { lineup((11..19).to_a, {}) }
      let(:home_pitchers) { rotation([21]) }
      let(:away_pitchers) { rotation([31]) }

      it "completes without error" do
        expect { result }.not_to raise_error
      end
    end
  end

  # -----------------------------------------------------------------------
  # Walk-off mechanic
  # -----------------------------------------------------------------------
  describe ".simulate_game — walk-off / game length" do
    it "ends after exactly 9 innings when home team leads entering the 9th" do
      # Give home team an extreme advantage so they almost always win
      power_batter = { bb_pct: 0.0, k_pct: 0.0, babip: 0.400, hr_fb_pct: 0.30, fb_pct: 0.50 }
      weak_pitcher = { k_pct: 0.05, bb_pct: 0.0, hr_fb_pct: 0.30, gb_pct: 0.20, babip: 0.400 }

      results = 30.times.map do
        described_class.simulate_game(
          home_lineup:   lineup((1..9).to_a, power_batter),
          away_lineup:   lineup((11..19).to_a),
          home_pitchers: rotation([21], weak_pitcher),
          away_pitchers: rotation([31]),
          blend:         1.0
        )
      end

      # At least some should end in exactly 9 innings (home wins, walk-off not needed)
      nine_inning = results.count { |r| r[:linescore].size == 9 }
      expect(nine_inning).to be > 0
    end

    it "never exceeds MAX_INNINGS" do
      20.times do
        result = described_class.simulate_game(
          home_lineup:   lineup((1..9).to_a),
          away_lineup:   lineup((11..19).to_a),
          home_pitchers: rotation([21]),
          away_pitchers: rotation([31]),
          blend:         0.45
        )
        expect(result[:linescore].size).to be <= GameSimulationEngine::MAX_INNINGS
      end
    end
  end

  # -----------------------------------------------------------------------
  # Pitcher pull mechanics
  # -----------------------------------------------------------------------
  describe ".simulate_game — pitcher rotation" do
    it "advances to the next pitcher after the starter exceeds SP_MAX_BF" do
      results = 10.times.map do
        described_class.simulate_game(
          home_lineup:   lineup((1..9).to_a),
          away_lineup:   lineup((11..19).to_a),
          home_pitchers: rotation([21, 22, 23]),
          away_pitchers: rotation([31, 32, 33]),
          blend:         0.45
        )
      end

      # At least some games should see multiple pitchers used
      multi_pitcher_games = results.count do |r|
        r[:pitcher_stats].count { |_, s| s[:bf].to_i > 0 } > 2
      end
      expect(multi_pitcher_games).to be > 0
    end
  end

  # -----------------------------------------------------------------------
  # Win / loss / save assignment
  # -----------------------------------------------------------------------
  describe ".simulate_game — decision assignment" do
    it "assigns exactly one W and one L across all pitchers" do
      result = described_class.simulate_game(
        home_lineup:   lineup((1..9).to_a),
        away_lineup:   lineup((11..19).to_a),
        home_pitchers: rotation([21, 22]),
        away_pitchers: rotation([31, 32]),
        blend:         0.45
      )

      decisions = result[:pitcher_stats].values.map { |s| s[:decision] }.compact
      expect(decisions.count("W")).to eq(1)
      expect(decisions.count("L")).to eq(1)
    end

    it "does not assign a save to the winning pitcher of record" do
      result = described_class.simulate_game(
        home_lineup:   lineup((1..9).to_a),
        away_lineup:   lineup((11..19).to_a),
        home_pitchers: rotation([21, 22, 23]),
        away_pitchers: rotation([31, 32, 33]),
        blend:         0.45
      )

      win_pid  = result[:pitcher_stats].find { |_, s| s[:decision] == "W" }&.first
      save_pid = result[:pitcher_stats].find { |_, s| s[:decision] == "S" }&.first
      expect(win_pid).not_to eq(save_pid) if save_pid
    end
  end

  # -----------------------------------------------------------------------
  # Bullpen roles
  # -----------------------------------------------------------------------
  describe ".simulate_game — bullpen roles" do
    let(:home_lineup)   { lineup((1..9).to_a) }
    let(:away_lineup)   { lineup((11..19).to_a) }
    let(:home_pitchers) { rotation([21, 22, 23, 24]) }
    let(:away_pitchers) { rotation([31, 32, 33, 34]) }

    it "completes without error when home_roles and away_roles are provided" do
      roles = { closer_id: 24, setup_ids: [23], long_ids: [22] }
      expect {
        described_class.simulate_game(
          home_lineup:   home_lineup,
          away_lineup:   away_lineup,
          home_pitchers: home_pitchers,
          away_pitchers: away_pitchers,
          blend:         0.45,
          home_roles:    roles,
          away_roles:    roles
        )
      }.not_to raise_error
    end

    it "produces a valid result with empty roles hashes" do
      result = described_class.simulate_game(
        home_lineup:   home_lineup,
        away_lineup:   away_lineup,
        home_pitchers: home_pitchers,
        away_pitchers: away_pitchers,
        blend:         0.45,
        home_roles:    {},
        away_roles:    {}
      )
      expect(result[:home_score]).to be_a(Integer)
      expect(result[:away_score]).to be_a(Integer)
    end

    it "still assigns W and L with role-based bullpen" do
      roles = { closer_id: 24, setup_ids: [23], long_ids: [] }
      result = described_class.simulate_game(
        home_lineup:   home_lineup,
        away_lineup:   away_lineup,
        home_pitchers: home_pitchers,
        away_pitchers: away_pitchers,
        blend:         0.45,
        home_roles:    roles,
        away_roles:    roles
      )
      decisions = result[:pitcher_stats].values.map { |s| s[:decision] }.compact
      expect(decisions.count("W")).to eq(1)
      expect(decisions.count("L")).to eq(1)
    end
  end

  # -----------------------------------------------------------------------
  # Baserunner advancement
  # -----------------------------------------------------------------------
  describe ".simulate_game — run scoring" do
    it "scores more runs with high-BABIP lineups vs low-BABIP lineups" do
      hot_batter  = { bb_pct: 0.0, k_pct: 0.0, babip: 0.420, hr_fb_pct: 0.05, fb_pct: 0.35 }
      cold_batter = { bb_pct: 0.0, k_pct: 0.40, babip: 0.200, hr_fb_pct: 0.05, fb_pct: 0.35 }
      avg_pitcher = {}

      hot_scores = 20.times.map do
        described_class.simulate_game(
          home_lineup: lineup((1..9).to_a, hot_batter), away_lineup: lineup((11..19).to_a, avg_pitcher),
          home_pitchers: rotation([21]), away_pitchers: rotation([31]),
          blend: 1.0
        )[:home_score]
      end

      cold_scores = 20.times.map do
        described_class.simulate_game(
          home_lineup: lineup((1..9).to_a, cold_batter), away_lineup: lineup((11..19).to_a, avg_pitcher),
          home_pitchers: rotation([21]), away_pitchers: rotation([31]),
          blend: 1.0
        )[:home_score]
      end

      expect(hot_scores.sum).to be > cold_scores.sum
    end
  end
end
