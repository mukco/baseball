require "rails_helper"

RSpec.describe "Api::OddsController", type: :request do
  describe "GET /api/odds/today" do
    let(:odds_result) do
      {
        fetched_at: "2025-04-15T12:00:00Z",
        games: [
          {
            competition_id: "401",
            home_team: "New York Yankees",
            away_team: "Boston Red Sox",
            status: "Preview",
            odds_data: { provider: "ESPN BET", moneyline: "NYY -130" }
          }
        ]
      }
    end

    it "returns 200 with today's odds" do
      allow(OddsService).to receive(:today).with(date: nil).and_return(odds_result)

      get "/api/odds/today"

      expect(response).to have_http_status(:ok)
      body = response.parsed_body
      expect(body["games"]).to be_an(Array)
      expect(body["fetched_at"]).to be_present
    end

    it "passes the date param through to OddsService" do
      allow(OddsService).to receive(:today).with(date: "2025-04-15").and_return(odds_result)

      get "/api/odds/today", params: { date: "2025-04-15" }

      expect(response).to have_http_status(:ok)
    end

    it "returns 502 when OddsService raises" do
      allow(OddsService).to receive(:today).and_raise(StandardError, "ESPN down")

      get "/api/odds/today"

      expect(response).to have_http_status(:bad_gateway)
    end
  end
end
