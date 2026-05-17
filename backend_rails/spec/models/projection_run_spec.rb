require "rails_helper"

RSpec.describe ProjectionRun do
  subject(:run) { build(:projection_run) }

  describe "validations" do
    it "is valid with factory defaults" do
      expect(run).to be_valid
    end

    it "rejects invalid projection_type" do
      run.projection_type = "lifetime"
      expect(run).not_to be_valid
    end

    it "accepts valid projection_types" do
      %w[rest_of_season full_season].each do |type|
        run.projection_type = type
        expect(run).to be_valid
      end
    end

    it "requires season" do
      run.season = nil
      expect(run).not_to be_valid
    end

    it "requires ran_at" do
      run.ran_at = nil
      expect(run).not_to be_valid
    end
  end

  describe "associations" do
    it "belongs to a projection_scenario" do
      run.save!
      expect(run.projection_scenario).to be_a(ProjectionScenario)
    end

    it "destroys player_projections when destroyed" do
      run.save!
      create(:player_projection, projection_run: run)
      expect { run.destroy! }.to change(PlayerProjection, :count).by(-1)
    end
  end

  describe ".recent" do
    it "orders by ran_at descending" do
      older = create(:projection_run, ran_at: 2.hours.ago)
      newer = create(:projection_run, ran_at: 1.minute.ago)
      expect(ProjectionRun.recent.first).to eq(newer)
      expect(ProjectionRun.recent.last).to eq(older)
    end
  end

  describe "#scenario_params" do
    it "parses scenario_params_json" do
      run.scenario_params_json = '{"regression_factor":1.5}'
      expect(run.scenario_params).to eq({ "regression_factor" => 1.5 })
    end

    it "returns empty hash when blank" do
      run.scenario_params_json = nil
      expect(run.scenario_params).to eq({})
    end
  end

  describe "#seasons" do
    it "returns [season] when seasons_json is blank" do
      run.seasons_json = nil
      run.season = 2025
      expect(run.seasons).to eq([2025])
    end

    it "parses seasons_json when present" do
      run.seasons_json = "[2023,2024,2025]"
      expect(run.seasons).to eq([2023, 2024, 2025])
    end
  end

  describe "#multi_season?" do
    it "returns false for a single season" do
      run.seasons_json = nil
      expect(run.multi_season?).to be false
    end

    it "returns true when multiple seasons are stored" do
      run.seasons_json = "[2023,2024]"
      expect(run.multi_season?).to be true
    end
  end

  describe "#label" do
    it "includes scenario name when no run name is set" do
      run.name = nil
      run.ran_at = Time.zone.parse("2025-04-01 14:30")
      run.save!
      expect(run.label).to include(run.projection_scenario.name)
    end

    it "prefixes with run name when present" do
      run.name = "My Custom Run"
      run.ran_at = Time.zone.parse("2025-04-01 14:30")
      run.save!
      expect(run.label).to start_with("My Custom Run")
    end

    it "appends season range for multi-season runs" do
      run.seasons_json = "[2023,2024,2025]"
      run.season = 2025
      run.ran_at = Time.now
      run.save!
      expect(run.label).to include("2023–2025")
    end
  end
end
