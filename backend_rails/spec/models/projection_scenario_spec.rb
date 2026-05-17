require "rails_helper"

RSpec.describe ProjectionScenario do
  subject(:scenario) { build(:projection_scenario) }

  describe "validations" do
    it "is valid with default factory attributes" do
      expect(scenario).to be_valid
    end

    it "requires a name" do
      scenario.name = nil
      expect(scenario).not_to be_valid
      expect(scenario.errors[:name]).to be_present
    end

    it "requires non-negative year weights" do
      scenario.year1_weight = -1
      expect(scenario).not_to be_valid
    end

    it "allows zero year weight (e.g. 1-year projection)" do
      scenario.year2_weight = 0
      scenario.year3_weight = 0
      expect(scenario).to be_valid
    end

    it "requires regression_factor between 0.1 and 5.0" do
      scenario.regression_factor = 0.0
      expect(scenario).not_to be_valid
      scenario.regression_factor = 5.1
      expect(scenario).not_to be_valid
      scenario.regression_factor = 2.0
      expect(scenario).to be_valid
    end

    it "requires age_curve_factor between 0.1 and 5.0" do
      scenario.age_curve_factor = 0.05
      expect(scenario).not_to be_valid
      scenario.age_curve_factor = 1.5
      expect(scenario).to be_valid
    end

    it "requires default_pa > 0 and <= 700" do
      scenario.default_pa = 0
      expect(scenario).not_to be_valid
      scenario.default_pa = 701
      expect(scenario).not_to be_valid
      scenario.default_pa = 500
      expect(scenario).to be_valid
    end

    it "requires default_ip > 0 and <= 350" do
      scenario.default_ip = 0
      expect(scenario).not_to be_valid
      scenario.default_ip = 351
      expect(scenario).not_to be_valid
      scenario.default_ip = 180
      expect(scenario).to be_valid
    end
  end

  describe "associations" do
    it "has many projection_runs" do
      scenario.save!
      create(:projection_run, projection_scenario: scenario)
      expect(scenario.projection_runs.count).to eq(1)
    end

    it "destroys projection_runs on delete" do
      scenario.save!
      create(:projection_run, projection_scenario: scenario)
      expect { scenario.destroy! }.to change(ProjectionRun, :count).by(-1)
    end
  end

  describe ".default_scenario" do
    it "returns the scenario flagged is_default: true" do
      default = create(:projection_scenario, :default)
      create(:projection_scenario)
      expect(ProjectionScenario.default_scenario).to eq(default)
    end

    it "returns nil when none is flagged as default" do
      create(:projection_scenario)
      expect(ProjectionScenario.default_scenario).to be_nil
    end
  end

  describe ".ensure_default!" do
    it "creates a Baseline scenario when no default exists" do
      expect { ProjectionScenario.ensure_default! }.to change(ProjectionScenario, :count).by(1)
      expect(ProjectionScenario.default_scenario.name).to eq("Baseline")
    end

    it "is idempotent — does not create a second default" do
      create(:projection_scenario, :default)
      expect { ProjectionScenario.ensure_default! }.not_to change(ProjectionScenario, :count)
    end
  end

  describe "#year_weights" do
    it "returns a hash keyed 0..2 mapping to year weight values" do
      scenario.year1_weight = 5
      scenario.year2_weight = 4
      scenario.year3_weight = 3
      expect(scenario.year_weights).to eq({ 0 => 5, 1 => 4, 2 => 3 })
    end
  end
end
