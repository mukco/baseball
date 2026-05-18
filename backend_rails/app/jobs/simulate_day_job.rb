class SimulateDayJob < ApplicationJob
  queue_as :default

  def perform(job_run_id)
    job_run = SimulationJobRun.find(job_run_id)
    league  = job_run.simulation_league
    date    = job_run.sim_date

    job_run.update!(status: "running")

    result = SimulationService.simulate_day(league, date)

    if result[:error]
      job_run.update!(status: "error", error_message: result[:error])
    else
      job_run.update!(status: "done", result_json: result.to_json)
      GenerateDailyNewsJob.perform_later(league.id, date.to_s) if result[:simulated].to_i > 0
    end
  rescue => e
    SimulationJobRun.find_by(id: job_run_id)&.update!(
      status: "error",
      error_message: e.message
    )
    raise
  end
end
