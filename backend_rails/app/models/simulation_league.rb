class SimulationLeague < ApplicationRecord
  belongs_to :projection_scenario, optional: true
  has_many   :simulation_rosters, dependent: :destroy
  has_many   :simulation_games,   dependent: :destroy

  validates :name,   presence: true
  validates :season, presence: true
  validates :batter_pitcher_blend,
            numericality: { greater_than_or_equal_to: 0.0, less_than_or_equal_to: 1.0 }

  scope :active,  -> { where(status: "active") }
  scope :recent,  -> { order(created_at: :desc) }

  def pitcher_blend = 1.0 - batter_pitcher_blend
end
