require "rails_helper"

RSpec.describe "Api::ProjectionsController", type: :request do
  describe "GET /api/projections/player/:id" do
    let(:projection_result) do
      {
        player_id: 660271,
        player_type: "batter",
        projected: { avg: 0.280, ops: 0.900, hr: 44 }
      }
    end

    it "returns 200 with the projected player data" do
      allow(ProjectionService).to receive(:project_player)
        .with(660271, scenario_id: nil, type: "rest_of_season", refresh: false)
        .and_return(projection_result)

      get "/api/projections/player/660271"

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["projected"]["hr"]).to eq(44)
    end

    it "passes scenario_id and type params through" do
      allow(ProjectionService).to receive(:project_player)
        .with(660271, scenario_id: 2, type: "full_season", refresh: false)
        .and_return(projection_result)

      get "/api/projections/player/660271", params: { scenario_id: "2", type: "full_season" }

      expect(response).to have_http_status(:ok)
    end

    it "defaults unknown type to rest_of_season" do
      allow(ProjectionService).to receive(:project_player)
        .with(660271, scenario_id: nil, type: "rest_of_season", refresh: false)
        .and_return(projection_result)

      get "/api/projections/player/660271", params: { type: "garbage" }

      expect(response).to have_http_status(:ok)
    end

    it "returns 502 when ProjectionService raises" do
      allow(ProjectionService).to receive(:project_player).and_raise(StandardError, "warehouse missing")

      get "/api/projections/player/1"

      expect(response).to have_http_status(:bad_gateway)
    end
  end

  describe "GET /api/projections/accuracy/league" do
    let(:accuracy_result) do
      { player_type: "batter", aggregate: { avg: { mae: 0.015 } }, sample_size: 120, seasons_range: [2023] }
    end

    it "returns 200 with league accuracy data" do
      allow(ProjectionAccuracyService).to receive(:league_accuracy)
        .with(player_type: "batter")
        .and_return(accuracy_result)

      get "/api/projections/accuracy/league", params: { player_type: "batter" }

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["sample_size"]).to eq(120)
    end

    it "defaults player_type to batter" do
      allow(ProjectionAccuracyService).to receive(:league_accuracy)
        .with(player_type: "batter")
        .and_return(accuracy_result)

      get "/api/projections/accuracy/league"

      expect(response).to have_http_status(:ok)
    end

    it "returns 502 when service returns an error key" do
      allow(ProjectionAccuracyService).to receive(:league_accuracy)
        .and_return({ error: "no data" })

      get "/api/projections/accuracy/league"

      expect(response).to have_http_status(:bad_gateway)
      expect(response.parsed_body["error"]).to eq("no data")
    end
  end

  describe "GET /api/projections/leaderboard" do
    let(:rows) { [{ player_id: 1, name: "Ohtani", hr: 44 }] }

    it "returns 200 with projections and count" do
      allow(ProjectionService).to receive(:leaderboard)
        .with(run_id: 1, player_type: "batter", season: 2024)
        .and_return(rows)

      get "/api/projections/leaderboard", params: { run_id: 1, player_type: "batter", season: 2024 }

      expect(response).to have_http_status(:ok)
      body = response.parsed_body
      expect(body["count"]).to eq(1)
      expect(body["projections"]).to be_an(Array)
    end

    it "returns 502 when service raises" do
      allow(ProjectionService).to receive(:leaderboard).and_raise(StandardError, "oops")

      get "/api/projections/leaderboard", params: { run_id: 1 }

      expect(response).to have_http_status(:bad_gateway)
    end
  end
end
