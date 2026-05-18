class AddActualLineupsToSimulationGames < ActiveRecord::Migration[8.1]
  def change
    # Batting order player IDs as they actually lined up (real games only)
    add_column :simulation_games, :actual_home_lineup_json, :text
    add_column :simulation_games, :actual_away_lineup_json, :text
    # All pitcher IDs who appeared, starter first (real games only)
    add_column :simulation_games, :actual_home_pitchers_json, :text
    add_column :simulation_games, :actual_away_pitchers_json, :text
  end
end
