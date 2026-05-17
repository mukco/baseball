require "rails_helper"

RSpec.describe MlRunsService do
  let(:config) { { table: "batters", features: ["hr"], target: "woba", model_type: "random_forest" } }
  let(:result) { { task: "regression", metrics: { r2: 0.80 } } }

  before do
    # Redirect writes to a temp path so specs don't touch the real tmp/ml_runs.json
    stub_const("MlRunsService::RUNS_PATH", Pathname.new(Dir.mktmpdir).join("ml_runs.json"))
  end

  describe ".all" do
    it "returns an empty array when no file exists" do
      expect(described_class.all).to eq([])
    end
  end

  describe ".save" do
    it "persists a run and returns it with id and created_at" do
      run = described_class.save(config: config, result: result)
      expect(run[:id]).to be_a(String)
      expect(run[:created_at]).to match(/\d{4}-\d{2}-\d{2}/)
      expect(run[:config]).to eq(config)
    end

    it "prepends new runs (most recent first)" do
      described_class.save(config: config, result: result.merge(metrics: { r2: 0.5 }))
      described_class.save(config: config, result: result.merge(metrics: { r2: 0.8 }))
      runs = described_class.all
      expect(runs.first[:result][:metrics][:r2]).to eq(0.8)
    end

    it "caps stored runs at MAX_STORED" do
      stub_const("MlRunsService::MAX_STORED", 3)
      4.times { described_class.save(config: config, result: result) }
      expect(described_class.all.length).to eq(3)
    end

    it "writes valid JSON to the file" do
      described_class.save(config: config, result: result)
      raw = File.read(MlRunsService::RUNS_PATH)
      expect { JSON.parse(raw) }.not_to raise_error
    end
  end

  describe ".delete" do
    it "removes the run with the given id" do
      run = described_class.save(config: config, result: result)
      expect(described_class.delete(run[:id])).to be true
      expect(described_class.all).to be_empty
    end

    it "returns false when the id doesn't exist" do
      expect(described_class.delete("nonexistent")).to be false
    end

    it "leaves other runs intact" do
      run_a = described_class.save(config: config, result: result)
      run_b = described_class.save(config: config, result: result)
      described_class.delete(run_a[:id])
      remaining = described_class.all
      expect(remaining.map { |r| r[:id] }).to eq([run_b[:id]])
    end
  end
end
