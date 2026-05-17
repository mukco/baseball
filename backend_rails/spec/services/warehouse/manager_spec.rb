require "rails_helper"

RSpec.describe Warehouse::Manager do
  let(:tmp_dir)  { Pathname.new(Dir.mktmpdir) }
  let(:db_path)  { tmp_dir.join("baseball.duckdb") }
  let(:meta_path){ tmp_dir.join("warehouse.metadata.json") }

  before do
    stub_const("Warehouse::Manager::CACHE_TTL", 6 * 3600)
    allow(described_class).to receive(:base_dir).and_return(tmp_dir)
  end

  after { FileUtils.rm_rf(tmp_dir) }

  describe ".duckdb_path" do
    it "returns a string path inside the warehouse dir" do
      expect(described_class.duckdb_path).to end_with("baseball.duckdb")
    end
  end

  describe ".exists?" do
    it "returns false when the DuckDB file is absent" do
      expect(described_class.exists?).to be false
    end

    it "returns true when the DuckDB file is present" do
      FileUtils.touch(db_path)
      expect(described_class.exists?).to be true
    end
  end

  describe ".metadata" do
    it "returns empty hash when metadata file is absent" do
      expect(described_class.metadata).to eq({})
    end

    it "parses the metadata JSON when present" do
      meta = { last_refreshed_at: Time.now.utc.iso8601, batter_rows: 5000 }
      File.write(meta_path, JSON.generate(meta))
      result = described_class.metadata
      expect(result[:batter_rows]).to eq(5000)
    end

    it "returns empty hash on malformed JSON" do
      File.write(meta_path, "not json")
      expect(described_class.metadata).to eq({})
    end
  end

  describe ".stale?" do
    it "returns true when no metadata exists" do
      expect(described_class.stale?).to be true
    end

    it "returns true when metadata is older than CACHE_TTL" do
      FileUtils.touch(db_path)
      old_ts = (Time.now - 7 * 3600).utc.iso8601
      meta = { last_refreshed_at: old_ts, schema_fingerprint: described_class.schema_fingerprint }
      File.write(meta_path, JSON.generate(meta))
      expect(described_class.stale?).to be true
    end

    it "returns false when metadata is recent and fingerprint matches" do
      FileUtils.touch(db_path)
      meta = {
        last_refreshed_at: Time.now.utc.iso8601,
        schema_fingerprint: described_class.schema_fingerprint
      }
      File.write(meta_path, JSON.generate(meta))
      expect(described_class.stale?).to be false
    end

    it "returns true when schema fingerprint has changed" do
      FileUtils.touch(db_path)
      meta = {
        last_refreshed_at: Time.now.utc.iso8601,
        schema_fingerprint: "old_fingerprint"
      }
      File.write(meta_path, JSON.generate(meta))
      expect(described_class.stale?).to be true
    end
  end

  describe ".schema_fingerprint" do
    it "returns an 8-char hex string" do
      fp = described_class.schema_fingerprint
      expect(fp).to match(/\A[0-9a-f]{8}\z/)
    end

    it "is stable across calls" do
      expect(described_class.schema_fingerprint).to eq(described_class.schema_fingerprint)
    end
  end
end
