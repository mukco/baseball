module Api
  class MlController < BaseController
    # GET /api/ml/health
    def health
      render json: MlService.health
    end

    # GET /api/ml/columns/:table?duckdb_path=...
    def columns
      render json: MlService.columns(table: params[:table])
    end

    # POST /api/ml/train
    def train
      render json: MlService.train(train_params)
    end

    private

    def train_params
      params.require(:ml).permit(
        :table, :target, :task, :model_type, :one_hot_target, :target_bins, :test_size,
        features: [],
        hyperparams: {},
        filters: {}
      ).to_h.deep_symbolize_keys
    end
  end
end
