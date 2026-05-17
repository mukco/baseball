class PlayerProjection < ApplicationRecord
  belongs_to :projection_run

  validates :player_id, :projection_type, :player_type, :season, presence: true
  validates :projection_type, inclusion: { in: %w[rest_of_season full_season] }
  validates :player_type,     inclusion: { in: %w[batter pitcher] }

  scope :for_season, ->(s) { where(season: s) }
  scope :batters,    -> { where(player_type: "batter") }
  scope :pitchers,   -> { where(player_type: "pitcher") }

  def projected_stats_hash
    return {} if projected_stats.blank?
    JSON.parse(projected_stats).transform_keys(&:to_sym)
  rescue JSON::ParserError
    {}
  end

  def component_stats_hash
    return {} if component_stats.blank?
    JSON.parse(component_stats).transform_keys(&:to_sym)
  rescue JSON::ParserError
    {}
  end

  def actual_stats_hash
    return nil if actual_stats.blank?
    JSON.parse(actual_stats).transform_keys(&:to_sym)
  rescue JSON::ParserError
    nil
  end

  def accuracy_delta_hash
    return nil if accuracy_delta.blank?
    JSON.parse(accuracy_delta).transform_keys(&:to_sym)
  rescue JSON::ParserError
    nil
  end
end
