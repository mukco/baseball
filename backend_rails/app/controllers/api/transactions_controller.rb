module Api
  class TransactionsController < BaseController
    # GET /api/transactions?team_id=&player_id=&start_date=&end_date=&limit=
    def index
      start_date = params[:start_date].presence || (Date.current - 30).iso8601
      end_date   = params[:end_date].presence   || Date.current.iso8601
      limit      = [params.fetch(:limit, 200).to_i, 500].min

      render json: mlb.transactions(
        team_id:    params[:team_id].presence,
        player_id:  params[:player_id].presence,
        start_date: start_date,
        end_date:   end_date,
        limit:      limit
      )
    end
  end
end
