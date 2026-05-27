require "json"

# Pre-warms class-level caches in StatcastService and ProjectionDataService
# so user-facing requests hit memory instead of waiting on external APIs.
#
# Two logical tiers:
#   :simulation — active sim league roster players (Statcast + projection history)
#   :leaderboards — FanGraphs batting/pitching leaderboards (the 30-89s offenders)
#
# Called by WarmSimulationCacheJob and WarmLeaderboardCacheJob on separate schedules.
class CacheWarmingService
  LOG_PATH = Rails.root.join("tmp", "warehouse", "cache_warming_log.json")

  class << self
    # Warm all Ottoneu Rails.cache keys before they expire.
    # Order matters: all_rosters is a dependency for insights and free_agents.
    # Runs every 50 min — just under the 60 min TTL on most keys.
    def warm_ottoneu!
      runs    = { warmed: [], skipped: [], errors: [] }
      started = Time.now

      [
        ["ottoneu_all_rosters",   -> { OttoneuService.all_rosters }],
        ["ottoneu_league_stats",  -> { OttoneuLeagueStatsService.call(refresh: true) }],
        ["ottoneu_insights",      -> { OttoneuInsightsService.call(refresh: true) }],
        ["ottoneu_free_agents",   -> { OttoneuFreeAgentsService.call(refresh: true) }],
      ].each do |label, fn|
        begin
          result = fn.call
          if result.is_a?(Hash) && result[:error]
            runs[:errors] << { key: label, error: result[:error] }
            Rails.logger.warn("[CacheWarmingService] #{label} error: #{result[:error]}")
          else
            runs[:warmed] << label
            Rails.logger.info("[CacheWarmingService] warmed #{label}")
          end
        rescue => e
          runs[:errors] << { key: label, error: e.message }
          Rails.logger.error("[CacheWarmingService] #{label} raised: #{e.message}")
        end
      end

      write_log(:ottoneu, 4, runs, started)
      runs
    end

    # Warm caches for all players on active simulation league rosters.
    # Runs frequently (~every 30 min) — keeps simulation hot paths fast.
    def warm_simulation_players!
      season   = Date.today.year
      runs     = { warmed: [], skipped: [], errors: [] }
      started  = Time.now

      player_ids = active_simulation_player_ids
      Rails.logger.info("[CacheWarmingService] warming #{player_ids.size} simulation players (season #{season})")

      player_ids.each do |player_id|
        warm_player(player_id, season, runs)
      end

      write_log(:simulation, player_ids.size, runs, started)
      runs
    end

    # Warm FanGraphs leaderboard caches. These are the slowest HTTP calls (34-89s each).
    # Runs less frequently (~every 6h) since leaderboard data changes slowly.
    def warm_leaderboards!
      season  = Date.today.year
      runs    = { warmed: [], skipped: [], errors: [] }
      started = Time.now

      [
        ["batting_leaderboard",  -> { StatcastService.batting_leaderboard(season) }],
        ["pitching_leaderboard", -> { StatcastService.pitching_leaderboard(season) }],
      ].each do |label, fn|
        begin
          result = fn.call
          if result.is_a?(Hash) && result[:error]
            runs[:errors] << { key: label, error: result[:error] }
            Rails.logger.warn("[CacheWarmingService] #{label} error: #{result[:error]}")
          else
            runs[:warmed] << label
            Rails.logger.info("[CacheWarmingService] warmed #{label} (#{Array(result).size} rows)")
          end
        rescue => e
          runs[:errors] << { key: label, error: e.message }
          Rails.logger.error("[CacheWarmingService] #{label} raised: #{e.message}")
        end
      end

      write_log(:leaderboards, 2, runs, started)
      runs
    end

    # Summary of the last warm run — surfaced by the /api/cache/status endpoint.
    def status
      return { "status" => "never_run" } unless File.exist?(LOG_PATH)
      JSON.parse(File.read(LOG_PATH))
    rescue JSON::ParserError
      { "status" => "log_corrupt" }
    end

    private

    # Collect unique MLB player IDs from all active simulation league rosters.
    def active_simulation_player_ids
      SimulationRoster
        .joins(:simulation_league)
        .where(simulation_leagues: { status: "active" })
        .pluck(:roster_json)
        .flat_map { |raw| parse_roster_ids(raw) }
        .uniq
        .compact
    rescue => e
      Rails.logger.error("[CacheWarmingService] failed to load simulation player IDs: #{e.message}")
      []
    end

    def parse_roster_ids(raw)
      return [] if raw.blank?
      Array(JSON.parse(raw)).map { |p| (p["player_id"] || p["id"])&.to_i }.select { |id| id&.positive? }
    rescue JSON::ParserError
      []
    end

    def warm_player(player_id, season, runs)
      [
        ["statcast_batter",  -> { StatcastService.batter(player_id, season) }],
        ["statcast_pitcher", -> { StatcastService.pitcher(player_id, season) }],
        ["hover_stats",      -> { HoverStatsService.call(player_id: player_id) }],
      ].each do |label, fn|
        key = "#{label}_#{player_id}"
        begin
          result = fn.call
          if result.is_a?(Hash) && result[:error]
            runs[:skipped] << key
          else
            runs[:warmed] << key
          end
        rescue => e
          runs[:errors] << { key: key, error: e.message }
          Rails.logger.warn("[CacheWarmingService] #{key} raised: #{e.message}")
        end
      end
    end

    def write_log(tier, total, runs, started)
      existing = status.is_a?(Hash) ? status : {}
      entry = {
        tier:        tier.to_s,
        total:       total,
        warmed:      runs[:warmed].size,
        skipped:     runs[:skipped].size,
        errors:      runs[:errors].size,
        error_keys:  runs[:errors].map { |e| e[:key] },
        duration_s:  (Time.now - started).round(1),
        ran_at:      Time.now.utc.iso8601,
      }
      FileUtils.mkdir_p(File.dirname(LOG_PATH))
      File.write(LOG_PATH, JSON.pretty_generate(existing.merge(tier.to_s => entry)))
    rescue => e
      Rails.logger.warn("[CacheWarmingService] failed to write log: #{e.message}")
    end
  end
end
