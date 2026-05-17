class CreateSimulationLeagues < ActiveRecord::Migration[8.1]
  def change
    create_table :simulation_leagues do |t|
      t.string  :name,                 null: false
      t.integer :season,               null: false, default: -> { "strftime('%Y', 'now')" }
      t.integer :scenario_id
      t.float   :batter_pitcher_blend, null: false, default: 0.45
      t.date    :current_sim_date
      t.string  :status,               null: false, default: "active"
      t.timestamps
    end

    add_index :simulation_leagues, :scenario_id
  end
end
