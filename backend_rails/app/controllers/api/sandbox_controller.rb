module Api
  class SandboxController < BaseController
    # GET /api/sandbox/datasets
    def datasets
      render json: Sandbox::DatasetRegistry.datasets
    end

    # POST /api/sandbox/query
    def query
      sql = params.fetch(:sql, "").to_s
      limit = params.fetch(:limit, 500).to_i
      render json: Sandbox::QueryService.run(sql:, limit:)
    end
  end
end
