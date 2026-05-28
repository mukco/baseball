module Api
  class NewsController < BaseController
    # GET /api/news?topic=all&limit=50
    # GET /api/news?player_name=Mike+Trout
    def index
      if params[:player_name].present?
        render json: NewsService.search_by_player(name: params[:player_name])
      else
        topic = params.fetch(:topic, "all")
        limit = params.fetch(:limit, 50).to_i
        render json: NewsService.fetch(topic: topic, limit: limit)
      end
    end
  end
end
