class AddActualScoresToSimulationGames < ActiveRecord::Migration[8.1]
  def change
    add_column :simulation_games, :actual_home_score, :integer
    add_column :simulation_games, :actual_away_score, :integer
  end
end
