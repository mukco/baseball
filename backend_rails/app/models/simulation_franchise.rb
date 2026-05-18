class SimulationFranchise < ApplicationRecord
  has_many :simulation_leagues, -> { order(:season) },
           foreign_key: :simulation_franchise_id,
           dependent:   :nullify

  validates :name,         presence: true
  validates :start_season, presence: true

  def current_league
    simulation_leagues.last
  end

  def seasons_count
    simulation_leagues.count
  end
end
