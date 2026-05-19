module Api
  class CacheWarmingController < BaseController
    def status
      render json: CacheWarmingService.status
    end

    def warm
      tier = params[:tier]&.to_sym

      case tier
      when :simulation
        WarmSimulationCacheJob.perform_later
      when :leaderboards
        WarmLeaderboardCacheJob.perform_later
      else
        WarmSimulationCacheJob.perform_later
        WarmLeaderboardCacheJob.perform_later
      end

      render json: { enqueued: true, tier: tier || "all" }
    end
  end
end
