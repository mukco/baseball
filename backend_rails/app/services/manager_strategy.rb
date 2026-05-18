# ManagerStrategy — stub implementation of the in-game decision interface.
#
# The engine calls this object for every decision point. Today all methods
# return simple, deterministic answers. Future implementations can subclass
# or replace this without touching the engine.
#
# ai_difficulty in SimulationConfig controls which implementation is used:
#   "stub"  → this class (deterministic rules, no evaluation)
#   "basic" → placeholder for rule-based logic (not yet built)
#   "sharp" → placeholder for optimization-based logic (not yet built)

class ManagerStrategy
  BASE_INJURY_RATE = 0.006  # probability per player per game-day at rate = 1.0

  IL_DURATION = {
    "minor"    => 7..14,
    "moderate" => 15..45,
    "major"    => 46..180,
  }.freeze

  def initialize(config: {})
    @config = config
  end

  # ── Pitching decisions ────────────────────────────────────────────────────

  # Stub: engine already handles pitcher hook via SP_MAX_BF / SP_MAX_ER.
  # This method exists as the future integration point for config-driven hooks.
  def pull_starter?(_pitcher_stat, _game_state)
    false  # engine's own thresholds handle this for now
  end

  # Stub: no platoon adjustment — multiplier of 1.0 means no change.
  def platoon_factor(_batter_hand, _pitcher_hand)
    1.0
  end

  # Stub: no pinch-hitting logic.
  def use_pinch_hitter?(_batter, _pitcher, _game_state)
    false
  end

  # ── Injury rolls ─────────────────────────────────────────────────────────

  # Returns an array of { player_id:, player_name:, team_id:, severity:, days: }
  # for each player who gets injured on this game day.
  # Called once per game day before games are simulated.
  def roll_injuries(roster_players, injury_rate:)
    return [] if injury_rate <= 0

    rate = BASE_INJURY_RATE * injury_rate
    roster_players.filter_map do |p|
      next unless rand < rate

      severity = pick_severity
      days     = rand(IL_DURATION[severity])
      { player_id: p[:id], player_name: p[:name], team_id: p[:team_id], severity: severity, days: days }
    end
  end

  private

  def pick_severity
    weights = (@config["injury_severity_weights"] || SimulationConfig::DEFAULTS["injury_severity_weights"])
    rv = rand
    cum = 0.0
    weights.each do |severity, prob|
      cum += prob.to_f
      return severity if rv < cum
    end
    "minor"
  end
end
