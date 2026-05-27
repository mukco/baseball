require "rails_helper"

RSpec.describe OttoneuInsightsService do
  let(:my_roster) do
    {
      team_name: "Dingers and Dugouts",
      team_id:   6054,
      players: [
        { name: "Aaron Judge",    mlb_team: "NYY", positions: "OF",    salary: 40, fg_id: "116539" },
        { name: "Shane Bieber",   mlb_team: "CLE", positions: "SP",    salary: 25, fg_id: "669456" },
        { name: "Julio Rodriguez",mlb_team: "SEA", positions: "OF/DH", salary: 18, fg_id: "682998" }
      ]
    }
  end

  let(:production) do
    {
      "Aaron Judge"     => { season_points: 412.3, pts_per_game: 6.1 },
      "Shane Bieber"    => { season_points: 198.7, pts_per_game: 14.2 },
      "Julio Rodriguez" => { season_points: 301.0, pts_per_game: 4.8 }
    }
  end

  let(:matchups) do
    {
      matchups: [
        { opponent_name: "Fenway Faithful", my_points: 312.5, opponent_points: 290.0, status: "live" },
        { opponent_name: "Bleacher Bums",   my_points: 280.0, opponent_points: 295.0, status: "live" }
      ]
    }
  end

  let(:game_log) { { games: [] } }

  let(:ai_output) do
    { output: { "factoids" => ["Judge is 8-for-15 this week.", "Bieber starts Thursday."] } }
  end

  let(:mlb_service) { instance_double(MlbApiService) }
  let(:ai_client)   { instance_double(OpenAi::Client) }

  let(:cap_data) do
    [{ team_name: "Dingers and Dugouts", player_count: 40, base_salary: 300, penalties: 0, cap_space: 100 }]
  end

  before do
    Rails.cache.clear
    allow(OttoneuService).to receive(:my_roster).and_return(my_roster)
    allow(OttoneuService).to receive(:my_production).and_return(production)
    allow(OttoneuService).to receive(:current_matchups).and_return(matchups)
    allow(OttoneuService).to receive(:cap_overview).and_return(cap_data)
    allow(MlbApiService).to receive(:new).and_return(mlb_service)
    allow(mlb_service).to receive(:search_players).and_return([])
    allow(mlb_service).to receive(:player_game_log).and_return(game_log)
    allow(OpenAi::Client).to receive(:new).and_return(ai_client)
    allow(ai_client).to receive(:json_completion).and_return(ai_output)
  end

  describe ".call" do
    it "returns factoids array" do
      result = described_class.call
      expect(result[:factoids]).to be_an(Array)
      expect(result[:factoids].size).to eq(2)
    end

    it "returns generated_at timestamp" do
      result = described_class.call
      expect(result[:generated_at]).to be_present
    end

    it "calls OpenAI with interaction_type ottoneu_insights" do
      expect(ai_client).to receive(:json_completion)
        .with(hash_including(interaction_type: "ottoneu_insights"))
        .and_return(ai_output)

      described_class.call
    end

    it "passes both matchups to OpenAI payload" do
      expect(ai_client).to receive(:json_completion) do |args|
        payload = args[:user_payload]
        expect(payload[:current_matchups].size).to eq(2)
        ai_output
      end

      described_class.call
    end

    it "caches result and does not call OpenAI twice" do
      memory_cache = ActiveSupport::Cache::MemoryStore.new
      allow(Rails).to receive(:cache).and_return(memory_cache)

      described_class.call
      described_class.call
      expect(ai_client).to have_received(:json_completion).once
    end

    it "bypasses cache when refresh: true" do
      memory_cache = ActiveSupport::Cache::MemoryStore.new
      allow(Rails).to receive(:cache).and_return(memory_cache)

      described_class.call
      described_class.call(refresh: true)
      expect(ai_client).to have_received(:json_completion).twice
    end

    context "when roster returns an error" do
      before { allow(OttoneuService).to receive(:my_roster).and_return({ error: "timeout" }) }

      it "returns the error hash directly" do
        expect(described_class.call).to include(error: "timeout")
      end
    end

    context "when roster has no players" do
      before { allow(OttoneuService).to receive(:my_roster).and_return({ team_name: "D&D", players: [] }) }

      it "returns empty factoids without calling OpenAI" do
        result = described_class.call
        expect(result[:factoids]).to eq([])
        expect(ai_client).not_to have_received(:json_completion)
      end
    end

    context "when OpenAI raises" do
      before { allow(ai_client).to receive(:json_completion).and_raise(StandardError, "API unavailable") }

      it "returns an error hash" do
        expect(described_class.call).to include(error: "API unavailable")
      end
    end
  end
end
