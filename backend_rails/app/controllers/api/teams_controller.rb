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

    # GET /api/teams/:id/stats?season=
    def stats
      season = params[:season].present? ? params[:season].to_i : Date.today.year
      render json: mlb.team_season_stats(params[:id].to_i, season: season)
    end

    # GET /api/teams/:id/game_log?season=
    def game_log
      season = params[:season].present? ? params[:season].to_i : Date.today.year
      render json: mlb.team_game_log(params[:id].to_i, season)
    end

    # GET /api/teams/:id/history
    def history
      render json: mlb.team_history(params[:id].to_i)
    end
  end
end
