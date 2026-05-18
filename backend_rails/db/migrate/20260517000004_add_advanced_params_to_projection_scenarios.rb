class AddAdvancedParamsToProjectionScenarios < ActiveRecord::Migration[8.1]
  def change
    add_column :projection_scenarios, :era_fip_blend,       :float,   default: 0.5,  null: false
    add_column :projection_scenarios, :history_years,        :integer, default: 3,    null: false
    add_column :projection_scenarios, :min_pa_for_history,   :integer, default: 30,   null: false
    add_column :projection_scenarios, :min_ip_for_history,   :float,   default: 5.0,  null: false
  end
end
