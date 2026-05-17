FactoryBot.define do
  factory :projection_run do
    association     :projection_scenario
    projection_type { "rest_of_season" }
    season          { Date.today.year }
    ran_at          { Time.now }
    player_count    { 0 }
    scenario_params_json { "{}" }
    seasons_json    { nil }
    name            { nil }
  end
end
