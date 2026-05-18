class CreateSimulationGames < ActiveRecord::Migration[8.1]
  def change
    create_table :simulation_games do |t|
      t.references :simulation_league, null: false, foreign_key: true, index: true
      t.integer    :game_pk
      t.date       :game_date,        null: false
      t.integer    :home_team_id,     null: false
      t.integer    :away_team_id,     null: false
      t.string     :home_team_abbr
      t.string     :away_team_abbr
      t.string     :home_team_name
      t.string     :away_team_name
      t.string     :home_team_color
      t.string     :away_team_color
      t.integer    :home_score
      t.integer    :away_score
      t.boolean    :is_real,          null: false, default: false
      t.integer    :home_pitcher_id
      t.integer    :away_pitcher_id
      t.string     :home_pitcher_name
      t.string     :away_pitcher_name
      t.text       :box_score_json
      t.datetime   :simulated_at
      t.timestamps
    end

    add_index :simulation_games, [:simulation_league_id, :game_date]
    add_index :simulation_games, [:simulation_league_id, :game_pk],
              unique: true, where: "game_pk IS NOT NULL"
  end
end
