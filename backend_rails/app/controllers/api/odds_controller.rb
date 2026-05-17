module Api
  class OddsController < Api::BaseController
    # GET /api/odds/today?date=2026-05-15
    def today
      render json: OddsService.today(date: params[:date])
    end
  end
end
