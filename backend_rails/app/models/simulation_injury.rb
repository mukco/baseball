class SimulationInjury < ApplicationRecord
  belongs_to :simulation_league

  SEVERITIES = %w[minor moderate major].freeze

  validates :player_id,    presence: true
  validates :team_id,      presence: true
  validates :severity,     inclusion: { in: SEVERITIES }
  validates :il_start_date, presence: true
  validates :il_end_date,   presence: true

  scope :active,        -> { where(returned: false) }
  scope :on_date,       ->(date) { where("il_start_date <= ? AND il_end_date >= ?", date, date) }
  scope :returning_by,  ->(date) { active.where("il_end_date <= ?", date) }
  scope :for_team,      ->(team_id) { where(team_id: team_id) }

  def active_on?(date)
    !returned? && il_start_date <= date && il_end_date >= date
  end

  def days_remaining(from_date = Date.today)
    [(il_end_date - from_date).to_i, 0].max
  end
end
