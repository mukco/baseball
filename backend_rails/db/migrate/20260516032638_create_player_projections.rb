class CreatePlayerProjections < ActiveRecord::Migration[8.1]
  def change
    create_table :player_projections do |t|
      t.integer    :player_id,         null: false
      t.references :projection_scenario, null: false, foreign_key: true

      t.string  :projection_type, null: false  # 'rest_of_season' | 'full_season'
      t.string  :player_type,     null: false  # 'batter' | 'pitcher'
      t.integer :season,          null: false

      t.integer :projected_pa
      t.float   :projected_ip

      t.text :projected_stats   # JSON
      t.text :component_stats   # JSON (intermediate components for explainability)

      t.datetime :computed_at

      t.timestamps
    end

    add_index :player_projections,
      [ :player_id, :projection_scenario_id, :projection_type, :season ],
      unique: true,
      name: "idx_player_projections_unique"
  end
end
