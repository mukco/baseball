module Api
  class SimulationConfigsController < BaseController
    before_action :set_league

    def show
      config = @league.simulation_config || SimulationConfig.new(simulation_league: @league)
      render json: { params: config.effective, presets: SimulationConfig::PRESETS.keys }
    end

    def update
      config = @league.simulation_config ||
               @league.build_simulation_config

      if params[:preset].present?
        config.apply_preset!(params[:preset])
      else
        allowed = SimulationConfig::DEFAULTS.keys
        incoming = (params[:params] || {}).to_unsafe_h.slice(*allowed)
        config.params = (config.params || {}).merge(incoming)
      end

      if config.save
        render json: { params: config.effective }
      else
        render json: { error: config.errors.full_messages.join(", ") }, status: :unprocessable_entity
      end
    end

    private

    def set_league
      @league = SimulationLeague.find(params[:simulation_id])
    end
  end
end
