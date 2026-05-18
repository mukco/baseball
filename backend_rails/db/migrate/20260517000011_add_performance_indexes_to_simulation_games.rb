class AddPerformanceIndexesToSimulationGames < ActiveRecord::Migration[8.1]
  def change
    # Speeds up completed/upcoming scopes and simulate_season date queries
    add_index :simulation_games, [:simulation_league_id, :simulated_at],
              name: "index_simulation_games_on_league_and_simulated_at"

    # Speeds up live_mode? check and real/sim standings split
    add_index :simulation_games, [:simulation_league_id, :is_real],
              name: "index_simulation_games_on_league_and_is_real"
  end
end
