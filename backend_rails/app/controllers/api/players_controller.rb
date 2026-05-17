module Api
  class PlayersController < BaseController
    # GET /api/players/search?q=name
    def search
      q = params[:q].to_s.strip
      return render json: { error: "q must be at least 2 characters" }, status: :unprocessable_entity if q.length < 2

      render json: mlb.search_players(q)
    rescue => e
      render json: { error: "search_unavailable", message: e.message }, status: :service_unavailable
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

    # GET /api/players/:id/hover_stats
    def hover_stats
      render json: HoverStatsService.call(player_id: params[:id].to_i)
    end

    # GET /api/players/:id/fantasy
    def fantasy
      info = mlb.player_info(params[:id].to_i)
      return render json: { found: false } unless info

      result = YahooFantasyService.player_fantasy_data(
        name: info[:name],
        team_abbr: info[:teamAbbrev]
      )

      render json: result
    end
  end
end
