class SimulationRoster < ApplicationRecord
  belongs_to :simulation_league

  validates :team_id, presence: true,
                      uniqueness: { scope: :simulation_league_id }

  def roster       = JSON.parse(roster_json || "[]",       symbolize_names: true)
  def lineup_order = JSON.parse(lineup_order_json || "[]")
  def rotation     = JSON.parse(rotation_json || "[]")
end
