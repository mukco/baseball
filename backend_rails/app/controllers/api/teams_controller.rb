module Api
  class TeamsController < BaseController
    # GET /api/teams
    def index
      render json: mlb.all_teams
    end

    # GET /api/teams/:id
    def show
      team = mlb.team_info(params[:id].to_i)
      if team
        render json: team
      else
        render json: { error: "Team not found" }, status: :not_found
      end
    end

    # GET /api/teams/:id/factoids
    def factoids
      render json: FactoidsService.team(team_id: params[:id].to_i)
    end
  end
end
