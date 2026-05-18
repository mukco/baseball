class SimulateThroughJob < ApplicationJob
  queue_as :default

  def perform(job_run_id)
    job_run      = SimulationJobRun.find(job_run_id)
    league       = job_run.simulation_league
    through_date = job_run.sim_date

    job_run.update!(status: "running")

    already_simulated = league.simulation_games
                              .where.not(simulated_at: nil)
                              .pluck(:game_date)
                              .to_set

    result = SimulationService.simulate_through(league, through_date, job_run: job_run)

    if result[:error]
      job_run.update!(status: "error", error_message: result[:error])
    else
      job_run.update!(status: "done", result_json: result.to_json)
      enqueue_news_for_new_dates(league, already_simulated)
    end
  rescue => e
    SimulationJobRun.find_by(id: job_run_id)&.update!(
      status: "error",
      error_message: e.message
    )
    raise
  end

  private

  def enqueue_news_for_new_dates(league, already_simulated)
    league.simulation_games
          .where.not(simulated_at: nil)
          .where.not(game_date: already_simulated.to_a)
          .distinct
          .pluck(:game_date)
          .sort
          .each { |date| GenerateDailyNewsJob.perform_later(league.id, date.to_s) }
  rescue => e
    Rails.logger.warn "[SimulateThroughJob] news enqueue failed: #{e.message}"
  end
end
