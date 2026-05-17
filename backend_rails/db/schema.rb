# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_05_17_000003) do
  create_table "player_projections", force: :cascade do |t|
    t.text "accuracy_delta"
    t.text "actual_stats"
    t.text "component_stats"
    t.datetime "computed_at"
    t.datetime "created_at", null: false
    t.integer "player_id", null: false
    t.string "player_name"
    t.string "player_type", null: false
    t.float "projected_ip"
    t.integer "projected_pa"
    t.text "projected_stats"
    t.integer "projection_run_id", null: false
    t.string "projection_type", null: false
    t.integer "season", null: false
    t.datetime "updated_at", null: false
    t.index ["player_id", "projection_run_id", "season"], name: "idx_player_projections_per_run", unique: true
  end

  create_table "projection_runs", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "name"
    t.integer "player_count", default: 0, null: false
    t.integer "projection_scenario_id", null: false
    t.string "projection_type", null: false
    t.datetime "ran_at", null: false
    t.text "scenario_params_json", null: false
    t.integer "season", null: false
    t.text "seasons_json"
    t.datetime "updated_at", null: false
    t.index ["projection_scenario_id"], name: "index_projection_runs_on_projection_scenario_id"
  end

  create_table "projection_scenarios", force: :cascade do |t|
    t.boolean "age_curve_enabled", default: true, null: false
    t.float "age_curve_factor", default: 1.0, null: false
    t.datetime "created_at", null: false
    t.float "default_ip", default: 160.0, null: false
    t.integer "default_pa", default: 550, null: false
    t.text "description"
    t.boolean "is_default", default: false, null: false
    t.string "name", null: false
    t.boolean "park_factors_enabled", default: true, null: false
    t.float "regression_factor", default: 1.0, null: false
    t.float "statcast_weight", default: 0.5, null: false
    t.datetime "updated_at", null: false
    t.float "year1_weight", default: 5.0, null: false
    t.float "year2_weight", default: 4.0, null: false
    t.float "year3_weight", default: 3.0, null: false
  end

  create_table "simulation_games", force: :cascade do |t|
    t.integer "away_pitcher_id"
    t.string "away_pitcher_name"
    t.integer "away_score"
    t.string "away_team_abbr"
    t.string "away_team_color"
    t.integer "away_team_id", null: false
    t.string "away_team_name"
    t.text "box_score_json"
    t.datetime "created_at", null: false
    t.date "game_date", null: false
    t.integer "game_pk"
    t.integer "home_pitcher_id"
    t.string "home_pitcher_name"
    t.integer "home_score"
    t.string "home_team_abbr"
    t.string "home_team_color"
    t.integer "home_team_id", null: false
    t.string "home_team_name"
    t.boolean "is_real", default: false, null: false
    t.datetime "simulated_at"
    t.integer "simulation_league_id", null: false
    t.datetime "updated_at", null: false
    t.index ["simulation_league_id", "game_date"], name: "index_simulation_games_on_simulation_league_id_and_game_date"
    t.index ["simulation_league_id", "game_pk"], name: "index_simulation_games_on_simulation_league_id_and_game_pk", unique: true, where: "game_pk IS NOT NULL"
    t.index ["simulation_league_id"], name: "index_simulation_games_on_simulation_league_id"
  end

  create_table "simulation_leagues", force: :cascade do |t|
    t.float "batter_pitcher_blend", default: 0.45, null: false
    t.datetime "created_at", null: false
    t.date "current_sim_date"
    t.string "name", null: false
    t.integer "scenario_id"
    t.integer "season", default: -> { "strftime('%Y', 'now')" }, null: false
    t.string "status", default: "active", null: false
    t.datetime "updated_at", null: false
    t.index ["scenario_id"], name: "index_simulation_leagues_on_scenario_id"
  end

  create_table "simulation_rosters", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.text "lineup_order_json"
    t.text "roster_json"
    t.text "rotation_json"
    t.integer "simulation_league_id", null: false
    t.string "team_abbr"
    t.string "team_color"
    t.integer "team_id", null: false
    t.string "team_name"
    t.datetime "updated_at", null: false
    t.index ["simulation_league_id", "team_id"], name: "index_simulation_rosters_on_simulation_league_id_and_team_id", unique: true
    t.index ["simulation_league_id"], name: "index_simulation_rosters_on_simulation_league_id"
  end

  add_foreign_key "player_projections", "projection_runs"
  add_foreign_key "projection_runs", "projection_scenarios"
  add_foreign_key "simulation_games", "simulation_leagues"
  add_foreign_key "simulation_rosters", "simulation_leagues"
end
