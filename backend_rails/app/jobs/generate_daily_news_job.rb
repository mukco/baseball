class GenerateDailyNewsJob < ApplicationJob
  queue_as :default

  def perform(league_id, date_string)
    league = SimulationLeague.find_by(id: league_id)
    return unless league

    SimulationNewsService.generate_for_date(league, date_string)
  rescue => e
    Rails.logger.error "[GenerateDailyNewsJob] league=#{league_id} date=#{date_string}: #{e.message}"
    # swallow — news is best-effort, never block the queue
  end
end
