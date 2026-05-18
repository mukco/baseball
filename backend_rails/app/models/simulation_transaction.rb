class SimulationTransaction < ApplicationRecord
  belongs_to :simulation_league

  EVENT_TYPES = %w[injury_start injury_return award].freeze

  validates :event_type, inclusion: { in: EVENT_TYPES }
  validates :game_date,  presence: true

  scope :for_date,   ->(date)      { where(game_date: date) }
  scope :for_player, ->(player_id) { where(player_id: player_id) }
  scope :by_type,    ->(type)      { where(event_type: type) }
  scope :recent,     -> { order(game_date: :desc, created_at: :desc) }

  def metadata
    JSON.parse(metadata_json || "{}")
  rescue JSON::ParserError
    {}
  end

  def metadata=(hash)
    self.metadata_json = (hash || {}).to_json
  end

  class << self
    def log(league:, event_type:, game_date:, player_id: nil, team_id: nil, player_name: nil, **meta)
      rec = new(
        simulation_league: league,
        event_type:        event_type,
        game_date:         game_date,
        player_id:         player_id,
        team_id:           team_id,
        player_name:       player_name,
      )
      rec.metadata = meta
      rec.save!
      rec
    end
  end
end
