FactoryBot.define do
  factory :simulation_league do
    sequence(:name) { |n| "Test League #{n}" }
    season               { Date.today.year }
    batter_pitcher_blend { 0.45 }
    status               { "active" }
    current_sim_date     { Date.today }
    scenario_id          { nil }

    trait :with_scenario do
      association :projection_scenario
    end
  end

  factory :simulation_game do
    association      :simulation_league
    sequence(:game_pk) { |n| 800_000 + n }
    game_date        { Date.today }
    home_team_id     { 147 }
    away_team_id     { 111 }
    home_team_abbr   { "NYY" }
    away_team_abbr   { "BAL" }
    home_team_name   { "New York Yankees" }
    away_team_name   { "Baltimore Orioles" }
    home_team_color  { "#003087" }
    away_team_color  { "#DF4601" }
    is_real          { false }

    trait :completed do
      home_score    { 4 }
      away_score    { 2 }
      simulated_at  { Time.now }
    end

    trait :real do
      is_real    { true }
      home_score { 5 }
      away_score { 3 }
      simulated_at { Time.now }
    end
  end

  factory :simulation_job_run do
    association :simulation_league
    job_type  { "simulate_day" }
    sim_date  { Date.today }
    status    { "pending" }
  end

  factory :simulation_roster do
    association      :simulation_league
    sequence(:team_id) { |n| 100 + n }
    team_name        { "Test Team" }
    team_abbr        { "TST" }
    team_color       { "#123456" }
    roster_json      { [{ id: 1, name: "Batter One", position: "OF" },
                        { id: 2, name: "Batter Two", position: "1B" },
                        { id: 3, name: "Pitcher One", position: "SP" }].to_json }
    lineup_order_json { [1, 2].to_json }
    rotation_json    { [3].to_json }
    rotation_state_json { nil }
    bullpen_roles_json  { nil }
  end

  factory :simulation_player_stat do
    association :simulation_league
    sequence(:player_id) { |n| 600_000 + n }
    sequence(:team_id)   { |n| 100 + n }
    player_name { "Test Player" }
    player_type { "batter" }
    g { 10 }; ab { 38 }; h { 10 }; hr { 2 }; rbi { 8 }; bb { 4 }; k { 9 }; r { 5 }
    doubles { 2 }; triples { 0 }; hbp { 1 }; sf { 1 }
    gs { 0 }; g_pitched { 0 }; outs_pitched { 0 }
    h_allowed { 0 }; er { 0 }; bb_allowed { 0 }; k_pitched { 0 }; w { 0 }; l { 0 }; sv { 0 }
    bf { 0 }; hr_allowed { 0 }

    trait :pitcher do
      player_type  { "pitcher" }
      g { 0 }; ab { 0 }; h { 0 }; hr { 0 }; rbi { 0 }; bb { 0 }; k { 0 }; r { 0 }
      doubles { 0 }; triples { 0 }; hbp { 0 }; sf { 0 }
      gs { 8 }; g_pitched { 9 }; outs_pitched { 144 }
      h_allowed { 50 }; er { 20 }; bb_allowed { 18 }; k_pitched { 60 }; w { 5 }; l { 3 }; sv { 0 }
      bf { 180 }; hr_allowed { 8 }
    end
  end

  factory :simulation_config do
    association :simulation_league
    params_json { SimulationConfig::DEFAULTS.to_json }
  end

  factory :simulation_injury do
    association :simulation_league
    sequence(:player_id) { |n| 700_000 + n }
    sequence(:team_id)   { |n| 100 + n }
    player_name   { "Test Player" }
    severity      { "minor" }
    il_start_date { Date.today }
    il_end_date   { Date.today + 10 }
    returned      { false }

    trait :returned do
      returned { true }
    end

    trait :moderate do
      severity    { "moderate" }
      il_end_date { Date.today + 30 }
    end

    trait :major do
      severity    { "major" }
      il_end_date { Date.today + 90 }
    end
  end

  factory :simulation_transaction do
    association :simulation_league
    event_type    { "injury_start" }
    game_date     { Date.today }
    sequence(:player_id) { |n| 700_000 + n }
    sequence(:team_id)   { |n| 100 + n }
    player_name   { "Test Player" }
    metadata_json { { severity: "minor" }.to_json }
  end

  factory :simulation_insight do
    association  :simulation_league
    subject_type { "season" }
    subject_id   { nil }
    narrative    { "Test narrative" }
    bullets_json { {}.to_json }
    generated_at { Time.current }
  end

  factory :simulation_playoff_player_stat do
    association :simulation_league
    association :simulation_playoff_series
    sequence(:player_id) { |n| 700_100 + n }
    sequence(:team_id)   { |n| 110 + n }
    player_name  { "Test Player" }
    player_type  { "batter" }
    round        { "ws" }
    g { 4 }; ab { 15 }; h { 4 }; hr { 1 }; rbi { 3 }; bb { 2 }; k { 3 }; r { 2 }
    doubles { 1 }; triples { 0 }; hbp { 0 }; sf { 0 }
    g_pitched { 0 }; gs { 0 }; outs_pitched { 0 }
    h_allowed { 0 }; er { 0 }; bb_allowed { 0 }; k_pitched { 0 }
    bf { 0 }; hr_allowed { 0 }; w { 0 }; l { 0 }; sv { 0 }

    trait :pitcher do
      player_type  { "pitcher" }
      g { 0 }; ab { 0 }; h { 0 }; hr { 0 }; rbi { 0 }; bb { 0 }; k { 0 }; r { 0 }
      doubles { 0 }; triples { 0 }; hbp { 0 }; sf { 0 }
      g_pitched { 2 }; gs { 1 }; outs_pitched { 18 }
      h_allowed { 5 }; er { 2 }; bb_allowed { 3 }; k_pitched { 14 }
      bf { 24 }; hr_allowed { 1 }; w { 1 }; l { 0 }; sv { 0 }
    end
  end

  factory :simulation_playoff_series do
    association :simulation_league
    season         { Date.today.year }
    round          { "wc" }
    league         { "AL" }
    series_index   { 0 }
    home_team_id   { 147 }
    away_team_id   { 111 }
    home_team_abbr { "NYY" }
    away_team_abbr { "BAL" }
    home_team_color { "#003087" }
    away_team_color { "#DF4601" }
    home_wins      { 0 }
    away_wins      { 0 }
    series_length  { 3 }
    games_json     { [].to_json }
    status         { "pending" }
  end
end
