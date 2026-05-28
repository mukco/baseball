require "rails_helper"

RSpec.describe OttoneuFreeAgentsService do
  let(:all_rosters) do
    [
      {
        team_id: 6054, team_name: "Dingers and Dugouts",
        players: [
          { name: "Aaron Judge",   fg_id: "116539", salary: 40 },
          { name: "Shane Bieber",  fg_id: "669456", salary: 25 }
        ]
      },
      {
        team_id: 9999, team_name: "Other Team",
        players: [{ name: "Shohei Ohtani", fg_id: "660271", salary: 50 }]
      }
    ]
  end

  let(:my_roster) do
    {
      team_name: "Dingers and Dugouts",
      players: [
        { name: "Aaron Judge",  positions: "OF", salary: 40, fg_id: "116539" },
        { name: "Shane Bieber", positions: "SP", salary: 25, fg_id: "669456" }
      ]
    }
  end

  let(:cap_overview) do
    [
      { team_name: "Dingers and Dugouts", cap_space: 60 },
      { team_name: "Other Team",          cap_space: 40 }
    ]
  end

  let(:waivers) do
    { active: [{ name: "Bryan Abreu", salary: 3, position: "RP" }], completed: [] }
  end

  let(:warehouse_batter_result) do
    {
      columns: %w[fg_id name team position season woba hr bb_pct],
      rows: [
        ["abc123", "Top Batter",  "BOS", "OF", 2026, 0.370, 18, 0.12],
        ["def456", "Good Hitter", "NYM", "1B", 2026, 0.355, 12, 0.10]
      ]
    }
  end

  let(:warehouse_pitcher_result) do
    {
      columns: %w[fg_id name team season era k_pct fip],
      rows: [
        ["ghi789", "Top Pitcher", "HOU", 2026, 2.80, 0.29, 2.90],
        ["jkl012", "Good Arm",    "PHI", 2026, 3.10, 0.27, 3.15]
      ]
    }
  end

  let(:ai_output) do
    { output: { "factoids" => ["Top Batter is a strong $1 auction target.", "Bryan Abreu is claimable at $3."] } }
  end

  let(:ai_client) { instance_double(OpenAi::Client) }

  before do
    Rails.cache.clear
    allow(OttoneuService).to receive(:all_rosters).and_return(all_rosters)
    allow(OttoneuService).to receive(:my_roster).and_return(my_roster)
    allow(OttoneuService).to receive(:cap_overview).and_return(cap_overview)
    allow(OttoneuService).to receive(:waivers).and_return(waivers)
    allow(Sandbox::QueryService).to receive(:run)
      .with(hash_including(sql: /batters/))
      .and_return(warehouse_batter_result)
    allow(Sandbox::QueryService).to receive(:run)
      .with(hash_including(sql: /pitchers/))
      .and_return(warehouse_pitcher_result)
    allow(OpenAi::Client).to receive(:new).and_return(ai_client)
    allow(ai_client).to receive(:json_completion).and_return(ai_output)
  end

  describe ".call" do
    it "returns factoids array" do
      result = described_class.call
      expect(result[:factoids]).to be_an(Array)
      expect(result[:factoids]).not_to be_empty
    end

    it "returns players and waiver_players" do
      result = described_class.call
      expect(result[:players]).to be_an(Array)
      expect(result[:waiver_players]).to be_an(Array)
    end

    it "includes cap_space in result" do
      result = described_class.call
      expect(result[:cap_space]).to eq(60)
    end

    it "returns generated_at timestamp" do
      expect(described_class.call[:generated_at]).to be_present
    end

    it "excludes rostered fg_ids from warehouse query" do
      expect(Sandbox::QueryService).to receive(:run) do |args|
        expect(args[:sql]).to include("116539")
        expect(args[:sql]).to include("669456")
        warehouse_batter_result
      end
      allow(Sandbox::QueryService).to receive(:run)
        .with(hash_including(sql: /pitchers/))
        .and_return(warehouse_pitcher_result)

      described_class.call
    end

    it "calls OpenAI with interaction_type ottoneu_free_agents" do
      expect(ai_client).to receive(:json_completion)
        .with(hash_including(interaction_type: "ottoneu_free_agents"))
        .and_return(ai_output)

      described_class.call
    end

    it "passes cap_space to OpenAI payload" do
      expect(ai_client).to receive(:json_completion) do |args|
        expect(args[:user_payload][:cap_space]).to eq(60)
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

    context "when warehouse query fails" do
      before do
        allow(Sandbox::QueryService).to receive(:run).and_raise(StandardError, "DuckDB unavailable")
      end

      it "returns empty players array rather than raising" do
        result = described_class.call
        expect(result[:players]).to eq([])
      end
    end

    context "when OpenAI raises" do
      before { allow(ai_client).to receive(:json_completion).and_raise(StandardError, "API down") }

      it "returns an error hash" do
        expect(described_class.call).to include(error: "API down")
      end
    end
  end
end
