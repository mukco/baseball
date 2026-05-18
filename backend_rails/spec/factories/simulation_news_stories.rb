FactoryBot.define do
  factory :simulation_news_story do
    association :simulation_league
    story_date   { Date.today }
    headline     { "Power surge highlights Tuesday's slate" }
    stories_json {
      [
        { "headline" => "Judge homers twice as Yankees rout Tigers", "body" => "Two-run shot in the 3rd sealed the rout." },
        { "headline" => "Cole tosses gem in 8-1 win", "body" => "Eight innings, one run, ten strikeouts." }
      ].to_json
    }
    games_count  { 14 }
    ai_generated { true }

    trait :stub do
      headline     { nil }
      stories_json { [].to_json }
      ai_generated { false }
    end
  end
end
