require "rails_helper"

RSpec.describe SimulationInjury, type: :model do
  let(:league) { create(:simulation_league) }

  describe "validations" do
    it "is valid with required fields" do
      expect(build(:simulation_injury, simulation_league: league)).to be_valid
    end

    it "rejects invalid severity" do
      inj = build(:simulation_injury, simulation_league: league, severity: "catastrophic")
      expect(inj).not_to be_valid
      expect(inj.errors[:severity]).to be_present
    end

    it "requires il_start_date" do
      inj = build(:simulation_injury, simulation_league: league, il_start_date: nil)
      expect(inj).not_to be_valid
    end

    it "requires il_end_date" do
      inj = build(:simulation_injury, simulation_league: league, il_end_date: nil)
      expect(inj).not_to be_valid
    end
  end

  describe "scopes" do
    let!(:active_inj)   { create(:simulation_injury, simulation_league: league, returned: false, il_start_date: Date.today - 2, il_end_date: Date.today + 5) }
    let!(:returned_inj) { create(:simulation_injury, :returned, simulation_league: league, il_start_date: Date.today - 10, il_end_date: Date.today - 1) }

    describe ".active" do
      it "returns non-returned injuries" do
        expect(SimulationInjury.active).to include(active_inj)
        expect(SimulationInjury.active).not_to include(returned_inj)
      end
    end

    describe ".on_date" do
      it "returns injuries active on the given date" do
        expect(SimulationInjury.on_date(Date.today)).to include(active_inj)
        expect(SimulationInjury.on_date(Date.today)).not_to include(returned_inj)
      end
    end

    describe ".returning_by" do
      it "returns active injuries whose il_end_date is on or before the date" do
        expect(SimulationInjury.returning_by(Date.today + 5)).to include(active_inj)
        expect(SimulationInjury.returning_by(Date.today)).not_to include(active_inj)
      end
    end
  end

  describe "#active_on?" do
    it "returns true when date falls within the IL stint" do
      inj = build(:simulation_injury, il_start_date: Date.today, il_end_date: Date.today + 10, returned: false)
      expect(inj.active_on?(Date.today + 5)).to be true
    end

    it "returns false for a returned injury" do
      inj = build(:simulation_injury, :returned, il_start_date: Date.today - 20, il_end_date: Date.today - 10)
      expect(inj.active_on?(Date.today - 15)).to be false
    end
  end

  describe "#days_remaining" do
    it "returns the number of days until il_end_date" do
      inj = build(:simulation_injury, il_end_date: Date.today + 7)
      expect(inj.days_remaining(Date.today)).to eq(7)
    end

    it "returns 0 when il_end_date is in the past" do
      inj = build(:simulation_injury, il_end_date: Date.today - 3)
      expect(inj.days_remaining(Date.today)).to eq(0)
    end
  end
end
