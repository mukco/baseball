require "rails_helper"

RSpec.describe MlService do
  let(:base_url) { "http://localhost:8002" }

  before do
    allow(Warehouse::Manager).to receive(:duckdb_path).and_return("/tmp/test.duckdb")
  end

  describe ".health" do
    it "returns status ok when the ML service is up" do
      stub_faraday_get("#{base_url}/health", body: { status: "ok", service: "statline-ml" })
      result = described_class.health
      expect(result[:status]).to eq("ok")
    end

    it "returns an error hash when the service is unreachable" do
      stub_request(:get, "#{base_url}/health").to_raise(Faraday::ConnectionFailed.new("refused"))
      result = described_class.health
      expect(result[:error]).to match(/ML service unavailable/)
    end
  end

  describe ".columns" do
    it "returns column metadata for a valid table" do
      stub_faraday_get(
        "#{base_url}/columns/batters?duckdb_path=%2Ftmp%2Ftest.duckdb",
        body: { table: "batters", columns: [{ name: "hr", type: "INTEGER" }] }
      )
      result = described_class.columns(table: "batters")
      expect(result[:columns]).to be_an(Array)
      expect(result[:columns].first[:name]).to eq("hr")
    end

    it "propagates a 400 from the ML service as an error hash" do
      stub_request(:get, /\/columns\/bad_table/).to_return(status: 400, body: '{"detail":"Unknown table"}')
      result = described_class.columns(table: "bad_table")
      expect(result[:error]).to match(/ML service unavailable/)
    end
  end

  describe ".train" do
    let(:config) do
      {
        table: "batters",
        features: ["hr", "bb_pct"],
        target: "woba",
        task: "regression",
        model_type: "random_forest",
        hyperparams: {},
        filters: {},
      }
    end

    let(:train_response) do
      {
        model_type: "random_forest",
        task: "regression",
        metrics: { r2: 0.82, rmse: 0.03, mae: 0.02 },
        feature_importance: [{ feature: "hr", importance: 0.6 }],
        training_time_ms: 200,
        parameter_count: nil,
        architecture: nil,
        loss_history: nil,
        train_samples: 400,
        test_samples: 100,
        total_samples: 500,
      }
    end

    it "merges duckdb_path and returns training results" do
      stub_faraday_post("#{base_url}/train", body: train_response)
      result = described_class.train(config)
      expect(result[:metrics][:r2]).to eq(0.82)
      expect(result[:feature_importance]).to be_an(Array)
    end

    it "returns an error hash on connection failure" do
      stub_request(:post, "#{base_url}/train").to_raise(Faraday::ConnectionFailed.new("refused"))
      result = described_class.train(config)
      expect(result[:error]).to match(/ML service unavailable/)
    end
  end
end
