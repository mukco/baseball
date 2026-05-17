require "rails_helper"

RSpec.describe "Api::ProjectionRunsController", type: :request do
  describe "GET /api/projection_runs" do
    it "returns 200 with runs list and count" do
      allow(ProjectionService).to receive(:list_runs)
        .with(scenario_id: nil, season: nil)
        .and_return([{ id: 1, name: "Run 1" }])

      get "/api/projection_runs"

      expect(response).to have_http_status(:ok)
      body = response.parsed_body
      expect(body["count"]).to eq(1)
      expect(body["runs"]).to be_an(Array)
    end

    it "filters by scenario_id and season when provided" do
      allow(ProjectionService).to receive(:list_runs)
        .with(scenario_id: 2, season: 2024)
        .and_return([])

      get "/api/projection_runs", params: { scenario_id: 2, season: 2024 }

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["count"]).to eq(0)
    end
  end

  describe "POST /api/projection_runs" do
    let(:valid_params) { { player_ids: [660271, 592518], seasons: [2023, 2024] } }
    let(:success_result) { { run_id: 99, projection_count: 2, season: 2025 } }

    it "returns 201 on success" do
      allow(ProjectionService).to receive(:create_run).and_return(success_result)

      post "/api/projection_runs", params: valid_params, as: :json

      expect(response).to have_http_status(:created)
      expect(response.parsed_body["run_id"]).to eq(99)
    end

    it "returns 422 when player_ids is empty" do
      post "/api/projection_runs", params: { player_ids: [] }, as: :json

      expect(response).to have_http_status(:unprocessable_entity)
      expect(response.parsed_body["error"]).to match(/player_ids/)
    end

    it "returns 422 when player_ids is absent" do
      post "/api/projection_runs", as: :json

      expect(response).to have_http_status(:unprocessable_entity)
    end

    it "returns 422 when service returns an error" do
      allow(ProjectionService).to receive(:create_run).and_return({ error: "warehouse not ready" })

      post "/api/projection_runs", params: valid_params, as: :json

      expect(response).to have_http_status(:unprocessable_entity)
      expect(response.parsed_body["error"]).to eq("warehouse not ready")
    end
  end

  describe "DELETE /api/projection_runs/:id" do
    it "returns 200 with deleted: true when the run exists" do
      run = create(:projection_run)

      delete "/api/projection_runs/#{run.id}"

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["deleted"]).to be true
      expect(response.parsed_body["id"]).to eq(run.id)
    end

    it "returns 404 when the run does not exist" do
      delete "/api/projection_runs/99999"

      expect(response).to have_http_status(:not_found)
      expect(response.parsed_body["error"]).to match(/not found/i)
    end
  end
end
