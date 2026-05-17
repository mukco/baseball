module Api
  class MlController < BaseController
    # GET /api/ml/health
    def health
      render json: MlService.health
    end

    # GET /api/ml/columns/:table
    def columns
      render json: MlService.columns(table: params[:table])
    end

    # POST /api/ml/train
    def train
      config = train_params
      result = MlService.train(config)

      unless result[:error]
        saved = MlRunsService.save(config: config, result: result)
        result = result.merge(run_id: saved[:id])
      end

      render json: result
    end

    # GET /api/ml/runs
    def runs
      render json: MlRunsService.all
    end

    # DELETE /api/ml/runs/:id
    def delete_run
      found = MlRunsService.delete(params[:id])
      render json: { deleted: found }
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
