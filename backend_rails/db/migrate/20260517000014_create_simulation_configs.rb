class CreateSimulationConfigs < ActiveRecord::Migration[8.0]
  def change
    create_table :simulation_configs do |t|
      t.references :simulation_league, null: false, foreign_key: true, index: { unique: true }
      t.text :params_json, null: false, default: "{}"
      t.timestamps
    end
  end
end
