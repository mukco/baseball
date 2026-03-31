module Api
  class ScheduleController < BaseController
    # GET /api/schedule/today
    def today
      render json: mlb.schedule(Date.today.iso8601)
    end

    # GET /api/schedule/:date
    def by_date
      render json: mlb.schedule(params[:date])
    end
  end
end
