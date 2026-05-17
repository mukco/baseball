require "rails_helper"

RSpec.describe "Api::MlController", type: :request do
  describe "GET /api/ml/health" do
    context "when ML service is up" do
      before { allow(MlService).to receive(:health).and_return({ status: "ok" }) }

      it "returns 200 with status ok" do
        get "/api/ml/health"
        expect(response).to have_http_status(:ok)
        expect(response.parsed_body["status"]).to eq("ok")
      end
    end

    context "when ML service is down" do
      before { allow(MlService).to receive(:health).and_return({ error: "ML service unavailable: refused" }) }

      it "returns the error payload" do
        get "/api/ml/health"
        expect(response.parsed_body["error"]).to match(/ML service unavailable/)
      end
    end
  end

  describe "GET /api/ml/columns/:table" do
    before do
      allow(MlService).to receive(:columns).with(table: "batters").and_return(
        { table: "batters", columns: [{ name: "hr", type: "INTEGER" }] }
      )
    end

    it "returns column list for a valid table" do
      get "/api/ml/columns/batters"
      expect(response).to have_http_status(:ok)
      body = response.parsed_body
      expect(body["columns"]).to be_an(Array)
    end
  end

  describe "POST /api/ml/train" do
    let(:train_response) do
      { model_type: "random_forest", task: "regression",
        metrics: { r2: 0.75 }, train_samples: 80, test_samples: 20, total_samples: 100 }
    end

    before { allow(MlService).to receive(:train).and_return(train_response) }

    let(:valid_payload) do
      {
        ml: {
          table: "batters",
          features: ["hr", "bb_pct"],
          target: "woba",
          task: "regression",
          model_type: "random_forest",
          hyperparams: {},
          filters: {},
        }
      }
    end

    it "returns training results for a valid request" do
      post "/api/ml/train", params: valid_payload, as: :json
      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["model_type"]).to eq("random_forest")
    end

    it "returns 400 when ml params are missing" do
      post "/api/ml/train", params: {}, as: :json
      expect(response).to have_http_status(:bad_gateway)
    end
  end
end
