class CreateSimulationInjuries < ActiveRecord::Migration[8.0]
  def change
    create_table :simulation_injuries do |t|
      t.references :simulation_league, null: false, foreign_key: true
      t.integer  :player_id,    null: false
      t.integer  :team_id,      null: false
      t.string   :player_name
      t.string   :severity,     null: false  # minor | moderate | major
      t.date     :il_start_date, null: false
      t.date     :il_end_date,   null: false
      t.integer  :game_id                    # simulation_game where injury occurred
      t.boolean  :returned,     default: false, null: false
      t.timestamps
    end

    add_index :simulation_injuries,
              [:simulation_league_id, :player_id, :returned],
              name: "idx_sim_injuries_player_active"
    add_index :simulation_injuries,
              [:simulation_league_id, :team_id, :il_end_date],
              name: "idx_sim_injuries_team_date"
  end
end
