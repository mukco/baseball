require "rails_helper"

RSpec.describe "Api::SandboxController", type: :request do
  describe "POST /api/sandbox/query" do
    context "with a valid SELECT query" do
      let(:service_result) do
        {
          columns: ["player", "hr"],
          rows: [["Ohtani", 44]],
          rowCount: 1,
          truncated: false,
          runtimeMs: 12,
          datasets: []
        }
      end

      before { allow(Sandbox::QueryService).to receive(:run).and_return(service_result) }

      it "returns 200 with query results" do
        post "/api/sandbox/query", params: { sql: "SELECT * FROM batters", limit: 10 }, as: :json
        expect(response).to have_http_status(:ok)
        body = response.parsed_body
        expect(body["columns"]).to eq(["player", "hr"])
        expect(body["rowCount"]).to eq(1)
      end
    end

    context "with a rejected query" do
      before do
        allow(Sandbox::QueryService).to receive(:run)
          .and_raise(RuntimeError, "Only read-only SELECT queries are allowed")
      end

      it "returns 502 with an error message" do
        post "/api/sandbox/query", params: { sql: "DELETE FROM batters" }, as: :json
        expect(response).to have_http_status(:bad_gateway)
        expect(response.parsed_body["error"]).to match(/Only read-only SELECT queries are allowed/)
      end
    end
  end

end
