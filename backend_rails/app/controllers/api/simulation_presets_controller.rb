module Api
  class SimulationPresetsController < BaseController
    def index
      presets = SimulationPreset.order(:name).map do |p|
        { id: p.id, name: p.name, params: p.params, created_at: p.created_at }
      end
      render json: presets
    end

    def create
      allowed = SimulationConfig::DEFAULTS.keys
      incoming = (params[:params] || {}).to_unsafe_h.slice(*allowed)
      preset = SimulationPreset.new(name: params[:name].to_s.strip, params: incoming)

      if preset.save
        render json: { id: preset.id, name: preset.name, params: preset.params }, status: :created
      else
        render json: { error: preset.errors.full_messages.join(", ") }, status: :unprocessable_entity
      end
    end

    def destroy
      preset = SimulationPreset.find(params[:id])
      preset.destroy
      render json: { ok: true }
    end
  end
end
