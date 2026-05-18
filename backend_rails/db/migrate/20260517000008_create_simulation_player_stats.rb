class CreateSimulationPlayerStats < ActiveRecord::Migration[8.0]
  def change
    create_table :simulation_player_stats do |t|
      t.integer :simulation_league_id, null: false
      t.integer :team_id,              null: false
      t.integer :player_id,            null: false
      t.string  :player_name
      t.string  :player_type

      # Batter counting stats
      t.integer :g,   default: 0, null: false
      t.integer :ab,  default: 0, null: false
      t.integer :h,   default: 0, null: false
      t.integer :hr,  default: 0, null: false
      t.integer :rbi, default: 0, null: false
      t.integer :bb,  default: 0, null: false
      t.integer :k,   default: 0, null: false
      t.integer :r,   default: 0, null: false

      # Pitcher counting stats (outs_pitched stores raw outs; IP = outs/3 + (outs%3)/10)
      t.integer :gs,           default: 0, null: false
      t.integer :g_pitched,    default: 0, null: false
      t.integer :outs_pitched, default: 0, null: false
      t.integer :h_allowed,    default: 0, null: false
      t.integer :er,           default: 0, null: false
      t.integer :bb_allowed,   default: 0, null: false
      t.integer :k_pitched,    default: 0, null: false
      t.integer :w,            default: 0, null: false
      t.integer :l,            default: 0, null: false
      t.integer :sv,           default: 0, null: false

      t.timestamps
    end

    add_index :simulation_player_stats, [:simulation_league_id, :player_id], unique: true,
              name: "index_sim_player_stats_on_league_and_player"
    add_index :simulation_player_stats, [:simulation_league_id, :team_id],
              name: "index_sim_player_stats_on_league_and_team"
    add_index :simulation_player_stats, [:simulation_league_id, :player_type],
              name: "index_sim_player_stats_on_league_and_type"

    add_foreign_key :simulation_player_stats, :simulation_leagues
  end
end
