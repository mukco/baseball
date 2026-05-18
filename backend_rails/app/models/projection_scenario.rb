class ProjectionScenario < ApplicationRecord
  has_many :projection_runs, dependent: :destroy

  validates :name, presence: true
  validates :year1_weight, :year2_weight, :year3_weight,
            numericality: { greater_than_or_equal_to: 0 }
  validates :regression_factor, :age_curve_factor, :statcast_weight,
            numericality: { greater_than_or_equal_to: 0.1, less_than_or_equal_to: 5.0 }
  validates :default_pa, numericality: { greater_than: 0, less_than_or_equal_to: 700 }
  validates :default_ip, numericality: { greater_than: 0, less_than_or_equal_to: 350 }
  validates :era_fip_blend,     numericality: { greater_than_or_equal_to: 0.0, less_than_or_equal_to: 1.0 }
  validates :history_years,     numericality: { only_integer: true, greater_than_or_equal_to: 1, less_than_or_equal_to: 3 }
  validates :min_pa_for_history, numericality: { only_integer: true, greater_than_or_equal_to: 10, less_than_or_equal_to: 200 }
  validates :min_ip_for_history, numericality: { greater_than_or_equal_to: 1.0, less_than_or_equal_to: 50.0 }

  def self.default_scenario
    where(is_default: true).first
  end

  def year_weights
    { 0 => year1_weight, 1 => year2_weight, 2 => year3_weight }
  end

  def self.ensure_default!
    return if where(is_default: true).exists?
    create!(
      name: "Baseline",
      description: "Standard Marcel-style projection: 5/4/3 year weights, neutral regression, age curves on.",
      is_default: true
    )
  end
end
