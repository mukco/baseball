require "rails_helper"

RSpec.describe "Api::ProspectsController", type: :request do
  let(:prospect_stub) do
    { "rank" => 1, "name" => "Jackson Holliday", "position" => "SS", "team" => "BAL" }
  end

  describe "GET /api/prospects/player/:id" do
    it "returns 200 with the prospect payload from ProspectService" do
      allow(ProspectService).to receive(:for_player).with(player_id: 123)
        .and_return({ prospect: prospect_stub })

      get "/api/prospects/player/123"

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["prospect"]["name"]).to eq("Jackson Holliday")
    end

    it "returns 200 with { prospect: null } when the player is not on the board" do
      allow(ProspectService).to receive(:for_player).and_return({ prospect: nil })

      get "/api/prospects/player/999"

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["prospect"]).to be_nil
    end

    it "returns 502 when ProspectService raises" do
      allow(ProspectService).to receive(:for_player).and_raise(StandardError, "network err")

      get "/api/prospects/player/1"

      expect(response).to have_http_status(:bad_gateway)
    end
  end

  describe "GET /api/prospects/top100" do
    it "returns 200 with an array of top prospects" do
      allow(ProspectService).to receive(:top100).and_return([prospect_stub])

      get "/api/prospects/top100"

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body).to be_an(Array)
      expect(response.parsed_body.first["rank"]).to eq(1)
    end

    it "returns 502 when ProspectService raises" do
      allow(ProspectService).to receive(:top100).and_raise(StandardError, "oops")

      get "/api/prospects/top100"

      expect(response).to have_http_status(:bad_gateway)
    end
  end

  describe "GET /api/prospects/team/:team_id" do
    it "returns 200 with an array of team prospects" do
      allow(ProspectService).to receive(:team_prospects).with(team_id: 110)
        .and_return([prospect_stub])

      get "/api/prospects/team/110"

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body).to be_an(Array)
    end

    it "returns 502 when ProspectService raises" do
      allow(ProspectService).to receive(:team_prospects).and_raise(StandardError, "bad")

      get "/api/prospects/team/110"

      expect(response).to have_http_status(:bad_gateway)
    end
  end
end
