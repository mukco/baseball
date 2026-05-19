class SimulationInsight < ApplicationRecord
  belongs_to :simulation_league

  validates :subject_type, inclusion: { in: %w[player team season awards playoff_awards playoffs] }

  def bullets
    JSON.parse(bullets_json || "{}")
  rescue JSON::ParserError
    {}
  end

  def bullets=(hash)
    self.bullets_json = hash.to_json
  end

  def as_insight_json
    { narrative: narrative, bullets: bullets, generated_at: generated_at&.iso8601, cached: true }
  end
end
