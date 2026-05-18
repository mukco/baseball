class AddRotationBullpenToSimulationRosters < ActiveRecord::Migration[8.0]
  def change
    add_column :simulation_rosters, :rotation_state_json, :text
    add_column :simulation_rosters, :bullpen_roles_json,  :text
  end
end
