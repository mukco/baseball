class SimulationPreset < ApplicationRecord
  validates :name, presence: true, uniqueness: true
  validate :params_shape

  def params
    JSON.parse(params_json || "{}")
  rescue JSON::ParserError
    {}
  end

  def params=(hash)
    self.params_json = (hash || {}).to_json
  end

  private

  def params_shape
    JSON.parse(params_json || "{}")
    true
  rescue JSON::ParserError
    errors.add(:params_json, "must be valid JSON")
  end
end
