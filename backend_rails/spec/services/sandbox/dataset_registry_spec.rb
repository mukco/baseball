require "rails_helper"

RSpec.describe Sandbox::DatasetRegistry do
  let(:fresh_meta) do
    {
      last_refreshed_at: Time.now.utc.iso8601,
      schema_fingerprint: Warehouse::Manager.schema_fingerprint,
      batter_rows: 5000, pitcher_rows: 3000,
      fg_proj_batting: 600, fg_proj_pitching: 400,
      team_batting_rows: 450, team_pitching_rows: 450
    }
  end

  let(:stale_meta) do
    {
      last_refreshed_at: (Time.now - 7 * 3600).utc.iso8601,
      schema_fingerprint: Warehouse::Manager.schema_fingerprint
    }
  end

  # ------------------------------------------------------------------
  # .datasets
  # ------------------------------------------------------------------
  describe ".datasets" do
    before { allow(Warehouse::Manager).to receive(:metadata).and_return(fresh_meta) }

    it "returns exactly 9 dataset entries" do
      result = described_class.datasets
      expect(result.size).to eq(9)
    end

    it "returns entries with the expected ids" do
      ids = described_class.datasets.map { |d| d[:id] }
      expect(ids).to contain_exactly(
        "batters", "pitchers",
        "fg_projections_batting", "fg_projections_pitching",
        "teams_batting", "teams_pitching",
        "sim_player_stats", "sim_team_standings", "sim_season_log"
      )
    end

    it "populates rowCount from warehouse metadata" do
      batters_ds = described_class.datasets.find { |d| d[:id] == "batters" }
      expect(batters_ds[:rowCount]).to eq(5000)
    end

    it "marks stale: false when metadata is fresh and fingerprint matches" do
      result = described_class.datasets
      expect(result).to all(include(stale: false))
    end

    it "marks stale: true when metadata is old" do
      allow(Warehouse::Manager).to receive(:metadata).and_return(stale_meta)
      result = described_class.datasets
      expect(result).to all(include(stale: true))
    end

    it "marks stale: true when metadata is blank" do
      allow(Warehouse::Manager).to receive(:metadata).and_return({})
      result = described_class.datasets
      expect(result).to all(include(stale: true))
    end

    it "marks stale: true when schema fingerprint does not match" do
      mismatched = fresh_meta.merge(schema_fingerprint: "old_fp")
      allow(Warehouse::Manager).to receive(:metadata).and_return(mismatched)
      result = described_class.datasets
      expect(result).to all(include(stale: true))
    end

    it "each dataset has required keys" do
      required = %i[id label table description columns lastRefreshedAt stale rowCount defaultSql]
      described_class.datasets.each do |ds|
        expect(ds.keys).to include(*required)
      end
    end

    it "each dataset has non-empty columns array with name/type/description" do
      described_class.datasets.each do |ds|
        expect(ds[:columns]).to be_an(Array).and(be_present)
        ds[:columns].each do |col|
          expect(col).to include(:name, :type, :description)
        end
      end
    end

    it "defaultSql is a non-empty string" do
      described_class.datasets.each do |ds|
        expect(ds[:defaultSql]).to be_a(String).and(be_present)
      end
    end
  end

  # ------------------------------------------------------------------
  # .tables_for_query
  # ------------------------------------------------------------------
  describe ".tables_for_query" do
    it "returns only tables whose CSV paths exist" do
      allow(File).to receive(:exist?).and_return(false)

      result = described_class.tables_for_query
      expect(result).to be_empty
    end

    it "includes the expected table names when all CSVs exist" do
      allow(File).to receive(:exist?).and_return(true)

      result = described_class.tables_for_query
      names = result.map { |t| t[:name] }
      expect(names).to include(
        "batters", "pitchers",
        "fg_projections_batting", "fg_projections_pitching",
        "teams_batting", "teams_pitching"
      )
    end

    it "each entry has a :name and :path key" do
      allow(File).to receive(:exist?).and_return(true)
      described_class.tables_for_query.each do |t|
        expect(t).to include(:name, :path)
      end
    end
  end
end
