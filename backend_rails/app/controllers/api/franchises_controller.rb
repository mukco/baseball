class Api::FranchisesController < Api::BaseController
  before_action :load_franchise, only: %i[show advance player_history team_history destroy]

  def index
    franchises = SimulationFranchise.includes(:simulation_leagues).order(created_at: :desc)
    render json: { franchises: franchises.map { |f| FranchiseService.serialize_index(f) } }
  end

  def show
    render json: FranchiseService.serialize(@franchise)
  end

  def create
    result = FranchiseService.create(
      name:                 params.require(:name),
      season:               params[:season]&.to_i || Date.today.year,
      scenario_id:          params[:scenario_id]&.to_i.presence,
      batter_pitcher_blend: params[:batter_pitcher_blend]&.to_f || 0.45
    )
    render json: result
  end

  def advance
    render json: FranchiseService.advance_season(@franchise)
  end

  def player_history
    render json: FranchiseService.player_season_log(@franchise, params[:player_id].to_i)
  end

  def team_history
    render json: FranchiseService.team_season_log(@franchise, params[:team_id].to_i)
  end

  def destroy
    @franchise.destroy!
    render json: { ok: true }
  end

  private

  def load_franchise
    @franchise = SimulationFranchise.includes(:simulation_leagues).find(params[:id])
  end
end
