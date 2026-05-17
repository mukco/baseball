module Api
  class ProjectionRunsController < BaseController
    def index
      runs = ProjectionService.list_runs(
        scenario_id: params[:scenario_id]&.to_i.presence,
        season:      params[:season]&.to_i.presence
      )
      render json: { runs: runs, count: runs.size }
    end

    def create
      player_ids = Array(params[:player_ids]).map(&:to_i).select { |id| id > 0 }
      return render json: { error: "player_ids is required and must not be empty" }, status: 422 if player_ids.empty?

      seasons = Array(params[:seasons]).map(&:to_i).select { |s| s >= 2020 }

      result = ProjectionService.create_run(
        scenario_id:     params[:scenario_id]&.to_i,
        player_ids:      player_ids,
        projection_type: projection_type,
        seasons:         seasons.any? ? seasons : nil,
        name:            params[:name].presence
      )

      if result[:error]
        render json: result, status: 422
      else
        render json: result, status: 201
      end
    end

    def destroy
      run = ProjectionRun.find(params[:id])
      run.destroy!
      render json: { deleted: true, id: params[:id].to_i }
    rescue ActiveRecord::RecordNotFound
      render json: { error: "Run not found" }, status: 404
    end

    private

    def projection_type
      %w[rest_of_season full_season].include?(params[:projection_type]) ? params[:projection_type] : "rest_of_season"
    end
  end
end
