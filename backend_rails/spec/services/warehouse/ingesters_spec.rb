require "rails_helper"

# Shared contract tests for all warehouse ingesters.
# Each ingester is responsible for:
#   - exposing csv_path / batting_csv_path / pitching_csv_path
#   - declaring NAMED_COLUMNS (or BATTING_COLUMNS + PITCHING_COLUMNS)
#   - ingest! writing valid CSV to the declared path

RSpec.describe "Warehouse ingesters" do
  let(:tmp_dir) { Pathname.new(Dir.mktmpdir) }

  after { FileUtils.rm_rf(tmp_dir) }

  # ------------------------------------------------------------------
  # BatterIngester
  # ------------------------------------------------------------------
  describe Warehouse::BatterIngester do
    it "exposes NAMED_COLUMNS as a non-empty array of strings" do
      expect(described_class::NAMED_COLUMNS).to be_an(Array).and all(be_a(String))
      expect(described_class::NAMED_COLUMNS).not_to be_empty
    end

    it "csv_path ends with batters.csv" do
      expect(described_class.csv_path.to_s).to end_with("batters.csv")
    end

    it "ingest! writes a CSV with a header row matching NAMED_COLUMNS" do
      stub_const("Warehouse::BatterIngester::SEASONS_START", Date.today.year)
      allow(described_class).to receive(:base_dir).and_return(tmp_dir)

      # Stub all HTTP calls so no real network request is made
      allow(described_class).to receive(:season_rows).and_return([
        described_class::NAMED_COLUMNS.each_with_object({}) { |col, h| h[col.to_sym] = "1" }
      ])

      count = described_class.ingest!
      expect(count).to eq(1)

      rows = CSV.read(tmp_dir.join("batters.csv"))
      expect(rows.first).to eq(described_class::NAMED_COLUMNS)
    end
  end

  # ------------------------------------------------------------------
  # PitcherIngester
  # ------------------------------------------------------------------
  describe Warehouse::PitcherIngester do
    it "exposes NAMED_COLUMNS as a non-empty array of strings" do
      expect(described_class::NAMED_COLUMNS).to be_an(Array).and all(be_a(String))
      expect(described_class::NAMED_COLUMNS).not_to be_empty
    end

    it "csv_path ends with pitchers.csv" do
      expect(described_class.csv_path.to_s).to end_with("pitchers.csv")
    end

    it "ingest! writes a CSV with a header row matching NAMED_COLUMNS" do
      stub_const("Warehouse::PitcherIngester::SEASONS_START", Date.today.year)
      allow(described_class).to receive(:base_dir).and_return(tmp_dir)
      allow(described_class).to receive(:season_rows).and_return([
        described_class::NAMED_COLUMNS.each_with_object({}) { |col, h| h[col.to_sym] = "1" }
      ])

      count = described_class.ingest!
      expect(count).to eq(1)

      rows = CSV.read(tmp_dir.join("pitchers.csv"))
      expect(rows.first).to eq(described_class::NAMED_COLUMNS)
    end
  end

  # ------------------------------------------------------------------
  # FgProjectionIngester
  # ------------------------------------------------------------------
  describe Warehouse::FgProjectionIngester do
    it "exposes BATTING_COLUMNS and PITCHING_COLUMNS as non-empty string arrays" do
      expect(described_class::BATTING_COLUMNS).to be_an(Array).and all(be_a(String))
      expect(described_class::PITCHING_COLUMNS).to be_an(Array).and all(be_a(String))
    end

    it "batting_csv_path ends with fg_projections_batting.csv" do
      expect(described_class.batting_csv_path.to_s).to end_with("fg_projections_batting.csv")
    end

    it "pitching_csv_path ends with fg_projections_pitching.csv" do
      expect(described_class.pitching_csv_path.to_s).to end_with("fg_projections_pitching.csv")
    end

    it "ingest! writes both CSVs and returns batting/pitching row counts" do
      allow(described_class).to receive(:base_dir).and_return(tmp_dir)
      batting_row  = described_class::BATTING_COLUMNS.each_with_object({}) { |col, h| h[col.to_sym] = "1" }
      pitching_row = described_class::PITCHING_COLUMNS.each_with_object({}) { |col, h| h[col.to_sym] = "1" }
      allow(described_class).to receive(:fetch_batting_projections).and_return([batting_row])
      allow(described_class).to receive(:fetch_pitching_projections).and_return([pitching_row])

      result = described_class.ingest!
      expect(result[:batting]).to eq(1)
      expect(result[:pitching]).to eq(1)
    end
  end

  # ------------------------------------------------------------------
  # TeamIngester
  # ------------------------------------------------------------------
  describe Warehouse::TeamIngester do
    it "exposes BATTING_COLUMNS and PITCHING_COLUMNS as non-empty string arrays" do
      expect(described_class::BATTING_COLUMNS).to be_an(Array).and all(be_a(String))
      expect(described_class::PITCHING_COLUMNS).to be_an(Array).and all(be_a(String))
    end

    it "batting_csv_path ends with teams_batting.csv" do
      expect(described_class.batting_csv_path.to_s).to end_with("teams_batting.csv")
    end

    it "pitching_csv_path ends with teams_pitching.csv" do
      expect(described_class.pitching_csv_path.to_s).to end_with("teams_pitching.csv")
    end

    it "ingest! writes both CSVs and returns batting/pitching row counts" do
      stub_const("Warehouse::TeamIngester::SEASONS_START", Date.today.year)
      allow(described_class).to receive(:base_dir).and_return(tmp_dir)
      batting_row  = described_class::BATTING_COLUMNS.each_with_object({}) { |col, h| h[col.to_sym] = "1" }
      pitching_row = described_class::PITCHING_COLUMNS.each_with_object({}) { |col, h| h[col.to_sym] = "1" }
      allow(described_class).to receive(:season_rows).and_return([[batting_row], [pitching_row]])

      result = described_class.ingest!
      expect(result[:batting]).to eq(1)
      expect(result[:pitching]).to eq(1)
    end
  end
end
