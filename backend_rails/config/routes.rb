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

    # App settings
    get   "settings", to: "settings#show"
    patch "settings", to: "settings#update"

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
    get  'yahoo/free_agents',       to: 'yahoo_fantasy#free_agents'
    get  'yahoo/free_agent_search', to: 'yahoo_fantasy#free_agent_search'

    # Ottoneu Fantasy
    get 'ottoneu/roster',        to: 'ottoneu#roster'
    get 'ottoneu/all_rosters',   to: 'ottoneu#all_rosters'
    get 'ottoneu/standings',     to: 'ottoneu#standings'
    get 'ottoneu/auctions',      to: 'ottoneu#auctions'
    get 'ottoneu/waivers',       to: 'ottoneu#waivers'
    get 'ottoneu/cap_overview',  to: 'ottoneu#cap_overview'
    get 'ottoneu/player_status', to: 'ottoneu#player_status'
    get 'ottoneu/insights',      to: 'ottoneu#insights'
    get 'ottoneu/free_agents',   to: 'ottoneu#free_agents'
    get 'ottoneu/player_stats',    to: 'ottoneu#player_stats'
    get 'ottoneu/player_analysis', to: 'ottoneu#player_analysis'
    get 'ottoneu/loans',           to: 'ottoneu#loans'
    get 'ottoneu/league_stats',    to: 'ottoneu#league_stats'

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

    # Franchises (multi-season)
    get    "franchises",                                        to: "franchises#index"
    post   "franchises",                                        to: "franchises#create"
    get    "franchises/:id",                                    to: "franchises#show"
    post   "franchises/:id/advance",                            to: "franchises#advance"
    get    "franchises/:id/player_history/:player_id",          to: "franchises#player_history"
    get    "franchises/:id/team_history/:team_id",              to: "franchises#team_history"
    delete "franchises/:id",                                    to: "franchises#destroy"

    # Simulation
    get    "simulations",                                    to: "simulations#index"
    post   "simulations",                                    to: "simulations#create"
    get    "simulations/:id",                                to: "simulations#show"
    delete "simulations/:id",                                to: "simulations#destroy"
    post   "simulations/:id/sync",                           to: "simulations#sync"
    post   "simulations/:id/simulate_day",                   to: "simulations#simulate_day"
    get    "simulations/:id/jobs/:job_id",                   to: "simulations#job_status"
    post   "simulations/:id/games/:game_id/simulate",        to: "simulations#simulate_game"
    get    "simulations/:id/games/:game_id/probabilities",   to: "simulations#probabilities"
    get    "simulations/:id/games/:game_id/insights",        to: "simulations#game_insights"
    get    "simulations/:id/games/:game_id",                 to: "simulations#game_show"
    get    "simulations/:id/schedule",                       to: "simulations#schedule"
    get    "simulations/:id/analysis",                       to: "simulations#analysis"
    get    "simulations/:id/stats",                          to: "simulations#stats"
    get    "simulations/:id/stats/:player_id",               to: "simulations#player_stats"
    get    "simulations/:id/insights",                       to: "simulations#season_insights"
    get    "simulations/:id/player_insights/:player_id",     to: "simulations#player_insights"
    get    "simulations/:id/team_insights/:team_id",         to: "simulations#team_insights"
    post   "simulations/:id/simulate_through",               to: "simulations#simulate_through"
    post   "simulations/:id/simulate_season",                to: "simulations#simulate_season"
    post   "simulations/:id/seed_playoffs",                  to: "simulations#seed_playoffs"
    post   "simulations/:id/simulate_playoff_round",         to: "simulations#simulate_playoff_round"
    get    "simulations/:id/playoffs",                       to: "simulations#playoffs"
    get    "simulations/:id/playoff_leaders",                to: "simulations#playoff_leaders"
    get    "simulations/:id/playoff_insights",               to: "simulations#playoff_insights"
    get    "simulations/:id/playoff_awards",                 to: "simulations#playoff_awards"
    post   "simulations/:id/generate_playoff_awards",        to: "simulations#generate_playoff_awards"
    get    "simulations/:id/team_player_stats/:team_id",      to: "simulations#team_player_stats"
    get    "simulations/:id/injuries",                       to: "simulations#injuries"
    get    "simulations/:id/awards",                         to: "simulations#awards"
    post   "simulations/:id/generate_awards",                to: "simulations#generate_awards"
    get    "simulations/:id/news/calendar",                  to: "simulations#news_calendar"
    get    "simulations/:id/news",                           to: "simulations#news"
    get    "simulations/:id/rosters/:team_id",               to: "simulations#roster"
    patch  "simulations/:id/rosters/:team_id",               to: "simulations#update_roster"
    get    "simulations/:simulation_id/config",              to: "simulation_configs#show"
    patch  "simulations/:simulation_id/config",              to: "simulation_configs#update"

    # Custom config presets
    get    "simulation_presets",     to: "simulation_presets#index"
    post   "simulation_presets",     to: "simulation_presets#create"
    delete "simulation_presets/:id", to: "simulation_presets#destroy"

    # Cache warming
    get  "cache/status",  to: "cache_warming#status"
    post "cache/warm",    to: "cache_warming#warm"
  end
end
