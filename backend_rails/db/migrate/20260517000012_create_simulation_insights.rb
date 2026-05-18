class CreateSimulationInsights < ActiveRecord::Migration[8.0]
  def change
    create_table :simulation_insights do |t|
      t.references :simulation_league, null: false, foreign_key: true
      t.string   :subject_type, null: false  # 'player', 'team', 'season'
      t.integer  :subject_id                  # player_id or team_id; nil for season
      t.text     :narrative
      t.text     :bullets_json
      t.datetime :generated_at

      t.timestamps
    end

    add_index :simulation_insights,
              [:simulation_league_id, :subject_type, :subject_id],
              unique: true,
              name: "idx_sim_insights_lookup"
  end
end
