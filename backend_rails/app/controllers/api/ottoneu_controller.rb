module Api
  class OttoneuController < Api::BaseController
    def roster
      render json: OttoneuService.my_enriched_roster
    end

    def all_rosters
      render json: OttoneuService.all_rosters
    end

    def standings
      render json: OttoneuService.standings
    end

    def auctions
      render json: OttoneuService.auctions
    end

    def waivers
      render json: OttoneuService.waivers
    end

    def cap_overview
      render json: OttoneuService.cap_overview
    end

    def loans
      render json: OttoneuService.loans
    end

    def league_stats
      render json: OttoneuLeagueStatsService.call
    end

    def league_constants
      render json: { fair_ppd: OttoneuLeagueStatsService.fair_ppd }
    end

    def player_status
      fg_id = params[:fg_id].presence
      return render json: { error: "fg_id required" }, status: :bad_request unless fg_id

      render json: OttoneuService.player_status(fg_id)
    end

    def insights
      refresh = ActiveModel::Type::Boolean.new.cast(params[:refresh])
      render json: OttoneuInsightsService.call(refresh: refresh)
    end

    def free_agents
      refresh        = ActiveModel::Type::Boolean.new.cast(params[:refresh])
      include_minors = ActiveModel::Type::Boolean.new.cast(params[:minors])
      render json: OttoneuFreeAgentsService.call(refresh: refresh, include_minors: include_minors)
    end

    def player_stats
      fg_ids = Array(params[:fg_ids]).map(&:to_s).compact
      names  = Array(params[:names]).map(&:to_s).compact
      return render json: { error: "fg_ids or names required" }, status: :bad_request if fg_ids.empty? && names.empty?
      render json: OttoneuPlayerStatsService.fetch(fg_ids: fg_ids, names: names)
    end

    def compare_analysis
      fg_id_1 = params[:fg_id_1].presence
      fg_id_2 = params[:fg_id_2].presence
      return render json: { error: "fg_id_1 and fg_id_2 required" }, status: :bad_request unless fg_id_1 && fg_id_2
      render json: OttoneuCompareAnalysisService.call(fg_id_1: fg_id_1, fg_id_2: fg_id_2)
    end

    def player_projections
      fg_ids = Array(params[:fg_ids]).map(&:to_s).compact
      return render json: { error: "fg_ids required" }, status: :bad_request if fg_ids.empty?
      render json: OttoneuPlayerStatsService.fetch_projections(fg_ids: fg_ids)
    end

    def player_analysis
      fg_id     = params[:fg_id].presence
      player_id = params[:player_id].presence
      name      = params[:name].presence
      return render json: { error: "fg_id, player_id, or name required" }, status: :bad_request \
        unless fg_id || player_id || name
      render json: OttoneuPlayerAnalysisService.call(fg_id: fg_id, player_id: player_id, name: name)
    end

    def trade_offer
      fg_id = params[:fg_id].presence
      return render json: { error: "fg_id required" }, status: :bad_request unless fg_id
      render json: OttoneuTradeOfferService.call(fg_id: fg_id)
    end

    def trade_target
      fg_id = params[:fg_id].presence
      return render json: { error: "fg_id required" }, status: :bad_request unless fg_id
      render json: OttoneuTradeTargetService.call(fg_id: fg_id)
    end

    def trade_analysis
      give            = Array(params[:give]).map(&:to_s).compact
      receive         = Array(params[:receive]).map(&:to_s).compact
      loan_out_amount = params[:loan_out_amount].to_i
      loan_in_amount  = params[:loan_in_amount].to_i
      return render json: { error: "give and receive required" }, status: :bad_request if give.empty? || receive.empty?
      render json: OttoneuTradeAnalysisService.call(give: give, receive: receive, loan_out_amount: loan_out_amount, loan_in_amount: loan_in_amount)
    end
  end
end
