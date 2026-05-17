module Api
  class ProspectsController < BaseController
    # GET /api/prospects/player/:id
    def player
      render json: ProspectService.for_player(player_id: params[:id].to_i)
    end

    # GET /api/prospects/top100
    def top100
      render json: ProspectService.top100
    end

    # GET /api/prospects/team/:team_id
    def team
      render json: ProspectService.team_prospects(team_id: params[:team_id].to_i)
    end
  end
end
