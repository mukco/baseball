class SimulationLeague < ApplicationRecord
  belongs_to :projection_scenario,  foreign_key: :scenario_id,           optional: true
  belongs_to :simulation_franchise, foreign_key: :simulation_franchise_id, optional: true
  has_one    :simulation_config,         dependent: :destroy
  has_many   :simulation_rosters,        dependent: :destroy
  has_many   :simulation_games,          dependent: :destroy
  has_many   :simulation_job_runs,       dependent: :destroy
  has_many   :simulation_player_stats,   dependent: :destroy
  has_many   :simulation_playoff_series, dependent: :destroy
  has_many   :simulation_insights,       dependent: :destroy
  has_many   :simulation_injuries,       dependent: :destroy
  has_many   :simulation_transactions,   dependent: :destroy
  has_many   :simulation_news_stories,   dependent: :destroy

  validates :name,   presence: true
  validates :season, presence: true
  validates :batter_pitcher_blend,
            numericality: { greater_than_or_equal_to: 0.0, less_than_or_equal_to: 1.0 }

  scope :active,  -> { where(status: "active") }
  scope :recent,  -> { order(created_at: :desc) }

  def pitcher_blend = 1.0 - batter_pitcher_blend
end
