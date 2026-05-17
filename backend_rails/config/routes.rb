Rails.application.routes.draw do
  get "up" => "rails/health#show", as: :rails_health_check
  get "/", to: proc { [200, { "Content-Type" => "application/json" }, ['{"status":"ok","service":"statline-api"}']] }

  namespace :api do
    # MLB.TV
    get "mlb/watch/:game_pk",             to: "mlb#watch"

    # Standings
    get "standings",        to: "standings#index"

    # Schedule
    get "schedule/today",    to: "schedule#today"
    get "schedule/hot_game", to: "schedule#hot_game"
    get "schedule/:date",    to: "schedule#by_date"
    get "games/:game_pk",                   to: "games#show"
    get "games/:game_pk/plays",             to: "games#plays"
    get "games/:game_pk/insights",          to: "games#insights"
    get "games/:game_pk/factoids",          to: "games#factoids"
    get "games/:game_pk/win_probability",   to: "games#win_probability"

    # Players
    get "players/search",       to: "players#search"
    get "players/:id",          to: "players#show"
    get "players/:id/factoids", to: "players#factoids"

    # Teams
    get "teams",              to: "teams#index"
    get "teams/:id",          to: "teams#show"
    get "teams/:id/factoids", to: "teams#factoids"

    # Stats
    get "stats/:id/season",                to: "stats#season"
    get "stats/:id/career",                to: "stats#career"
    get "stats/:id/game_log",              to: "stats#game_log"
    get "stats/:id/projections",           to: "stats#projections"
    get "stats/:id/statcast/pitching",     to: "stats#statcast_pitching"
    get "stats/:id/statcast/batting",      to: "stats#statcast_batting"

    # Leaderboards
    get "leaderboards/batting",            to: "leaderboards#batting"
    get "leaderboards/pitching",           to: "leaderboards#pitching"

    # Daily Summary
    get "daily_summary",                   to: "daily_summary#show"

    # News
    get "news",                            to: "news#index"

    # Sandbox
    get "sandbox/datasets",                to: "sandbox#datasets"
    post "sandbox/query",                  to: "sandbox#query"

    # Assistant
    post "assistant/ask",                  to: "assistant#ask"

    # ML Builder
    get  "ml/health",          to: "ml#health"
    get  "ml/columns/:table",  to: "ml#columns"
    post "ml/train",           to: "ml#train"
  end
end
