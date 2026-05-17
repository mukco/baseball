module Api
  class PlayersController < BaseController
    # GET /api/players/search?q=name
    def search
      q = params[:q].to_s.strip
      return render json: { error: "q must be at least 2 characters" }, status: :unprocessable_entity if q.length < 2

      render json: mlb.search_players(q)
    end

    # GET /api/players/:id
    def show
      info = mlb.player_info(params[:id].to_i)
      if info
        render json: info
      else
        render json: { error: "Player not found" }, status: :not_found
      end
    end

    # GET /api/players/:id/factoids?season=2026
    def factoids
      season = params.fetch(:season, Date.today.year).to_i
      render json: FactoidsService.player(player_id: params[:id].to_i, season: season)
    end
  end
end
