require "rails_helper"

RSpec.describe "GET /api/simulations/:id/news", type: :request do
  let(:league) { create(:simulation_league) }

  context "when no stories exist" do
    it "returns empty stories with correct structure" do
      get "/api/simulations/#{league.id}/news"
      expect(response).to have_http_status(:ok)
      body = response.parsed_body
      expect(body["stories"]).to eq([])
      expect(body["total"]).to eq(0)
      expect(body["has_more"]).to eq(false)
      expect(body["page"]).to eq(1)
    end
  end

  context "with multiple stories" do
    before do
      16.times do |i|
        create(:simulation_news_story,
               simulation_league: league,
               story_date:        Date.today - i.days)
      end
    end

    it "returns stories newest-first with pagination" do
      get "/api/simulations/#{league.id}/news?page=1&per=14"
      body = response.parsed_body
      expect(body["stories"].size).to eq(14)
      expect(body["total"]).to eq(16)
      expect(body["has_more"]).to eq(true)

      dates = body["stories"].map { |s| s["date"] }
      expect(dates).to eq(dates.sort.reverse)
    end

    it "returns has_more: false on the last page" do
      get "/api/simulations/#{league.id}/news?page=2&per=14"
      body = response.parsed_body
      expect(body["stories"].size).to eq(2)
      expect(body["has_more"]).to eq(false)
    end

    it "clamps per to 30 maximum" do
      get "/api/simulations/#{league.id}/news?per=100"
      body = response.parsed_body
      expect(body["per"]).to eq(30)
    end
  end

  context "with mixed ai_generated and stub stories" do
    before do
      create(:simulation_news_story,         simulation_league: league, story_date: Date.today)
      create(:simulation_news_story, :stub,  simulation_league: league, story_date: Date.today - 1.day)
    end

    it "serializes ai_generated correctly" do
      get "/api/simulations/#{league.id}/news"
      body   = response.parsed_body
      today  = body["stories"].find { |s| s["date"] == Date.today.to_s }
      yester = body["stories"].find { |s| s["date"] == (Date.today - 1.day).to_s }
      expect(today["ai_generated"]).to eq(true)
      expect(today["headline"]).to be_present
      expect(yester["ai_generated"]).to eq(false)
      expect(yester["headline"]).to be_nil
      expect(yester["stories"]).to eq([])
    end
  end

  it "returns 404 for unknown league" do
    get "/api/simulations/999999/news"
    expect(response).to have_http_status(502)
  end
end
