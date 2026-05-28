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
      cached = ProjectionAccuracyService.league_accuracy(player_type:)
      if cached
        render json: cached
      else
        ProjectionAccuracyJob.perform_later(player_type)
        render json: { loading: true, message: "Accuracy data is being computed. Refresh in a moment." }
      end
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
