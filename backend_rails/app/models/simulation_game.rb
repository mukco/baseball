class SimulationGame < ApplicationRecord
  belongs_to :simulation_league

  validates :game_date, :home_team_id, :away_team_id, presence: true

  scope :completed,  -> { where.not(simulated_at: nil) }
  scope :upcoming,   -> { where(simulated_at: nil) }
  scope :for_date,   ->(date) { where(game_date: date) }
  scope :for_team,   ->(tid) { where("home_team_id = ? OR away_team_id = ?", tid, tid) }

  def final?    = home_score.present? && away_score.present?
  def home_win? = final? && home_score > away_score
  def away_win? = final? && away_score > home_score
  def box_score = JSON.parse(box_score_json || "{}", symbolize_names: true)

  def actual_home_lineup  = JSON.parse(actual_home_lineup_json  || "[]")
  def actual_away_lineup  = JSON.parse(actual_away_lineup_json  || "[]")
  def actual_home_pitchers = JSON.parse(actual_home_pitchers_json || "[]")
  def actual_away_pitchers = JSON.parse(actual_away_pitchers_json || "[]")
end
