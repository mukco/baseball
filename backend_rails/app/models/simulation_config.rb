class SimulationConfig < ApplicationRecord
  belongs_to :simulation_league

  DEFAULTS = {
    "run_environment"      => 1.0,
    "hr_environment"       => 1.0,
    "park_factor_strength" => 0.0,
    "variance"             => 1.0,
    "injury_rate"          => 0.0,
    "injury_il_days_min"   => 7,
    "injury_il_days_max"   => 60,
    "injury_severity_weights" => { "minor" => 0.60, "moderate" => 0.30, "major" => 0.10 },
    "ai_difficulty"        => "stub",
  }.freeze

  PRESETS = {
    "realistic"    => {},
    "no_injuries"  => { "injury_rate" => 0.0 },
    "chaos"        => { "variance" => 1.8, "injury_rate" => 1.5 },
    "pitchers_era" => { "run_environment" => 0.75, "hr_environment" => 0.6 },
    "launch_angle" => { "run_environment" => 1.2,  "hr_environment" => 1.8 },
  }.freeze

  validate :params_shape

  def params
    JSON.parse(params_json || "{}")
  rescue JSON::ParserError
    {}
  end

  def params=(hash)
    self.params_json = (hash || {}).to_json
  end

  def effective
    DEFAULTS.merge(params)
  end

  def apply_preset!(name)
    overrides = PRESETS[name.to_s] || {}
    self.params = params.merge(overrides)
  end

  private

  def params_shape
    JSON.parse(params_json || "{}")
    true
  rescue JSON::ParserError
    errors.add(:params_json, "must be valid JSON")
  end
end
