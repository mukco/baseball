class WarmOttoneuCacheJob < ApplicationJob
  queue_as :cache_warming

  def perform
    CacheWarmingService.warm_ottoneu!
  end
end
