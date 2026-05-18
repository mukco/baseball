class GenerateAwardsJob < ApplicationJob
  queue_as :default

  def perform(job_run_id)
    job_run = SimulationJobRun.find(job_run_id)
    league  = job_run.simulation_league

    job_run.update!(status: "running")

    result = AwardService.generate_awards(league)
    job_run.update!(status: "done", result_json: result.to_json)
  rescue => e
    SimulationJobRun.find_by(id: job_run_id)&.update!(
      status: "error",
      error_message: e.message
    )
    raise
  end
end
