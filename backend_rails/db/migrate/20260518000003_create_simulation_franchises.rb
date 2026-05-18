class CreateSimulationFranchises < ActiveRecord::Migration[8.0]
  def change
    create_table :simulation_franchises do |t|
      t.string  :name,         null: false
      t.integer :start_season, null: false
      t.timestamps
    end

    add_column :simulation_leagues, :simulation_franchise_id, :integer
    add_index  :simulation_leagues, :simulation_franchise_id
  end
end
