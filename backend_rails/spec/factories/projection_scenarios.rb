FactoryBot.define do
  factory :projection_scenario do
    sequence(:name) { |n| "Scenario #{n}" }
    description     { "A test projection scenario." }
    is_default      { false }
    year1_weight    { 5.0 }
    year2_weight    { 4.0 }
    year3_weight    { 3.0 }
    regression_factor  { 1.0 }
    age_curve_enabled  { true }
    age_curve_factor   { 1.0 }
    statcast_weight    { 0.5 }
    park_factors_enabled { true }
    default_pa           { 550 }
    default_ip           { 160.0 }
    era_fip_blend        { 0.5 }
    history_years        { 3 }
    min_pa_for_history   { 30 }
    min_ip_for_history   { 5.0 }

    trait :default do
      name       { "Baseline" }
      is_default { true }
    end
  end
end
