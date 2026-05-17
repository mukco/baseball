module Api
  class DailySummaryController < BaseController
    # GET /api/daily_summary
    # GET /api/daily_summary?date=2026-05-12
    def show
      refresh = ActiveModel::Type::Boolean.new.cast(params[:refresh])
      render json: DailySummaryService.call(date: params[:date], refresh: refresh)
    end
  end
end
