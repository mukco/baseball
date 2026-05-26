class CreateSimulationPresets < ActiveRecord::Migration[8.0]
  def change
    create_table :simulation_presets do |t|
      t.string :name, null: false
      t.text   :params_json, null: false, default: "{}"
      t.timestamps
    end
    add_index :simulation_presets, :name, unique: true
  end
end
