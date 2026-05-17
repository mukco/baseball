class CreateProjectionScenarios < ActiveRecord::Migration[8.1]
  def change
    create_table :projection_scenarios do |t|
      t.string  :name, null: false
      t.text    :description

      t.float   :year1_weight,         default: 5.0,  null: false
      t.float   :year2_weight,         default: 4.0,  null: false
      t.float   :year3_weight,         default: 3.0,  null: false

      t.float   :regression_factor,    default: 1.0,  null: false
      t.boolean :age_curve_enabled,    default: true, null: false
      t.float   :age_curve_factor,     default: 1.0,  null: false
      t.float   :statcast_weight,      default: 0.5,  null: false
      t.boolean :park_factors_enabled, default: true, null: false

      t.integer :default_pa, default: 550,   null: false
      t.float   :default_ip, default: 160.0, null: false

      t.boolean :is_default, default: false, null: false

      t.timestamps
    end
  end
end
