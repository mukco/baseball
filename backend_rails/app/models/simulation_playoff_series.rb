class SimulationPlayoffSeries < ApplicationRecord
  belongs_to :simulation_league

  ROUNDS = %w[wc ds cs ws].freeze
  ROUND_LABELS = { "wc" => "Wild Card", "ds" => "Division Series", "cs" => "Championship Series", "ws" => "World Series" }.freeze
  SERIES_LENGTHS = { "wc" => 3, "ds" => 5, "cs" => 7, "ws" => 7 }.freeze

  def games
    JSON.parse(games_json || "[]", symbolize_names: true)
  end

  def wins_needed
    (series_length / 2) + 1
  end

  def complete?
    status == "complete"
  end

  def winner_abbr
    return nil unless winner_team_id
    winner_team_id == home_team_id ? home_team_abbr : away_team_abbr
  end
end
