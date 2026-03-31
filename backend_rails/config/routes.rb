Rails.application.routes.draw do
  get "up" => "rails/health#show", as: :rails_health_check
  get "/", to: proc { [200, { "Content-Type" => "application/json" }, ['{"status":"ok","service":"statline-api"}']] }

  namespace :api do
    # Schedule
    get "schedule/today",   to: "schedule#today"
    get "schedule/:date",   to: "schedule#by_date"

    # Players
    get "players/search",   to: "players#search"
    get "players/:id",      to: "players#show"

    # Stats
    get "stats/:id/season",                to: "stats#season"
    get "stats/:id/career",                to: "stats#career"
    get "stats/:id/statcast/pitching",     to: "stats#statcast_pitching"
    get "stats/:id/statcast/batting",      to: "stats#statcast_batting"

    # Leaderboards
    get "leaderboards/batting",            to: "leaderboards#batting"
    get "leaderboards/pitching",           to: "leaderboards#pitching"
  end
end
