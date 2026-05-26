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

ActiveRecord::Schema[8.1].define(version: 2026_05_19_000001) do
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
    t.float "era_fip_blend", default: 0.5, null: false
    t.integer "history_years", default: 3, null: false
    t.boolean "is_default", default: false, null: false
    t.float "min_ip_for_history", default: 5.0, null: false
    t.integer "min_pa_for_history", default: 30, null: false
    t.string "name", null: false
    t.boolean "park_factors_enabled", default: true, null: false
    t.float "regression_factor", default: 1.0, null: false
    t.float "statcast_weight", default: 0.5, null: false
    t.datetime "updated_at", null: false
    t.float "year1_weight", default: 5.0, null: false
    t.float "year2_weight", default: 4.0, null: false
    t.float "year3_weight", default: 3.0, null: false
  end

  create_table "simulation_configs", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.text "params_json", default: "{}", null: false
    t.integer "simulation_league_id", null: false
    t.datetime "updated_at", null: false
    t.index ["simulation_league_id"], name: "index_simulation_configs_on_simulation_league_id", unique: true
  end

  create_table "simulation_franchises", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.integer "start_season", null: false
    t.datetime "updated_at", null: false
  end

  create_table "simulation_games", force: :cascade do |t|
    t.text "actual_away_lineup_json"
    t.text "actual_away_pitchers_json"
    t.integer "actual_away_score"
    t.text "actual_home_lineup_json"
    t.text "actual_home_pitchers_json"
    t.integer "actual_home_score"
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
    t.index ["simulation_league_id", "is_real"], name: "index_simulation_games_on_league_and_is_real"
    t.index ["simulation_league_id", "simulated_at"], name: "index_simulation_games_on_league_and_simulated_at"
    t.index ["simulation_league_id"], name: "index_simulation_games_on_simulation_league_id"
  end

  create_table "simulation_injuries", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.integer "game_id"
    t.date "il_end_date", null: false
    t.date "il_start_date", null: false
    t.integer "player_id", null: false
    t.string "player_name"
    t.boolean "returned", default: false, null: false
    t.string "severity", null: false
    t.integer "simulation_league_id", null: false
    t.integer "team_id", null: false
    t.datetime "updated_at", null: false
    t.index ["simulation_league_id", "player_id", "returned"], name: "idx_sim_injuries_player_active"
    t.index ["simulation_league_id", "team_id", "il_end_date"], name: "idx_sim_injuries_team_date"
    t.index ["simulation_league_id"], name: "index_simulation_injuries_on_simulation_league_id"
  end

  create_table "simulation_insights", force: :cascade do |t|
    t.text "bullets_json"
    t.datetime "created_at", null: false
    t.datetime "generated_at"
    t.text "narrative"
    t.integer "simulation_league_id", null: false
    t.integer "subject_id"
    t.string "subject_type", null: false
    t.datetime "updated_at", null: false
    t.index ["simulation_league_id", "subject_type", "subject_id"], name: "idx_sim_insights_lookup", unique: true
    t.index ["simulation_league_id"], name: "index_simulation_insights_on_simulation_league_id"
  end

  create_table "simulation_job_runs", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.text "error_message"
    t.string "job_type", default: "simulate_day", null: false
    t.text "result_json"
    t.date "sim_date"
    t.integer "simulation_league_id", null: false
    t.string "status", default: "pending", null: false
    t.datetime "updated_at", null: false
    t.index ["simulation_league_id", "status"], name: "index_simulation_job_runs_on_simulation_league_id_and_status"
    t.index ["simulation_league_id"], name: "index_simulation_job_runs_on_simulation_league_id"
  end

  create_table "simulation_leagues", force: :cascade do |t|
    t.float "batter_pitcher_blend", default: 0.45, null: false
    t.datetime "created_at", null: false
    t.date "current_sim_date"
    t.string "name", null: false
    t.integer "scenario_id"
    t.integer "season", default: -> { "strftime('%Y', 'now')" }, null: false
    t.integer "simulation_franchise_id"
    t.string "status", default: "active", null: false
    t.datetime "updated_at", null: false
    t.index ["scenario_id"], name: "index_simulation_leagues_on_scenario_id"
    t.index ["simulation_franchise_id"], name: "index_simulation_leagues_on_simulation_franchise_id"
  end

  create_table "simulation_news_stories", force: :cascade do |t|
    t.boolean "ai_generated", default: false
    t.datetime "created_at", null: false
    t.integer "games_count", default: 0
    t.text "headline"
    t.integer "simulation_league_id", null: false
    t.text "stories_json"
    t.date "story_date", null: false
    t.datetime "updated_at", null: false
    t.index ["simulation_league_id", "story_date"], name: "idx_sim_news_lookup", unique: true
  end

  create_table "simulation_player_stats", force: :cascade do |t|
    t.integer "ab", default: 0, null: false
    t.integer "bb", default: 0, null: false
    t.integer "bb_allowed", default: 0, null: false
    t.integer "bf", default: 0, null: false
    t.datetime "created_at", null: false
    t.integer "doubles", default: 0, null: false
    t.integer "er", default: 0, null: false
    t.integer "g", default: 0, null: false
    t.integer "g_pitched", default: 0, null: false
    t.integer "gs", default: 0, null: false
    t.integer "h", default: 0, null: false
    t.integer "h_allowed", default: 0, null: false
    t.integer "hbp", default: 0, null: false
    t.integer "hr", default: 0, null: false
    t.integer "hr_allowed", default: 0, null: false
    t.integer "k", default: 0, null: false
    t.integer "k_pitched", default: 0, null: false
    t.integer "l", default: 0, null: false
    t.integer "outs_pitched", default: 0, null: false
    t.integer "player_id", null: false
    t.string "player_name"
    t.string "player_type"
    t.integer "r", default: 0, null: false
    t.integer "rbi", default: 0, null: false
    t.integer "sf", default: 0, null: false
    t.integer "simulation_league_id", null: false
    t.integer "sv", default: 0, null: false
    t.integer "team_id", null: false
    t.integer "triples", default: 0, null: false
    t.datetime "updated_at", null: false
    t.integer "w", default: 0, null: false
    t.index ["simulation_league_id", "player_id"], name: "index_sim_player_stats_on_league_and_player", unique: true
    t.index ["simulation_league_id", "player_type"], name: "index_sim_player_stats_on_league_and_type"
    t.index ["simulation_league_id", "team_id"], name: "index_sim_player_stats_on_league_and_team"
  end

  create_table "simulation_playoff_player_stats", force: :cascade do |t|
    t.integer "ab", default: 0, null: false
    t.integer "bb", default: 0, null: false
    t.integer "bb_allowed", default: 0, null: false
    t.integer "bf", default: 0, null: false
    t.datetime "created_at", null: false
    t.integer "doubles", default: 0, null: false
    t.integer "er", default: 0, null: false
    t.integer "g", default: 0, null: false
    t.integer "g_pitched", default: 0, null: false
    t.integer "gs", default: 0, null: false
    t.integer "h", default: 0, null: false
    t.integer "h_allowed", default: 0, null: false
    t.integer "hbp", default: 0, null: false
    t.integer "hr", default: 0, null: false
    t.integer "hr_allowed", default: 0, null: false
    t.integer "k", default: 0, null: false
    t.integer "k_pitched", default: 0, null: false
    t.integer "l", default: 0, null: false
    t.integer "outs_pitched", default: 0, null: false
    t.integer "player_id", null: false
    t.string "player_name"
    t.string "player_type"
    t.integer "r", default: 0, null: false
    t.integer "rbi", default: 0, null: false
    t.string "round", null: false
    t.integer "sf", default: 0, null: false
    t.integer "simulation_league_id", null: false
    t.integer "simulation_playoff_series_id", null: false
    t.integer "sv", default: 0, null: false
    t.integer "team_id", null: false
    t.integer "triples", default: 0, null: false
    t.datetime "updated_at", null: false
    t.integer "w", default: 0, null: false
    t.index ["simulation_league_id", "round", "team_id"], name: "idx_playoff_player_stats_league_round_team"
    t.index ["simulation_playoff_series_id", "player_id"], name: "idx_playoff_player_stats_series_player", unique: true
  end

  create_table "simulation_playoff_series", force: :cascade do |t|
    t.string "away_team_abbr"
    t.string "away_team_color"
    t.integer "away_team_id"
    t.integer "away_wins", default: 0, null: false
    t.datetime "created_at", null: false
    t.text "games_json"
    t.string "home_team_abbr"
    t.string "home_team_color"
    t.integer "home_team_id"
    t.integer "home_wins", default: 0, null: false
    t.string "league", null: false
    t.string "round", null: false
    t.integer "season", null: false
    t.integer "series_index", default: 0, null: false
    t.integer "series_length", null: false
    t.integer "simulation_league_id", null: false
    t.string "status", default: "pending", null: false
    t.datetime "updated_at", null: false
    t.integer "winner_team_id"
    t.index ["simulation_league_id", "round", "league", "series_index"], name: "index_sim_playoff_series_on_league_round", unique: true
    t.index ["simulation_league_id"], name: "index_sim_playoff_series_on_league_id"
  end

  create_table "simulation_presets", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.text "params_json", default: "{}", null: false
    t.datetime "updated_at", null: false
    t.index ["name"], name: "index_simulation_presets_on_name", unique: true
  end

  create_table "simulation_rosters", force: :cascade do |t|
    t.text "bullpen_roles_json"
    t.datetime "created_at", null: false
    t.text "lineup_order_json"
    t.text "pitcher_state_json"
    t.text "roster_json"
    t.text "rotation_json"
    t.text "rotation_state_json"
    t.integer "simulation_league_id", null: false
    t.string "team_abbr"
    t.string "team_color"
    t.integer "team_id", null: false
    t.string "team_name"
    t.datetime "updated_at", null: false
    t.index ["simulation_league_id", "team_id"], name: "index_simulation_rosters_on_simulation_league_id_and_team_id", unique: true
    t.index ["simulation_league_id"], name: "index_simulation_rosters_on_simulation_league_id"
  end

  create_table "simulation_transactions", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "event_type", null: false
    t.date "game_date", null: false
    t.text "metadata_json", default: "{}", null: false
    t.integer "player_id"
    t.string "player_name"
    t.integer "simulation_league_id", null: false
    t.integer "team_id"
    t.datetime "updated_at", null: false
    t.index ["simulation_league_id", "event_type"], name: "idx_sim_transactions_event_type"
    t.index ["simulation_league_id", "game_date"], name: "idx_sim_transactions_league_date"
    t.index ["simulation_league_id"], name: "index_simulation_transactions_on_simulation_league_id"
  end

  add_foreign_key "player_projections", "projection_runs"
  add_foreign_key "projection_runs", "projection_scenarios"
  add_foreign_key "simulation_configs", "simulation_leagues"
  add_foreign_key "simulation_games", "simulation_leagues"
  add_foreign_key "simulation_injuries", "simulation_leagues"
  add_foreign_key "simulation_insights", "simulation_leagues"
  add_foreign_key "simulation_job_runs", "simulation_leagues"
  add_foreign_key "simulation_news_stories", "simulation_leagues"
  add_foreign_key "simulation_player_stats", "simulation_leagues"
  add_foreign_key "simulation_playoff_series", "simulation_leagues"
  add_foreign_key "simulation_rosters", "simulation_leagues"
  add_foreign_key "simulation_transactions", "simulation_leagues"
end
