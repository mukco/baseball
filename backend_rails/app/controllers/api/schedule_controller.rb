module Api
  class ScheduleController < BaseController
    # GET /api/schedule/today
    def today
      render json: mlb.schedule(Date.today.iso8601)
    end

    # GET /api/schedule/hot_game?date=YYYY-MM-DD
    def hot_game
      date = params[:date].presence || Date.today.iso8601
      render json: HotGameService.for_date(date)
    end

    # GET /api/schedule/:date
    def by_date
      render json: mlb.schedule(params[:date])
    end
  end
end
