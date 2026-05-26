class PlayerRatingService
  CACHE_TTL = 12 * 3600
  PITCHER_POS = %w[SP RP P TWP].freeze

  # Percentile cutoffs for star ratings (within this league's player pool)
  THREE_STAR_PERCENTILE = 0.70  # top 30% → 3 stars
  TWO_STAR_PERCENTILE   = 0.35  # top 65% → 2 stars

  # Composite score weights — each formula blends two predictive components
  CONTACT_BABIP_WEIGHT      = 0.6   # ball-in-play skill
  CONTACT_KRATE_WEIGHT      = 0.4   # strikeout avoidance
  POWER_ISO_WEIGHT          = 0.7   # isolated power
  POWER_HR_FB_WEIGHT        = 0.3   # home-run rate on fly balls
  HR_PREVENTION_GB_WEIGHT   = 0.5   # ground-ball tendency
  HR_PREVENTION_HRFB_WEIGHT = 0.5   # fly-ball HR suppression

  @@cache            = {}
  @@cache_timestamps = {}

  class << self
    # Returns { player_id(int) => { contact: 1-3, power: 1-3, discipline: 1-3 } }   (batters)
    #      or { player_id(int) => { stuff:   1-3, control: 1-3, hr_prevention: 1-3 } } (pitchers)
    # Scores are percentile-ranked within the full league pool so stars mean
    # "better than X% of players in this simulation", not a fixed MLB benchmark.
    def ratings_for_league(league)
      key = "player_ratings_#{league.id}"
      return @@cache[key] if cache_fresh?(key)

      result = compute(league)
      cache_set(key, result)
      result
    rescue => e
      Rails.logger.warn "[PlayerRatingService] #{e.message}"
      {}
    end

    # Bust the cache when rosters change (call from update_roster).
    def invalidate(league)
      key = "player_ratings_#{league.id}"
      @@cache.delete(key)
      @@cache_timestamps.delete(key)
    end

    private

    def compute(league)
      scenario = resolve_scenario(league)
      return {} unless scenario

      position_map = {}
      all_ids      = []

      league.simulation_rosters.each do |roster|
        Array(roster.roster).each do |player|
          pid = (player[:id] || player["id"]).to_i
          next unless pid > 0
          position_map[pid] = (player[:position] || player["position"]).to_s
          all_ids << pid
        end
      end
      all_ids.uniq!
      return {} if all_ids.empty?

      comps = fetch_components(all_ids, league.season, scenario)

      batter_ids  = all_ids.reject { |id| PITCHER_POS.include?(position_map[id]) }
      pitcher_ids = all_ids.select { |id| PITCHER_POS.include?(position_map[id]) }

      rate_batters(batter_ids, comps).merge(rate_pitchers(pitcher_ids, comps))
    end

    def resolve_scenario(league)
      if league.scenario_id
        ProjectionScenario.find_by(id: league.scenario_id)
      else
        ProjectionScenario.ensure_default!
        ProjectionScenario.default_scenario
      end
    end

    def fetch_components(player_ids, season, scenario)
      PlayerProjection
        .joins(:projection_run)
        .where(
          player_id:       player_ids,
          projection_type: "full_season",
          season:          season,
          projection_runs: { projection_scenario_id: scenario.id }
        )
        .order("projection_runs.ran_at DESC")
        .to_a
        .each_with_object({}) { |p, h| h[p.player_id] ||= p.component_stats_hash }
    end

    # -----------------------------------------------------------------------
    # Scoring
    # -----------------------------------------------------------------------

    def rate_batters(ids, comps)
      pool = ids.filter_map do |pid|
        components = comps[pid]
        next unless components&.any?
        { pid:        pid,
          contact:    batter_contact(components),
          power:      batter_power(components),
          discipline: components[:bb_pct].to_f }
      end
      stars_map(pool, :contact, :power, :discipline)
    end

    def rate_pitchers(ids, comps)
      pool = ids.filter_map do |pid|
        components = comps[pid]
        next unless components&.any?
        { pid:           pid,
          stuff:         components[:k_pct].to_f,
          control:       1.0 - components[:bb_pct].to_f,
          hr_prevention: pitcher_hr_prevention(components) }
      end
      stars_map(pool, :stuff, :control, :hr_prevention)
    end

    def batter_contact(components)
      (components[:babip].to_f    * CONTACT_BABIP_WEIGHT) +
        ((1.0 - components[:k_pct].to_f) * CONTACT_KRATE_WEIGHT)
    end

    def batter_power(components)
      (components[:iso].to_f      * POWER_ISO_WEIGHT) +
        (components[:hr_fb_pct].to_f * POWER_HR_FB_WEIGHT)
    end

    def pitcher_hr_prevention(components)
      (components[:gb_pct].to_f           * HR_PREVENTION_GB_WEIGHT) +
        ((1.0 - components[:hr_fb_pct].to_f) * HR_PREVENTION_HRFB_WEIGHT)
    end

    # -----------------------------------------------------------------------
    # Percentile → star conversion
    # -----------------------------------------------------------------------

    def stars_map(pool, *dimensions)
      return {} if pool.empty?

      # Pre-sort each dimension's values for O(n log n) percentile lookup
      sorted = dimensions.each_with_object({}) do |dim, h|
        h[dim] = pool.map { |p| p[dim] }.sort
      end

      pool.each_with_object({}) do |p, result|
        result[p[:pid]] = dimensions.each_with_object({}) do |dim, h|
          vals  = sorted[dim]
          rank  = vals.index { |v| v >= p[dim] }.to_i
          pct   = vals.length > 1 ? rank.to_f / (vals.length - 1) : 0.5
          h[dim] = pct_to_stars(pct)
        end
      end
    end

    def pct_to_stars(pct)
      if    pct >= THREE_STAR_PERCENTILE then 3
      elsif pct >= TWO_STAR_PERCENTILE   then 2
      else                                    1
      end
    end

    def cache_fresh?(key)
      @@cache.key?(key) && @@cache_timestamps[key].to_i > Time.now.to_i - CACHE_TTL
    end

    def cache_set(key, value)
      @@cache[key] = value
      @@cache_timestamps[key] = Time.now.to_i
    end
  end
end
