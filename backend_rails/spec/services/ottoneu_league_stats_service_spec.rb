require "rails_helper"

RSpec.describe OttoneuLeagueStatsService do
  let(:roster_data) do
    [
      {
        team_name: "Dingers and Dugouts",
        players: [
          { fg_id: "12345", name: "Mike Trout",    salary: 40, positions: "OF",  mlb_team: "LAA" },
          { fg_id: "99999", name: "Kyle Finnegan", salary: 10, positions: "RP",  mlb_team: "WSN" },
        ]
      },
      {
        team_name: "Other Team",
        players: [
          { fg_id: "56789", name: "José Ramírez",  salary: 50, positions: "3B",  mlb_team: "CLE" },
        ]
      }
    ]
  end

  let(:batter_result) do
    {
      columns: %w[fg_id name avg obp slg ops woba wrc_plus ab h hr bb sb],
      rows: [
        ["12345", "Mike Trout", 0.290, 0.400, 0.600, 1.000, 0.420, 180, 400, 116, 35, 95, 10],
        ["56789", "José Ramírez", 0.280, 0.360, 0.520, 0.880, 0.380, 165, 450, 126, 30, 70, 20],
      ]
    }
  end

  let(:pitcher_result) do
    {
      columns: %w[fg_id name era fip k_pct whip k_per_9 ip k h bb hr sv],
      rows: [
        ["99999", "Kyle Finnegan", 2.80, 3.10, 0.32, 1.10, 9.5, 65.0, 69, 50, 20, 5, 30],
      ]
    }
  end

  let(:empty_result) { { columns: [], rows: [] } }

  before do
    Rails.cache.clear
    allow(OttoneuService).to receive(:all_rosters).and_return(roster_data)
    allow(Warehouse::Manager).to receive(:exists?).and_return(true)
    # Rostered queries use fg_id IN (...); FA queries use NOT IN — return empty for FAs
    allow(Sandbox::QueryService).to receive(:run).with(hash_including(sql: / IN /)).and_call_original
    allow(Sandbox::QueryService).to receive(:run).with(hash_including(sql: /NOT IN/)).and_return(empty_result)
    allow(Sandbox::QueryService).to receive(:run).with(hash_including(sql: /batters.*IN/m)).and_return(batter_result)
    allow(Sandbox::QueryService).to receive(:run).with(hash_including(sql: /pitchers.*IN/m)).and_return(pitcher_result)
  end

  describe ".call" do
    subject(:result) { described_class.call(refresh: true) }

    it "returns rostered players" do
      expect(result).to be_an(Array)
      expect(result.map { |r| r[:name] }).to include("Mike Trout", "José Ramírez", "Kyle Finnegan")
    end

    it "includes batter stats with computed PPD and surplus" do
      trout = result.find { |r| r[:name] == "Mike Trout" }
      expect(trout).to be_present
      expect(trout[:group]).to eq("batter")
      expect(trout[:salary]).to eq(40)
      expect(trout[:ppd]).to be_a(Numeric)
      expect(trout[:surplus]).to be_a(Numeric)
      expect(trout[:roster_team]).to eq("Dingers and Dugouts")
      expect(trout[:positions]).to eq("OF")
    end

    it "includes pitcher stats with computed PPD and surplus" do
      finnegan = result.find { |r| r[:name] == "Kyle Finnegan" }
      expect(finnegan).to be_present
      expect(finnegan[:group]).to eq("pitcher")
      expect(finnegan[:ppd]).to be_a(Numeric)
    end

    it "returns [] when warehouse does not exist" do
      allow(Warehouse::Manager).to receive(:exists?).and_return(false)
      expect(described_class.call(refresh: true)).to eq([])
    end

    it "returns [] when all_rosters errors" do
      allow(OttoneuService).to receive(:all_rosters).and_return({ error: "timeout" })
      expect(described_class.call(refresh: true)).to eq([])
    end

    it "returns [] and logs warning on unexpected error" do
      allow(Sandbox::QueryService).to receive(:run).and_raise(RuntimeError, "db down")
      expect(Rails.logger).to receive(:warn).with(/OttoneuLeagueStatsService/)
      expect(described_class.call(refresh: true)).to eq([])
    end
  end
end
