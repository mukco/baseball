class AddPitcherStateToSimulationRosters < ActiveRecord::Migration[8.0]
  def change
    add_column :simulation_rosters, :pitcher_state_json, :text
  end
end
