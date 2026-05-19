class WarmSimulationCacheJob < ApplicationJob
  queue_as :cache_warming

  def perform
    CacheWarmingService.warm_simulation_players!
  end
end
