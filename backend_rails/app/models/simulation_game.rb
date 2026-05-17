class SimulationGame < ApplicationRecord
  belongs_to :simulation_league

  validates :game_date, :home_team_id, :away_team_id, presence: true

  scope :completed,  -> { where.not(home_score: nil) }
  scope :upcoming,   -> { where(home_score: nil) }
  scope :for_date,   ->(date) { where(game_date: date) }
  scope :for_team,   ->(tid) { where("home_team_id = ? OR away_team_id = ?", tid, tid) }

  def final?    = home_score.present? && away_score.present?
  def home_win? = final? && home_score > away_score
  def away_win? = final? && away_score > home_score
  def box_score = JSON.parse(box_score_json || "{}", symbolize_names: true)
end
