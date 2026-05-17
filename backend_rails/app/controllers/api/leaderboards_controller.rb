module Api
  class LeaderboardsController < BaseController
    # GET /api/leaderboards/batting?season=2024&min_pa=100
    def batting
      season = params.fetch(:season, 2024).to_i
      min_pa = params.fetch(:min_pa, 100).to_i
      render json: StatcastService.batting_leaderboard(season, min_pa: min_pa)
    end

    # GET /api/leaderboards/pitching?season=2024&min_ip=30
    def pitching
      season = params.fetch(:season, 2024).to_i
      min_ip = params.fetch(:min_ip, 30).to_i
      render json: StatcastService.pitching_leaderboard(season, min_ip: min_ip)
    end
  end
end
