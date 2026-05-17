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
    get "games/:game_pk/picks",             to: "games#picks"

    # Players
    get "players/search",            to: "players#search"
    get "players/:id",               to: "players#show"
    get "players/:id/factoids",      to: "players#factoids"
    get "players/:id/fantasy",       to: "players#fantasy"
    get "players/:id/hover_stats",   to: "players#hover_stats"

    # Teams
    get "teams",                  to: "teams#index"
    get "teams/:id",              to: "teams#show"
    get "teams/:id/factoids",     to: "teams#factoids"
    get "teams/:id/stats",        to: "teams#stats"
    get "teams/:id/game_log",     to: "teams#game_log"
    get "teams/:id/history",      to: "teams#history"

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
    get "leaderboards/teams",              to: "leaderboards#teams"

    # Daily Summary
    get "daily_summary",                   to: "daily_summary#show"

    # News
    get "news",                            to: "news#index"

    # Sandbox
    get  "sandbox/datasets",               to: "sandbox#datasets"
    post "sandbox/query",                  to: "sandbox#query"
    post "sandbox/refresh",                to: "sandbox#refresh"

    # Assistant
    post "assistant/ask",                  to: "assistant#ask"

    # ML Builder
    get    "ml/health",          to: "ml#health"
    get    "ml/columns/:table",  to: "ml#columns"
    post   "ml/train",           to: "ml#train"
    get    "ml/runs",            to: "ml#runs"
    delete "ml/runs/:id",        to: "ml#delete_run"

    # Yahoo Fantasy
    get  'yahoo/status',      to: 'yahoo_fantasy#status'
    get  'yahoo/auth_url',    to: 'yahoo_fantasy#auth_url'
    get  'yahoo/callback',    to: 'yahoo_fantasy#callback'
    get  'yahoo/roster',      to: 'yahoo_fantasy#roster'
    get  'yahoo/dashboard',   to: 'yahoo_fantasy#dashboard'
    get  'yahoo/insights',    to: 'yahoo_fantasy#insights'
    get  'yahoo/free_agents', to: 'yahoo_fantasy#free_agents'

    # Prospects
    get "prospects/player/:id",    to: "prospects#player"
    get "prospects/top100",        to: "prospects#top100"
    get "prospects/team/:team_id", to: "prospects#team"

    # Transactions
    get 'transactions', to: 'transactions#index'

    # Odds
    get  'odds/today', to: 'odds#today'

    # Projections
    get  "projections/accuracy/league", to: "projections#league_accuracy"
    get  "projections/player/:id",      to: "projections#player"
    get  "projections/leaderboard",     to: "projections#leaderboard"

    # Projection runs (batch + history)
    get    "projection_runs",     to: "projection_runs#index"
    post   "projection_runs",     to: "projection_runs#create"
    delete "projection_runs/:id", to: "projection_runs#destroy"

    # Scenarios
    get    "scenarios",     to: "scenarios#index"
    post   "scenarios",     to: "scenarios#create"
    get    "scenarios/:id", to: "scenarios#show"
    patch  "scenarios/:id", to: "scenarios#update"
    delete "scenarios/:id", to: "scenarios#destroy"

    # Simulation
    get    "simulations",                                    to: "simulations#index"
    post   "simulations",                                    to: "simulations#create"
    get    "simulations/:id",                                to: "simulations#show"
    delete "simulations/:id",                                to: "simulations#destroy"
    post   "simulations/:id/sync",                           to: "simulations#sync"
    post   "simulations/:id/simulate_day",                   to: "simulations#simulate_day"
    post   "simulations/:id/games/:game_id/simulate",        to: "simulations#simulate_game"
    get    "simulations/:id/games/:game_id",                 to: "simulations#game_show"
    get    "simulations/:id/schedule",                       to: "simulations#schedule"
    get    "simulations/:id/rosters/:team_id",               to: "simulations#roster"
    patch  "simulations/:id/rosters/:team_id",               to: "simulations#update_roster"
  end
end
