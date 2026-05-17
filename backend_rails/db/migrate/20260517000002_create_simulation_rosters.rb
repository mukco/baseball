class CreateSimulationRosters < ActiveRecord::Migration[8.1]
  def change
    create_table :simulation_rosters do |t|
      t.references :simulation_league, null: false, foreign_key: true, index: true
      t.integer    :team_id,            null: false
      t.string     :team_name
      t.string     :team_abbr
      t.string     :team_color
      t.text       :roster_json
      t.text       :lineup_order_json
      t.text       :rotation_json
      t.timestamps
    end

    add_index :simulation_rosters, [:simulation_league_id, :team_id], unique: true
  end
end
