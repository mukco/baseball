require "rails_helper"

RSpec.describe OttoneuPlayerStatsService do
  let(:batter_result) do
    {
      columns: ["fg_id", "name", "woba", "hr", "bb_pct"],
      rows: [["116539", "Aaron Judge", 0.421, 27, 14.2]]
    }
  end

  let(:pitcher_result) do
    {
      columns: ["fg_id", "name", "era", "fip", "k_pct"],
      rows: [["669392", "Kyle Finnegan", 3.85, 3.21, 28.4]]
    }
  end

  let(:empty_result) { { columns: [], rows: [] } }

  before do
    Rails.cache.clear
    allow(Warehouse::Manager).to receive(:exists?).and_return(true)
    allow(Rails.cache).to receive(:fetch).and_call_original
  end

  describe ".fetch" do
    context "by fg_ids" do
      before do
        allow(Sandbox::QueryService).to receive(:run) do |args|
          sql = args[:sql]
          sql.include?("batters") ? batter_result : empty_result
        end
      end

      it "returns batter rows with group: 'batter'" do
        result = described_class.fetch(fg_ids: ["116539"])
        expect(result).to be_an(Array)
        batter = result.find { |r| r[:name] == "Aaron Judge" }
        expect(batter).to include(group: "batter", woba: 0.421, hr: 27)
      end

      it "includes fg_id in the result" do
        result = described_class.fetch(fg_ids: ["116539"])
        expect(result.first[:fg_id]).to eq("116539")
      end
    end

    context "by names" do
      before do
        allow(Sandbox::QueryService).to receive(:run) do |args|
          sql = args[:sql]
          sql.include?("pitchers") ? pitcher_result : empty_result
        end
      end

      it "returns pitcher rows with group: 'pitcher'" do
        result = described_class.fetch(names: ["Kyle Finnegan"])
        pitcher = result.find { |r| r[:name] == "Kyle Finnegan" }
        expect(pitcher).to include(group: "pitcher", fip: 3.21)
      end
    end

    context "with both fg_ids and names" do
      before do
        allow(Sandbox::QueryService).to receive(:run) do |args|
          sql = args[:sql]
          if sql.include?("fg_id") && sql.include?("batters")
            batter_result
          elsif sql.include?("name IN") && sql.include?("pitchers")
            pitcher_result
          else
            empty_result
          end
        end
      end

      it "combines results from both queries" do
        result = described_class.fetch(fg_ids: ["116539"], names: ["Kyle Finnegan"])
        names = result.map { |r| r[:name] }
        expect(names).to include("Aaron Judge", "Kyle Finnegan")
      end
    end

    context "when a pitcher also appears in the batters table (e.g. pinch-hit PA)" do
      let(:pitcher_in_bat_table) do
        { columns: ["fg_id", "name", "avg", "obp", "slg", "ops", "babip", "woba", "wrc_plus", "ab", "h", "doubles", "triples", "hr", "bb", "hbp", "sb", "cs", "bb_pct"],
          rows:    [["669392", "Shohei Ohtani", nil, nil, nil, nil, nil, nil, nil, 0, 0, 0, 0, 0, 0, 0, 0, 0, nil]] }
      end
      let(:pitcher_in_pit_table) do
        { columns: ["fg_id", "name", "era", "fip", "k_pct", "whip", "k_per_9", "ip", "k", "h", "bb", "hbp", "hr", "sv", "hld"],
          rows:    [["669392", "Shohei Ohtani", 3.00, 2.80, 32.0, 1.05, 11.2, 120.0, 150, 90, 35, 3, 8, 0, 0]] }
      end

      before do
        allow(Sandbox::QueryService).to receive(:run) do |args|
          sql = args[:sql]
          sql.include?("batters") ? pitcher_in_bat_table : pitcher_in_pit_table
        end
      end

      it "keeps pitcher stats (non-nil approx_fg_pts) over the zero-AB batter row" do
        result = described_class.fetch(fg_ids: ["669392"])
        player = result.find { |r| r[:name] == "Shohei Ohtani" }
        expect(player).not_to be_nil
        expect(player[:group]).to eq("pitcher")
        expect(player[:approx_fg_pts]).not_to be_nil
      end
    end

    context "when warehouse does not exist" do
      before { allow(Warehouse::Manager).to receive(:exists?).and_return(false) }

      it "returns empty array without querying" do
        expect(Sandbox::QueryService).not_to receive(:run)
        expect(described_class.fetch(fg_ids: ["123"])).to eq([])
      end
    end

    context "when warehouse query raises" do
      before do
        allow(Sandbox::QueryService).to receive(:run).and_raise(StandardError, "DuckDB unavailable")
      end

      it "logs a warning and returns empty array" do
        expect(Rails.logger).to receive(:warn).with(/OttoneuPlayerStatsService/)
        expect(described_class.fetch(fg_ids: ["123"])).to eq([])
      end
    end
  end
end
