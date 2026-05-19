require "rails_helper"
require "tmpdir"

RSpec.describe LeagueConstantsService do
  let(:fake_constants) do
    {
      "batter"           => { "k_pct" => 0.22, "bb_pct" => 0.085, "babip" => 0.298, "iso" => 0.16,
                              "hr_fb_pct" => 0.11, "fb_pct" => 0.38, "gb_pct" => 0.42,
                              "hbp_pct" => 0.01, "pull_pct" => 0.40, "cent_pct" => 0.33, "oppo_pct" => 0.27 },
      "pitcher"          => { "k_pct" => 0.225, "bb_pct" => 0.085, "babip" => 0.287,
                              "hr_fb_pct" => 0.11, "gb_pct" => 0.42, "fb_pct" => 0.385 },
      "pitcher_reliever" => { "k_pct" => 0.235, "bb_pct" => 0.095, "babip" => 0.29,
                              "hr_fb_pct" => 0.10, "gb_pct" => 0.43, "fb_pct" => 0.38 },
      "league"           => { "woba" => 0.311, "rc_per_pa" => 0.12, "fip_constant" => 3.21,
                              "xfip_hr_fb_pct" => 0.11 },
      "derived_at"       => "2026-01-01T00:00:00Z",
    }
  end

  let(:tmp_dir)        { Dir.mktmpdir }
  let(:constants_path) { Pathname.new(tmp_dir).join("league_constants.json") }

  before { stub_const("LeagueConstantsService::CONSTANTS_PATH", constants_path) }
  after  { FileUtils.rm_rf(tmp_dir) }

  describe ".all" do
    context "when constants file exists" do
      before { File.write(constants_path, JSON.generate(fake_constants)) }

      it "returns parsed constants" do
        result = described_class.all
        expect(result["batter"]["k_pct"]).to eq(0.22)
        expect(result["league"]["fip_constant"]).to eq(3.21)
      end
    end

    context "when constants file is missing" do
      it "returns FALLBACK without raising" do
        result = described_class.all
        expect(result).to eq(LeagueConstantsService::FALLBACK)
      end
    end

    context "when constants file is corrupt JSON" do
      before { File.write(constants_path, "not json {{{") }

      it "returns FALLBACK" do
        expect(described_class.all).to eq(LeagueConstantsService::FALLBACK)
      end
    end
  end

  describe ".batter / .pitcher / .pitcher_reliever / .league" do
    before { File.write(constants_path, JSON.generate(fake_constants)) }

    it "returns the batter sub-hash" do
      expect(described_class.batter["babip"]).to eq(0.298)
    end

    it "returns the pitcher sub-hash" do
      expect(described_class.pitcher["gb_pct"]).to eq(0.42)
    end

    it "returns the pitcher_reliever sub-hash" do
      expect(described_class.pitcher_reliever["k_pct"]).to eq(0.235)
    end

    it "returns the league sub-hash" do
      expect(described_class.league["woba"]).to eq(0.311)
    end
  end

  describe ".derived_at" do
    before { File.write(constants_path, JSON.generate(fake_constants)) }

    it "parses derived_at as a Time" do
      expect(described_class.derived_at).to be_a(Time)
      expect(described_class.derived_at.year).to eq(2026)
    end

    context "when derived_at is nil" do
      before { File.write(constants_path, JSON.generate(fake_constants.merge("derived_at" => nil))) }

      it "returns nil" do
        expect(described_class.derived_at).to be_nil
      end
    end
  end

  describe ".refresh!" do
    let(:batter_result)   { { "columns" => %w[k_pct bb_pct babip iso hr_fb_pct fb_pct gb_pct], "rows" => [[22.0, 8.5, 0.298, 0.16, 11.5, 38.5, 42.0]], "row_count" => 1, "truncated" => false } }
    let(:pitcher_result)  { { "columns" => %w[k_pct bb_pct babip gb_pct fb_pct hr_fb_pct], "rows" => [[22.5, 8.5, 0.287, 42.0, 38.5, 0.109]], "row_count" => 1, "truncated" => false } }
    let(:reliever_result) { { "columns" => %w[k_pct bb_pct babip gb_pct fb_pct hr_fb_pct], "rows" => [[23.5, 9.5, 0.29, 43.0, 38.0, 0.10]], "row_count" => 1, "truncated" => false } }
    let(:league_result)   { { "columns" => %w[woba rc_per_pa fip_constant], "rows" => [[0.311, 0.12, 3.21]], "row_count" => 1, "truncated" => false } }

    before do
      allow(Warehouse::Manager).to receive(:duckdb_path).and_return("/fake/baseball.duckdb")
      allow(File).to receive(:exist?).and_call_original
      allow(File).to receive(:exist?).with("/fake/baseball.duckdb").and_return(true)

      call_count = 0
      allow(Open3).to receive(:capture3).with("python", anything, stdin_data: anything) do
        call_count += 1
        results = [batter_result, pitcher_result, reliever_result, league_result]
        [JSON.generate(results[call_count - 1]), "", double(success?: true)]
      end
    end

    it "writes the constants file" do
      described_class.refresh!
      expect(File.exist?(constants_path)).to be true
    end

    it "returns a hash with all four sub-keys" do
      result = described_class.refresh!
      expect(result.keys).to include("batter", "pitcher", "pitcher_reliever", "league", "derived_at")
    end

    it "converts warehouse percentages to decimals" do
      described_class.refresh!
      expect(described_class.batter["k_pct"]).to be_within(0.001).of(0.22)
    end

    it "keeps raw decimal values as-is" do
      described_class.refresh!
      expect(described_class.batter["babip"]).to be_within(0.001).of(0.298)
    end

    context "when DuckDB is unavailable" do
      before do
        allow(File).to receive(:exist?).and_call_original
        allow(File).to receive(:exist?).with("/fake/baseball.duckdb").and_return(false)
      end

      it "does not raise and returns nil" do
        expect(described_class.refresh!).to be_nil
      end

      it "does not write the constants file" do
        described_class.refresh!
        expect(File.exist?(constants_path)).to be false
      end
    end
  end
end
