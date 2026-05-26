require "rails_helper"

RSpec.describe SimulationPreset, type: :model do
  subject(:preset) { build(:simulation_preset) }

  describe "validations" do
    it "is valid with a name and valid params_json" do
      expect(preset).to be_valid
    end

    it "requires a name" do
      preset.name = ""
      expect(preset).not_to be_valid
      expect(preset.errors[:name]).to be_present
    end

    it "requires a unique name" do
      create(:simulation_preset, name: "My Preset")
      preset.name = "My Preset"
      expect(preset).not_to be_valid
      expect(preset.errors[:name]).to be_present
    end

    it "rejects invalid params_json" do
      preset.params_json = "not json"
      expect(preset).not_to be_valid
      expect(preset.errors[:params_json]).to be_present
    end
  end

  describe "#params" do
    it "deserializes params_json" do
      preset.params_json = { "run_environment" => 1.2 }.to_json
      expect(preset.params["run_environment"]).to eq(1.2)
    end

    it "returns empty hash for blank params_json" do
      preset.params_json = nil
      expect(preset.params).to eq({})
    end
  end

  describe "#params=" do
    it "serializes a hash to params_json" do
      preset.params = { "variance" => 1.5 }
      expect(JSON.parse(preset.params_json)["variance"]).to eq(1.5)
    end

    it "handles nil by storing empty JSON object" do
      preset.params = nil
      expect(preset.params_json).to eq("{}")
    end
  end
end
