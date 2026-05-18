class CreateSimulationJobRuns < ActiveRecord::Migration[8.1]
  def change
    create_table :simulation_job_runs do |t|
      t.references :simulation_league, null: false, foreign_key: true
      t.string  :job_type,     null: false, default: "simulate_day"
      t.date    :sim_date
      t.string  :status,       null: false, default: "pending"
      t.text    :result_json
      t.text    :error_message
      t.timestamps
    end

    add_index :simulation_job_runs, [:simulation_league_id, :status]
  end
end
