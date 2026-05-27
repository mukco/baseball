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

    def player_analysis
      fg_id = params[:fg_id].presence
      name  = params[:name].presence
      return render json: { error: "fg_id or name required" }, status: :bad_request unless fg_id || name
      render json: OttoneuPlayerAnalysisService.call(fg_id: fg_id, name: name)
    end
  end
end
