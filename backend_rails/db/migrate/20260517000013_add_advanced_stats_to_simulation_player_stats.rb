class AddAdvancedStatsToSimulationPlayerStats < ActiveRecord::Migration[8.1]
  def change
    change_table :simulation_player_stats, bulk: true do |t|
      # Batter extras — enable proper OBP, SLG, ISO, wOBA
      t.integer :doubles,  default: 0, null: false
      t.integer :triples,  default: 0, null: false
      t.integer :hbp,      default: 0, null: false
      t.integer :sf,       default: 0, null: false

      # Pitcher extras — enable K/9, BB/9, HR/9
      t.integer :bf,         default: 0, null: false
      t.integer :hr_allowed, default: 0, null: false
    end
  end
end
