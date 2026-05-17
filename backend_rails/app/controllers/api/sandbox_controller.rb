module Api
  class SandboxController < BaseController
    # GET /api/sandbox/datasets
    def datasets
      render json: Sandbox::DatasetRegistry.datasets
    end

    # POST /api/sandbox/query
    def query
      sql   = params.fetch(:sql, "").to_s
      limit = params.fetch(:limit, 500).to_i
      render json: Sandbox::QueryService.run(sql:, limit:)
    end

    # POST /api/sandbox/refresh
    # Kicks off a full warehouse ingestion + DuckDB rebuild. Can take 1–3 minutes.
    def refresh
      meta = Warehouse::Manager.refresh!
      render json: { ok: true, meta: }
    end
  end
end
