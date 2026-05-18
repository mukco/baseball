class CreateSimulationPlayoffSeries < ActiveRecord::Migration[8.0]
  def change
    create_table :simulation_playoff_series do |t|
      t.integer :simulation_league_id, null: false
      t.integer :season,               null: false
      t.string  :round,                null: false  # wc | ds | cs | ws
      t.string  :league,               null: false  # AL | NL | MLB
      t.integer :series_index,         null: false, default: 0
      t.integer :home_team_id
      t.integer :away_team_id
      t.string  :home_team_abbr
      t.string  :away_team_abbr
      t.string  :home_team_color
      t.string  :away_team_color
      t.integer :home_wins,            default: 0, null: false
      t.integer :away_wins,            default: 0, null: false
      t.integer :winner_team_id
      t.integer :series_length,        null: false  # 3 (WC), 5 (DS), 7 (CS/WS)
      t.text    :games_json
      t.string  :status,               default: "pending", null: false

      t.timestamps
    end

    add_index :simulation_playoff_series,
              [:simulation_league_id, :round, :league, :series_index],
              unique: true,
              name: "index_sim_playoff_series_on_league_round"
    add_index :simulation_playoff_series, :simulation_league_id,
              name: "index_sim_playoff_series_on_league_id"

    add_foreign_key :simulation_playoff_series, :simulation_leagues
  end
end
