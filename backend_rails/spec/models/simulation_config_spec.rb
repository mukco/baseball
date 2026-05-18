require "rails_helper"

RSpec.describe SimulationConfig, type: :model do
  describe "associations" do
    it "belongs to a simulation_league" do
      league = create(:simulation_league)
      config = create(:simulation_config, simulation_league: league)
      expect(config.simulation_league).to eq(league)
    end
  end

  describe "#params / #params=" do
    it "serializes and deserializes a hash" do
      config = build(:simulation_config)
      config.params = { "run_environment" => 1.2, "injury_rate" => 0.5 }
      config.save!
      config.reload
      expect(config.params["run_environment"]).to eq(1.2)
      expect(config.params["injury_rate"]).to eq(0.5)
    end

    it "returns empty hash when params_json is blank" do
      config = SimulationConfig.new(params_json: nil)
      expect(config.params).to eq({})
    end
  end

  describe "#effective" do
    it "returns DEFAULTS when no overrides stored" do
      config = build(:simulation_config, params_json: "{}")
      expect(config.effective).to eq(SimulationConfig::DEFAULTS)
    end

    it "merges stored params over DEFAULTS" do
      config = build(:simulation_config)
      config.params = { "run_environment" => 0.8 }
      effective = config.effective
      expect(effective["run_environment"]).to eq(0.8)
      expect(effective["hr_environment"]).to eq(SimulationConfig::DEFAULTS["hr_environment"])
    end

    it "always returns all DEFAULTS keys" do
      config = build(:simulation_config, params_json: "{}")
      expect(config.effective.keys).to match_array(SimulationConfig::DEFAULTS.keys)
    end
  end

  describe "#apply_preset!" do
    it "merges preset values into params" do
      config = build(:simulation_config, params_json: "{}")
      config.apply_preset!("pitchers_era")
      expect(config.params["run_environment"]).to eq(0.75)
      expect(config.params["hr_environment"]).to eq(0.6)
    end

    it "ignores unknown preset names without error" do
      config = build(:simulation_config, params_json: "{}")
      expect { config.apply_preset!("nonexistent") }.not_to raise_error
      expect(config.params).to eq({})
    end

    it "no_injuries preset sets injury_rate to 0" do
      config = build(:simulation_config, params_json: '{"injury_rate": 1.0}')
      config.apply_preset!("no_injuries")
      expect(config.params["injury_rate"]).to eq(0.0)
    end
  end

  describe "validations" do
    it "is valid with defaults" do
      config = build(:simulation_config)
      expect(config).to be_valid
    end

    it "is invalid with malformed params_json" do
      config = build(:simulation_config, params_json: "not json")
      expect(config).not_to be_valid
      expect(config.errors[:params_json]).to be_present
    end
  end

  describe "PRESETS" do
    it "defines expected preset keys" do
      expect(SimulationConfig::PRESETS.keys).to include("realistic", "no_injuries", "chaos", "pitchers_era", "launch_angle")
    end
  end
end
