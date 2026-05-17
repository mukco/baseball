class ProjectionRun < ApplicationRecord
  belongs_to :projection_scenario
  has_many :player_projections, dependent: :destroy

  validates :projection_type, inclusion: { in: %w[rest_of_season full_season] }
  validates :season, :ran_at, presence: true

  scope :recent, -> { order(ran_at: :desc) }

  def scenario_params
    return {} if scenario_params_json.blank?
    JSON.parse(scenario_params_json)
  rescue JSON::ParserError
    {}
  end

  def seasons
    return [season] if seasons_json.blank?
    JSON.parse(seasons_json)
  rescue JSON::ParserError
    [season]
  end

  def multi_season?
    seasons.size > 1
  end

  def label
    base = ran_at.strftime("%-m/%-d %l:%M %p").strip
    prefix = name.present? ? "#{name} (#{base})" : "#{base} · #{projection_scenario.name}"
    multi_season? ? "#{prefix} [#{seasons.min}–#{seasons.max}]" : prefix
  end
end
