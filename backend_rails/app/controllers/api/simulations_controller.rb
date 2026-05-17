class Api::SimulationsController < Api::BaseController
  before_action :load_league, only: %i[show destroy sync simulate_day simulate_game schedule roster update_roster game_show]

  def index
    leagues = SimulationLeague.recent.includes(:projection_scenario)
    render json: { leagues: leagues.map { |l| SimulationService.serialize_league(l) } }
  end

  def create
    result = SimulationService.setup_league(
      name:                 params.require(:name),
      season:               params[:season]&.to_i || Date.today.year,
      scenario_id:          params[:scenario_id]&.to_i.presence,
      batter_pitcher_blend: params[:batter_pitcher_blend]&.to_f || 0.45
    )
    render json: result
  end

  def show
    render json: SimulationService.league_state(@league)
  end

  def destroy
    @league.destroy!
    render json: { ok: true }
  end

  def sync
    through = params[:through_date] ? Date.parse(params[:through_date]) : Date.today
    render json: SimulationService.sync_real_results(@league, through_date: through)
  end

  def simulate_day
    date = params[:date] ? Date.parse(params[:date]) : (@league.current_sim_date || Date.today)
    render json: SimulationService.simulate_day(@league, date)
  end

  def simulate_game
    game = @league.simulation_games.find(params[:game_id])
    render json: SimulationService.simulate_game(@league, game)
  end

  def game_show
    game = @league.simulation_games.find(params[:game_id])
    render json: {
      game:      SimulationService.serialize_game(game),
      box_score: game.box_score,
    }
  end

  def schedule
    date = params[:date] ? Date.parse(params[:date]) : (@league.current_sim_date || Date.today)
    render json: SimulationService.schedule_for_date(@league, date)
  end

  def roster
    roster = @league.simulation_rosters.find_by!(team_id: params[:team_id])
    render json: {
      team_id:      roster.team_id,
      team_name:    roster.team_name,
      team_abbr:    roster.team_abbr,
      team_color:   roster.team_color,
      roster:       roster.roster,
      lineup_order: roster.lineup_order,
      rotation:     roster.rotation,
    }
  end

  def update_roster
    data = {}
    data[:lineup_order] = params[:lineup_order].map(&:to_i) if params[:lineup_order]
    data[:rotation]     = params[:rotation].map(&:to_i)     if params[:rotation]
    render json: SimulationService.update_roster(@league, params[:team_id], data)
  end

  private

  def load_league
    @league = SimulationLeague.find(params[:id])
  end
end
