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

ActiveRecord::Schema[8.1].define(version: 2026_05_16_230000) do
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

  add_foreign_key "player_projections", "projection_runs"
  add_foreign_key "projection_runs", "projection_scenarios"
end
