require "rails_helper"

RSpec.describe "Simulation playoff awards endpoints", type: :request do
  let(:league) { create(:simulation_league) }

  describe "GET /api/simulations/:id/playoff_awards" do
    context "when no awards have been generated" do
      it "returns generated: false" do
        get "/api/simulations/#{league.id}/playoff_awards"
        expect(response).to have_http_status(:ok)
        expect(JSON.parse(response.body)["generated"]).to eq(false)
      end
    end

    context "when awards exist" do
      let(:award_data) { { "ws_mvp" => { "winner" => { "player_name" => "Hero" } } } }

      before do
        create(:simulation_insight,
               simulation_league: league,
               subject_type: "playoff_awards",
               subject_id:   league.id,
               bullets_json: award_data.to_json)
      end

      it "returns generated: true with the awards payload" do
        get "/api/simulations/#{league.id}/playoff_awards"
        expect(response).to have_http_status(:ok)
        body = JSON.parse(response.body)
        expect(body["generated"]).to eq(true)
        expect(body["awards"]).to be_present
      end
    end
  end

  describe "POST /api/simulations/:id/generate_playoff_awards" do
    context "when playoffs are not complete" do
      it "returns 422 with an error message" do
        post "/api/simulations/#{league.id}/generate_playoff_awards"
        expect(response).to have_http_status(:unprocessable_entity)
        expect(JSON.parse(response.body)["error"]).to be_present
      end
    end

    context "when all playoff series are complete" do
      let(:ai_response) do
        {
          "ws_mvp"   => { "winner" => { "player_id" => 1, "player_name" => "WS Hero",   "team_abbr" => "CIN", "stats" => {} }, "finalists" => [], "rationale" => "Won it." },
          "alcs_mvp" => { "winner" => { "player_id" => 2, "player_name" => "ALCS Hero", "team_abbr" => "CLE", "stats" => {} }, "finalists" => [], "rationale" => "ALCS star." },
          "nlcs_mvp" => { "winner" => { "player_id" => 3, "player_name" => "NLCS Hero", "team_abbr" => "CIN", "stats" => {} }, "finalists" => [], "rationale" => "NLCS star." },
        }
      end

      before do
        create(:simulation_playoff_series, simulation_league: league,
               round: "ws", league: "MLB", series_index: 0,
               home_team_id: 114, home_team_abbr: "CLE",
               away_team_id: 113, away_team_abbr: "CIN",
               home_wins: 1, away_wins: 4, winner_team_id: 113, status: "complete")
        create(:simulation_playoff_series, simulation_league: league,
               round: "cs", league: "AL", series_index: 0,
               home_team_id: 136, home_team_abbr: "SEA",
               away_team_id: 114, away_team_abbr: "CLE",
               home_wins: 3, away_wins: 4, winner_team_id: 114, status: "complete")
        create(:simulation_playoff_series, simulation_league: league,
               round: "cs", league: "NL", series_index: 0,
               home_team_id: 113, home_team_abbr: "CIN",
               away_team_id: 135, away_team_abbr: "SD",
               home_wins: 4, away_wins: 2, winner_team_id: 113, status: "complete")

        allow_any_instance_of(OpenAi::Client).to receive(:json_completion).and_return(ai_response)
      end

      it "returns 200 with generated: true" do
        post "/api/simulations/#{league.id}/generate_playoff_awards"
        expect(response).to have_http_status(:ok)
        body = JSON.parse(response.body)
        expect(body["generated"]).to eq(true)
        expect(body["awards"]).to be_present
      end

      it "persists a SimulationInsight" do
        expect {
          post "/api/simulations/#{league.id}/generate_playoff_awards"
        }.to change(SimulationInsight, :count).by(1)
      end
    end
  end
end
