require "rails_helper"

RSpec.describe ProspectService do
  let(:tmp_dir) { Pathname.new(Dir.mktmpdir) }

  before do
    stub_const("ProspectService::DATA_DIR", tmp_dir)
    # Reset class-level caches between tests
    described_class.class_variable_set(:@@cache,                   {})
    described_class.class_variable_set(:@@cache_timestamps,        {})
    described_class.class_variable_set(:@@file_refresh_timestamps, {})
  end

  after { FileUtils.rm_rf(tmp_dir) }

  let(:sample_prospect) do
    {
      "rank" => 1, "orgRank" => 1, "name" => "Jackson Holliday",
      "position" => "SS", "team" => "BAL", "fgTeam" => "BAL",
      "level" => "MLB", "age" => 21.0, "bats" => "L", "throws" => "R",
      "fv" => 60, "eta" => 2024, "risk" => "Low", "tldr" => "Elite prospect.",
      "tools" => { "hit" => "55", "power" => "55" }
    }
  end

  def write_board(prospects = [sample_prospect])
    File.write(tmp_dir.join("board.json"), JSON.generate(prospects))
  end

  # ------------------------------------------------------------------
  describe ".for_player" do
    it "returns { prospect: nil } when board.json is absent" do
      expect(described_class.for_player(player_id: 123)).to eq({ prospect: nil })
    end

    it "matches a prospect by name via MlbApiService" do
      write_board
      mlb = instance_double(MlbApiService, player_info: { name: "Jackson Holliday" })
      allow(MlbApiService).to receive(:new).and_return(mlb)

      result = described_class.for_player(player_id: 123)
      expect(result[:prospect]["name"]).to eq("Jackson Holliday")
    end

    it "returns { prospect: nil } when MlbApiService returns nothing" do
      write_board
      mlb = instance_double(MlbApiService, player_info: nil)
      allow(MlbApiService).to receive(:new).and_return(mlb)

      expect(described_class.for_player(player_id: 999)).to eq({ prospect: nil })
    end
  end

  # ------------------------------------------------------------------
  describe ".top100" do
    it "returns an error when board.json is absent" do
      allow(described_class).to receive(:fetch_fangraphs_board).and_return(nil)
      result = described_class.top100
      expect(result).to have_key(:error)
    end

    it "returns only prospects ranked 1–100" do
      prospects = [
        sample_prospect.merge("rank" => 1),
        sample_prospect.merge("rank" => 50,  "name" => "B"),
        sample_prospect.merge("rank" => 101, "name" => "C")
      ]
      write_board(prospects)

      mlb = instance_double(MlbApiService)
      allow(MlbApiService).to receive(:new).and_return(mlb)
      allow(mlb).to receive(:search_players).and_return([])

      result = described_class.top100
      expect(result).to be_an(Array)
      expect(result.map { |p| p["rank"] }).to all(be_between(1, 100))
    end

    it "caches the result on second call" do
      cached = [sample_prospect]
      described_class.class_variable_get(:@@cache)["prospects_top100"] = cached
      described_class.class_variable_get(:@@cache_timestamps)["prospects_top100"] = Time.now.to_i

      expect(described_class).not_to receive(:enrich_with_stats)
      result = described_class.top100
      expect(result).to eq(cached)
    end
  end

  # ------------------------------------------------------------------
  describe ".team_prospects" do
    it "returns error for an unrecognised team_id" do
      result = described_class.team_prospects(team_id: 9999)
      expect(result[:error]).to match(/Unsupported team/)
    end

    it "returns error when board.json is absent" do
      result = described_class.team_prospects(team_id: 110) # BAL
      expect(result).to have_key(:error)
    end

    it "filters prospects by FanGraphs team abbreviation" do
      prospects = [
        sample_prospect.merge("fgTeam" => "BAL", "orgRank" => 1),
        sample_prospect.merge("fgTeam" => "NYY", "name" => "Other", "orgRank" => 1)
      ]
      write_board(prospects)

      mlb = instance_double(MlbApiService)
      allow(MlbApiService).to receive(:new).and_return(mlb)
      allow(mlb).to receive(:search_players).and_return([])

      result = described_class.team_prospects(team_id: 110) # BAL → BAL
      expect(result).to be_an(Array)
      expect(result.all? { |p| p["fgTeam"] == "BAL" || p["team"] == "BAL" }).to be true
    end
  end

  # ------------------------------------------------------------------
  describe "FG_TEAM_ABBR normalisation" do
    it "maps FanGraphs non-standard abbreviations to MLB abbreviations" do
      expect(ProspectService::FG_TEAM_ABBR["CHW"]).to eq("CWS")
      expect(ProspectService::FG_TEAM_ABBR["KCR"]).to eq("KC")
      expect(ProspectService::FG_TEAM_ABBR["SDP"]).to eq("SD")
    end
  end
end
