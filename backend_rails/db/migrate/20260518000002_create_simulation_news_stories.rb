class CreateSimulationNewsStories < ActiveRecord::Migration[8.0]
  def change
    create_table :simulation_news_stories do |t|
      t.integer :simulation_league_id, null: false
      t.date    :story_date,           null: false
      t.text    :headline
      t.text    :stories_json
      t.integer :games_count,  default: 0
      t.boolean :ai_generated, default: false
      t.timestamps
    end

    add_index :simulation_news_stories,
              [:simulation_league_id, :story_date],
              unique: true,
              name: "idx_sim_news_lookup"

    add_foreign_key :simulation_news_stories, :simulation_leagues
  end
end
