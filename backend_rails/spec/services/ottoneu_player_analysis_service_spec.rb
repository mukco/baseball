require "rails_helper"

RSpec.describe OttoneuPlayerAnalysisService do
  let(:stats) do
    [{ fg_id: "116539", name: "Aaron Judge", ops: 0.952, woba: 0.421, group: "batter",
       approx_fg_pts: 450.0 }]
  end

  let(:all_rosters) do
    [
      {
        team_name: "Dingers and Dugouts",
        players: [{ name: "Aaron Judge", fg_id: "116539", salary: 40, positions: "OF", mlb_team: "NYY" }]
      },
      {
        team_name: "Other Squad",
        players: [{ name: "Josh Smith",   fg_id: "22222",  salary: 5,  positions: "3B", mlb_team: "TEX" },
                  { name: "Shohei Ohtani", fg_id: "999888", salary: 60, positions: "DH", mlb_team: "LAD" }]
      }
    ]
  end

  let(:cap_data) { [{ team_name: "Dingers and Dugouts", cap_space: 127 }] }

  let(:proj_result) do
    {
      columns: %w[pa hr r rbi sb avg obp slg ops woba wrc_plus war],
      rows:    [[600, 42, 110, 105, 4, 0.295, 0.415, 0.620, 1.035, 0.430, 190, 8.5]]
    }
  end

  let(:il_statuses) do
    { by_id: {}, by_name: { "aaron judge" => { code: "D15", desc: "15-Day IL" } } }
  end

  let(:clean_il) { { by_id: {}, by_name: {} } }

  let(:ai_client)   { instance_double(OpenAi::Client) }
  let(:ai_response) { { output: { "analysis" => "Judge's $40 salary is justified by his elite .421 wOBA. Strong hold." } } }
  let(:mlb_client)  { instance_double(MlbApiService) }

  before do
    allow(OttoneuPlayerStatsService).to receive(:fetch).and_return(stats)
    allow(OttoneuService).to receive(:all_rosters).and_return(all_rosters)
    allow(OttoneuService).to receive(:cap_overview).and_return(cap_data)
    allow(OpenAi::Client).to receive(:new).and_return(ai_client)
    allow(ai_client).to receive(:json_completion).and_return(ai_response)
    allow(Rails.cache).to receive(:fetch).and_yield
    allow(MlbApiService).to receive(:new).and_return(mlb_client)
    allow(mlb_client).to receive(:team_roster_statuses).and_return(clean_il)
    allow(Warehouse::Manager).to receive(:exists?).and_return(true)
    allow(Sandbox::QueryService).to receive(:run).with(hash_including(sql: /fg_projections_batting/)).and_return(proj_result)
    allow(Sandbox::QueryService).to receive(:run).with(hash_including(sql: /fg_projections_pitching/)).and_return({ columns: [], rows: [] })
  end

  describe ".call" do
    it "returns analysis and structured data for a D&D player" do
      result = described_class.call(fg_id: "116539", name: "Aaron Judge")
      expect(result[:analysis]).to include("Judge")
      expect(result[:roster_team]).to eq("Dingers and Dugouts")
      expect(result[:salary]).to eq(40)
      expect(result[:approx_fg_pts]).to eq(450.0)
      expect(result[:ppd]).to be_a(Numeric)
      expect(result[:surplus]).to be_a(Numeric)
      expect(result[:on_my_team]).to be true
      expect(result[:generated_at]).to be_present
    end

    it "includes IL status for a non-D&D player on the IL" do
      josh_stats = [{ fg_id: "22222", name: "Josh Smith", ops: 0.563, woba: 0.280,
                      group: "batter", approx_fg_pts: 65.0 }]
      allow(OttoneuPlayerStatsService).to receive(:fetch).and_return(josh_stats)
      tex_il = { by_id: {}, by_name: { "josh smith" => { code: "D15", desc: "15-Day IL" } } }
      allow(mlb_client).to receive(:team_roster_statuses).with(140).and_return(tex_il)

      result = described_class.call(fg_id: "22222", name: "Josh Smith")
      expect(result[:on_il]).to be true
      expect(result[:roster_team]).to eq("Other Squad")
      expect(result[:on_my_team]).to be false
    end

    it "does not fetch cap_overview for non-D&D players" do
      ohtani_stats = [{ fg_id: "999888", name: "Shohei Ohtani", ops: 1.060, group: "batter",
                        approx_fg_pts: 520.0 }]
      allow(OttoneuPlayerStatsService).to receive(:fetch).and_return(ohtani_stats)

      described_class.call(fg_id: "999888", name: "Shohei Ohtani")
      expect(OttoneuService).not_to have_received(:cap_overview)
    end

    it "handles a free agent (not rostered)" do
      allow(OttoneuPlayerStatsService).to receive(:fetch).and_return([
        { fg_id: "777", name: "Unknown Player", group: "pitcher", approx_fg_pts: 150.0 }
      ])

      result = described_class.call(name: "Unknown Player")
      expect(result[:roster_team]).to be_nil
      expect(result[:salary]).to be_nil
      expect(result[:ppd]).to be_nil
      expect(result[:on_my_team]).to be false
      expect(result[:on_il]).to be false
    end

    it "passes projection to the AI user_payload" do
      expect(ai_client).to receive(:json_completion) do |args|
        proj = args[:user_payload][:projection]
        expect(proj).to be_a(Hash)
        expect(proj[:pa]).to eq(600)
        expect(proj[:woba]).to eq(0.430)
        ai_response
      end

      described_class.call(fg_id: "116539", name: "Aaron Judge")
    end

    it "passes salary, cap_space, and roster_team to the AI for D&D players" do
      expect(ai_client).to receive(:json_completion) do |args|
        payload = args[:user_payload]
        expect(payload[:salary]).to eq(40)
        expect(payload[:cap_space]).to eq(127)
        expect(payload[:roster_team]).to eq("Dingers and Dugouts")
        ai_response
      end

      described_class.call(fg_id: "116539", name: "Aaron Judge")
    end

    it "returns nil projection when warehouse unavailable" do
      allow(Warehouse::Manager).to receive(:exists?).and_return(false)
      expect(ai_client).to receive(:json_completion) do |args|
        expect(args[:user_payload][:projection]).to be_nil
        ai_response
      end
      described_class.call(fg_id: "116539", name: "Aaron Judge")
    end

    it "returns error hash when neither fg_id nor name provided" do
      result = described_class.call
      expect(result[:error]).to be_present
    end

    it "returns cached result on second call" do
      cached = { analysis: "cached", roster_team: "Dingers and Dugouts", salary: 40,
                 ppd: 11.25, surplus: 50.0, on_my_team: true, generated_at: "2026-01-01T00:00:00Z" }
      allow(Rails.cache).to receive(:fetch).and_return(cached)

      result = described_class.call(fg_id: "116539", name: "Aaron Judge")
      expect(result[:analysis]).to eq("cached")
      expect(ai_client).not_to have_received(:json_completion)
    end

    it "returns error when AI call raises" do
      allow(ai_client).to receive(:json_completion).and_raise(StandardError, "OpenAI timeout")
      allow(Rails.cache).to receive(:fetch).and_yield

      result = described_class.call(fg_id: "116539", name: "Aaron Judge")
      expect(result[:error]).to match(/OpenAI timeout/)
    end
  end
end
