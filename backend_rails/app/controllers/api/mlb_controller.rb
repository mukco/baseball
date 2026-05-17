module Api
  class MlbController < BaseController
    def watch
      render json: MlbTvService.call(game_pk: params[:game_pk].to_i)
    end
  end
end
