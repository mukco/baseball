module Api
  class GamesController < BaseController
    # GET /api/games/:game_pk
    def show
      render json: mlb.game_details(params[:game_pk].to_i)
    end

    # GET /api/games/:game_pk/plays
    def plays
      render json: mlb.play_by_play(params[:game_pk].to_i)
    end

    # GET /api/games/:game_pk/insights?refresh=true
    def insights
      refresh = ActiveModel::Type::Boolean.new.cast(params[:refresh])
      render json: GameInsightsService.call(game_pk: params[:game_pk].to_i, refresh: refresh)
    end

    # GET /api/games/:game_pk/factoids
    def factoids
      render json: FactoidsService.game(game_pk: params[:game_pk].to_i)
    end

    # GET /api/games/:game_pk/win_probability
    def win_probability
      render json: mlb.win_probability(params[:game_pk].to_i)
    end
  end
end
