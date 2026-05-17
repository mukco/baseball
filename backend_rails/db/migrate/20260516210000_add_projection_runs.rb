class AddProjectionRuns < ActiveRecord::Migration[8.0]
  def up
    create_table :projection_runs do |t|
      t.references :projection_scenario, null: false, foreign_key: true
      t.text     :scenario_params_json, null: false
      t.string   :projection_type,      null: false
      t.integer  :season,               null: false
      t.integer  :player_count,         default: 0, null: false
      t.datetime :ran_at,               null: false
      t.string   :name
      t.timestamps
    end

    # Clear existing projections — they lack run context
    execute "DELETE FROM player_projections"

    remove_index  :player_projections, name: "idx_player_projections_unique"
    remove_column :player_projections, :projection_scenario_id

    add_column      :player_projections, :projection_run_id, :integer, null: false
    add_foreign_key :player_projections, :projection_runs

    add_index :player_projections, %i[player_id projection_run_id],
      unique: true, name: "idx_player_projections_per_run"
  end

  def down
    remove_index    :player_projections, name: "idx_player_projections_per_run"
    remove_foreign_key :player_projections, :projection_runs
    remove_column   :player_projections, :projection_run_id

    add_column      :player_projections, :projection_scenario_id, :integer, null: false, default: 0
    add_foreign_key :player_projections, :projection_scenarios
    add_index :player_projections,
      %i[player_id projection_scenario_id projection_type season],
      unique: true, name: "idx_player_projections_unique"

    drop_table :projection_runs
  end
end
