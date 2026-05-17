module Api
  class ProjectionsController < BaseController
    # GET /api/projections/player/:id — most recent cached projection (player profile tab)
    def player
      result = ProjectionService.project_player(
        params[:id].to_i,
        scenario_id: params[:scenario_id]&.to_i,
        type:        projection_type,
        refresh:     params[:refresh] == "true"
      )
      render json: result
    end

    # GET /api/projections/accuracy/league?player_type=batter
    def league_accuracy
      player_type = params.fetch(:player_type, "batter")
      result = ProjectionAccuracyService.league_accuracy(player_type:)
      result[:error] ? render(json: result, status: :bad_gateway) : render(json: result)
    end

    # GET /api/projections/leaderboard?run_id=X&player_type=batter&season=2024
    def leaderboard
      rows = ProjectionService.leaderboard(
        run_id:      params[:run_id].to_i,
        player_type: params[:player_type].presence || "batter",
        season:      params[:season]&.to_i.presence
      )
      render json: { projections: rows, count: rows.size }
    end

    private

    def projection_type
      %w[rest_of_season full_season].include?(params[:type]) ? params[:type] : "rest_of_season"
    end
  end
end
