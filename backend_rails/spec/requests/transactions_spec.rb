require "rails_helper"

RSpec.describe "Api::TransactionsController", type: :request do
  let(:transactions_result) do
    [
      { "id" => "1", "description" => "Signed F to 1-year deal", "team" => "NYY", "date" => "2025-04-01" }
    ]
  end

  let(:mlb) { instance_double(MlbApiService) }

  before do
    allow(MlbApiService).to receive(:new).and_return(mlb)
    allow(mlb).to receive(:transactions).and_return(transactions_result)
  end

  describe "GET /api/transactions" do
    it "returns 200 with transactions array" do
      get "/api/transactions"

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body).to be_an(Array)
    end

    it "passes team_id and player_id to MlbApiService" do
      expect(mlb).to receive(:transactions).with(
        hash_including(team_id: "110", player_id: "660271")
      ).and_return([])

      get "/api/transactions", params: { team_id: "110", player_id: "660271" }

      expect(response).to have_http_status(:ok)
    end

    it "defaults start_date to 30 days ago and limit to 200" do
      expect(mlb).to receive(:transactions).with(
        hash_including(limit: 200)
      ).and_return([])

      get "/api/transactions"

      expect(response).to have_http_status(:ok)
    end

    it "caps limit at 500" do
      expect(mlb).to receive(:transactions).with(
        hash_including(limit: 500)
      ).and_return([])

      get "/api/transactions", params: { limit: "9999" }

      expect(response).to have_http_status(:ok)
    end

    it "returns 502 when MlbApiService raises" do
      allow(mlb).to receive(:transactions).and_raise(StandardError, "MLB API down")

      get "/api/transactions"

      expect(response).to have_http_status(:bad_gateway)
    end
  end
end
