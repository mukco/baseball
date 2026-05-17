FactoryBot.define do
  factory :player_projection do
    association      :projection_run
    player_id        { 660670 }
    player_name      { "Shohei Ohtani" }
    player_type      { "batter" }
    projection_type  { "rest_of_season" }
    season           { Date.today.year }
    projected_pa     { 500 }
    projected_stats  { '{"hr":40,"avg":0.290}' }
    component_stats  { '{"bb_pct":0.12}' }
    actual_stats     { nil }
    accuracy_delta   { nil }
    computed_at      { Time.now }
  end
end
