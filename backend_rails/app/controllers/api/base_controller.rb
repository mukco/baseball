module Api
  class BaseController < ApplicationController
    rescue_from StandardError do |e|
      Rails.logger.error("#{e.class}: #{e.message}\n#{e.backtrace&.first(5)&.join("\n")}")
      render json: { error: e.message }, status: :bad_gateway
    end

    private

    def mlb
      @mlb ||= MlbApiService.new
    end
  end
end
