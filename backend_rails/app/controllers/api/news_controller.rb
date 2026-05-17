module Api
  class NewsController < BaseController
    # GET /api/news?topic=all&limit=50
    def index
      topic = params.fetch(:topic, "all")
      limit = params.fetch(:limit, 50).to_i
      render json: NewsService.fetch(topic: topic, limit: limit)
    end
  end
end
