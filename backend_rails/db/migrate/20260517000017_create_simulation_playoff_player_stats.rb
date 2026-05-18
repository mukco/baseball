class CreateSimulationPlayoffPlayerStats < ActiveRecord::Migration[8.1]
  def change
    create_table :simulation_playoff_player_stats do |t|
      t.integer :simulation_league_id,         null: false
      t.integer :simulation_playoff_series_id, null: false
      t.string  :round,                        null: false
      t.integer :player_id,                    null: false
      t.string  :player_name
      t.string  :player_type
      t.integer :team_id,                      null: false

      # Batter stats
      t.integer :g,       default: 0, null: false
      t.integer :ab,      default: 0, null: false
      t.integer :h,       default: 0, null: false
      t.integer :hr,      default: 0, null: false
      t.integer :rbi,     default: 0, null: false
      t.integer :bb,      default: 0, null: false
      t.integer :k,       default: 0, null: false
      t.integer :r,       default: 0, null: false
      t.integer :doubles, default: 0, null: false
      t.integer :triples, default: 0, null: false
      t.integer :hbp,     default: 0, null: false
      t.integer :sf,      default: 0, null: false

      # Pitcher stats
      t.integer :g_pitched,    default: 0, null: false
      t.integer :gs,           default: 0, null: false
      t.integer :outs_pitched, default: 0, null: false
      t.integer :h_allowed,    default: 0, null: false
      t.integer :er,           default: 0, null: false
      t.integer :bb_allowed,   default: 0, null: false
      t.integer :k_pitched,    default: 0, null: false
      t.integer :bf,           default: 0, null: false
      t.integer :hr_allowed,   default: 0, null: false
      t.integer :w,            default: 0, null: false
      t.integer :l,            default: 0, null: false
      t.integer :sv,           default: 0, null: false

      t.timestamps
    end

    add_index :simulation_playoff_player_stats,
              %i[simulation_playoff_series_id player_id],
              unique: true,
              name: "idx_playoff_player_stats_series_player"

    add_index :simulation_playoff_player_stats,
              %i[simulation_league_id round team_id],
              name: "idx_playoff_player_stats_league_round_team"
  end
end
