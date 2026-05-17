module Api
  class ScenariosController < BaseController
    def index
      ProjectionScenario.ensure_default!
      scenarios = ProjectionScenario.order(:is_default => :desc, :name => :asc)
      render json: scenarios
    end

    def show
      render json: ProjectionScenario.find(params[:id])
    end

    def create
      scenario = ProjectionScenario.new(scenario_params)
      if scenario.save
        render json: scenario, status: :created
      else
        render json: { error: scenario.errors.full_messages.join(", ") }, status: :unprocessable_entity
      end
    end

    def update
      scenario = ProjectionScenario.find(params[:id])
      if scenario.update(scenario_params)
        render json: scenario
      else
        render json: { error: scenario.errors.full_messages.join(", ") }, status: :unprocessable_entity
      end
    end

    def destroy
      scenario = ProjectionScenario.find(params[:id])
      return render json: { error: "Cannot delete the default scenario" }, status: :unprocessable_entity if scenario.is_default
      scenario.destroy!
      render json: { ok: true }
    end

    private

    def scenario_params
      params.require(:scenario).permit(
        :name, :description,
        :year1_weight, :year2_weight, :year3_weight,
        :regression_factor,
        :age_curve_enabled, :age_curve_factor,
        :statcast_weight,
        :park_factors_enabled,
        :default_pa, :default_ip
      )
    end
  end
end
