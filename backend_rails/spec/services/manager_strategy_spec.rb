require "rails_helper"

RSpec.describe ManagerStrategy do
  subject(:strategy) { described_class.new(config: SimulationConfig::DEFAULTS) }

  describe "#pull_starter?" do
    it "always returns false (stub defers to engine thresholds)" do
      expect(strategy.pull_starter?({}, {})).to be false
    end
  end

  describe "#platoon_factor" do
    it "returns 1.0 regardless of handedness" do
      expect(strategy.platoon_factor("L", "R")).to eq(1.0)
      expect(strategy.platoon_factor("R", "R")).to eq(1.0)
    end
  end

  describe "#use_pinch_hitter?" do
    it "always returns false" do
      expect(strategy.use_pinch_hitter?({}, {}, {})).to be false
    end
  end

  describe "#roll_injuries" do
    let(:players) do
      [
        { id: 1, name: "Player A", team_id: 147 },
        { id: 2, name: "Player B", team_id: 147 },
      ]
    end

    it "returns empty array when injury_rate is 0" do
      result = strategy.roll_injuries(players, injury_rate: 0.0)
      expect(result).to be_empty
    end

    it "returns empty array when player list is empty" do
      result = strategy.roll_injuries([], injury_rate: 1.0)
      expect(result).to be_empty
    end

    it "returns injury hashes with required keys when rate is 1" do
      srand(42)
      result = strategy.roll_injuries(players, injury_rate: 999.0)
      expect(result).not_to be_empty
      result.each do |inj|
        expect(inj).to include(:player_id, :player_name, :team_id, :severity, :days)
        expect(SimulationInjury::SEVERITIES).to include(inj[:severity])
        expect(inj[:days]).to be_a(Integer)
        expect(inj[:days]).to be >= 7
      end
    end

    it "only returns severities defined in SimulationInjury::SEVERITIES" do
      srand(1)
      result = strategy.roll_injuries(players * 100, injury_rate: 999.0)
      severities = result.map { |i| i[:severity] }.uniq
      expect(severities - SimulationInjury::SEVERITIES).to be_empty
    end
  end
end
