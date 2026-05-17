require "rails_helper"

RSpec.describe "Api::ScenariosController", type: :request do
  describe "GET /api/scenarios" do
    it "returns 200 with all scenarios, default first" do
      default_s = create(:projection_scenario, :default)
      other_s   = create(:projection_scenario, name: "Aggressive")

      get "/api/scenarios"

      expect(response).to have_http_status(:ok)
      ids = response.parsed_body.map { |s| s["id"] }
      expect(ids.first).to eq(default_s.id)
    end

    it "creates a default scenario if none exist" do
      expect { get "/api/scenarios" }.to change(ProjectionScenario, :count).by(1)
    end
  end

  describe "GET /api/scenarios/:id" do
    it "returns 200 with the scenario" do
      scenario = create(:projection_scenario)

      get "/api/scenarios/#{scenario.id}"

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["id"]).to eq(scenario.id)
    end

    it "returns 502 when the scenario is not found" do
      get "/api/scenarios/99999"

      expect(response).to have_http_status(:bad_gateway)
    end
  end

  describe "POST /api/scenarios" do
    let(:valid_params) do
      {
        scenario: {
          name: "Power Hitter Bias",
          year1_weight: 5, year2_weight: 4, year3_weight: 3,
          regression_factor: 1.2, age_curve_factor: 1.0, statcast_weight: 0.5,
          default_pa: 550, default_ip: 160
        }
      }
    end

    it "returns 201 and creates the scenario" do
      expect {
        post "/api/scenarios", params: valid_params, as: :json
      }.to change(ProjectionScenario, :count).by(1)

      expect(response).to have_http_status(:created)
      expect(response.parsed_body["name"]).to eq("Power Hitter Bias")
    end

    it "returns 422 when name is missing" do
      params = valid_params.deep_merge(scenario: { name: "" })

      post "/api/scenarios", params: params, as: :json

      expect(response).to have_http_status(:unprocessable_entity)
      expect(response.parsed_body["error"]).to be_present
    end
  end

  describe "PATCH /api/scenarios/:id" do
    it "returns 200 and updates the scenario" do
      scenario = create(:projection_scenario, name: "Old Name")

      patch "/api/scenarios/#{scenario.id}",
            params: { scenario: { name: "New Name" } }, as: :json

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["name"]).to eq("New Name")
    end

    it "returns 422 when the update is invalid" do
      scenario = create(:projection_scenario)

      patch "/api/scenarios/#{scenario.id}",
            params: { scenario: { regression_factor: 99 } }, as: :json

      expect(response).to have_http_status(:unprocessable_entity)
    end

    it "returns 502 when the scenario does not exist" do
      patch "/api/scenarios/99999", params: { scenario: { name: "X" } }, as: :json

      expect(response).to have_http_status(:bad_gateway)
    end
  end

  describe "DELETE /api/scenarios/:id" do
    it "returns 200 and deletes a non-default scenario" do
      scenario = create(:projection_scenario)

      delete "/api/scenarios/#{scenario.id}"

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["ok"]).to be true
      expect(ProjectionScenario.find_by(id: scenario.id)).to be_nil
    end

    it "returns 422 when trying to delete the default scenario" do
      scenario = create(:projection_scenario, :default)

      delete "/api/scenarios/#{scenario.id}"

      expect(response).to have_http_status(:unprocessable_entity)
      expect(response.parsed_body["error"]).to match(/default/)
    end

    it "returns 502 when the scenario does not exist" do
      delete "/api/scenarios/99999"

      expect(response).to have_http_status(:bad_gateway)
    end
  end
end
