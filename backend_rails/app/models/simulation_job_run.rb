class SimulationJobRun < ApplicationRecord
  belongs_to :simulation_league

  STATUSES = %w[pending running done error].freeze

  validates :status, inclusion: { in: STATUSES }

  def result
    JSON.parse(result_json, symbolize_names: true) if result_json.present?
  end

  def as_json(*)
    {
      id:         id,
      status:     status,
      job_type:   job_type,
      sim_date:   sim_date&.to_s,
      result:     result,
      error:      error_message,
      created_at: created_at,
      updated_at: updated_at,
    }
  end
end
