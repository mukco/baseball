class SimulationNewsStory < ApplicationRecord
  belongs_to :simulation_league

  validates :story_date, presence: true,
                         uniqueness: { scope: :simulation_league_id }

  def stories
    parsed = JSON.parse(stories_json || "[]")
    parsed.is_a?(Array) ? parsed : (parsed["stories"] || [])
  rescue JSON::ParserError
    []
  end

  def player_refs
    parsed = JSON.parse(stories_json || "[]")
    parsed.is_a?(Array) ? [] : (parsed["player_refs"] || [])
  rescue JSON::ParserError
    []
  end
end
