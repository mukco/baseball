module Api
  class StatsController < BaseController
    # GET /api/stats/:id/season?season=2024
    def season
      season = params.fetch(:season, 2024).to_i
      render json: mlb.player_season_stats(params[:id].to_i, season)
    end

    # GET /api/stats/:id/career?group=hitting
    def career
      group = params.fetch(:group, "hitting")
      render json: mlb.player_career_stats(params[:id].to_i, group: group)
    end

    # GET /api/stats/:id/statcast/pitching?season=2024
    def statcast_pitching
      season = params.fetch(:season, 2024).to_i
      render json: StatcastService.pitcher(params[:id].to_i, season)
    end

    # GET /api/stats/:id/statcast/batting?season=2024
    def statcast_batting
      season = params.fetch(:season, 2024).to_i
      render json: StatcastService.batter(params[:id].to_i, season)
    end
  end
end
