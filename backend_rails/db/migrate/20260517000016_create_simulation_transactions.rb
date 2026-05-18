class CreateSimulationTransactions < ActiveRecord::Migration[8.0]
  def change
    create_table :simulation_transactions do |t|
      t.references :simulation_league, null: false, foreign_key: true
      t.string  :event_type, null: false   # injury_start | injury_return | award | ...
      t.integer :player_id
      t.integer :team_id
      t.string  :player_name
      t.date    :game_date,  null: false
      t.text    :metadata_json, null: false, default: "{}"
      t.timestamps
    end

    add_index :simulation_transactions,
              [:simulation_league_id, :game_date],
              name: "idx_sim_transactions_league_date"
    add_index :simulation_transactions,
              [:simulation_league_id, :event_type],
              name: "idx_sim_transactions_event_type"
  end
end
