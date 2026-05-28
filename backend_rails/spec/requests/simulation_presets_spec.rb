require "rails_helper"

RSpec.describe "Api::SimulationPresetsController", type: :request do
  describe "GET /api/simulation_presets" do
    it "returns an empty array when none exist" do
      get "/api/simulation_presets"
      expect(response).to have_http_status(:ok)
      expect(response.parsed_body).to eq([])
    end

    it "returns all presets ordered by name" do
      create(:simulation_preset, name: "Zany")
      create(:simulation_preset, name: "Alpha")
      get "/api/simulation_presets"
      names = response.parsed_body.map { |p| p["name"] }
      expect(names).to eq(%w[Alpha Zany])
    end

    it "includes id, name, and params in each preset" do
      create(:simulation_preset, name: "Test", params_json: { "variance" => 1.5 }.to_json)
      get "/api/simulation_presets"
      preset = response.parsed_body.first
      expect(preset["id"]).to be_present
      expect(preset["name"]).to eq("Test")
      expect(preset["params"]["variance"]).to eq(1.5)
    end
  end

  describe "POST /api/simulation_presets" do
    let(:valid_params) { SimulationConfig::DEFAULTS.merge("variance" => 1.5) }

    it "creates a preset and returns 201" do
      post "/api/simulation_presets",
           params:  { name: "High Variance", params: valid_params },
           as:      :json

      expect(response).to have_http_status(:created)
      body = response.parsed_body
      expect(body["name"]).to eq("High Variance")
      expect(body["params"]["variance"]).to eq(1.5)
      expect(SimulationPreset.count).to eq(1)
    end

    it "strips unknown param keys" do
      post "/api/simulation_presets",
           params:  { name: "Clean", params: valid_params.merge("hacker_key" => "bad") },
           as:      :json

      expect(response).to have_http_status(:created)
      expect(response.parsed_body["params"]).not_to have_key("hacker_key")
    end

    it "returns 422 when name is blank" do
      post "/api/simulation_presets",
           params: { name: "", params: valid_params },
           as:     :json

      expect(response).to have_http_status(:unprocessable_entity)
      expect(response.parsed_body["error"]).to be_present
    end

    it "returns 422 for duplicate names" do
      create(:simulation_preset, name: "Existing")
      post "/api/simulation_presets",
           params: { name: "Existing", params: valid_params },
           as:     :json

      expect(response).to have_http_status(:unprocessable_entity)
    end
  end

  describe "DELETE /api/simulation_presets/:id" do
    it "destroys the preset and returns ok" do
      preset = create(:simulation_preset)
      delete "/api/simulation_presets/#{preset.id}"

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["ok"]).to be true
      expect(SimulationPreset.find_by(id: preset.id)).to be_nil
    end

    it "returns 502 for a missing preset" do
      delete "/api/simulation_presets/999999"
      expect(response).to have_http_status(:bad_gateway)
    end
  end
end
