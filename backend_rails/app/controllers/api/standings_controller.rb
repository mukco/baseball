module Api
  class StandingsController < BaseController
    # GET /api/standings
    def index
      season = params[:season].presence&.to_i || Date.today.year
      render json: mlb.standings(season)
    end
  end
end
