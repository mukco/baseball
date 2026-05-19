class WarmLeaderboardCacheJob < ApplicationJob
  queue_as :cache_warming

  def perform
    CacheWarmingService.warm_leaderboards!
  end
end
