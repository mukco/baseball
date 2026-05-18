require "rails_helper"

RSpec.describe SimulationTransaction, type: :model do
  let(:league) { create(:simulation_league) }

  describe "validations" do
    it "is valid with required fields" do
      expect(build(:simulation_transaction, simulation_league: league)).to be_valid
    end

    it "rejects unknown event_type" do
      t = build(:simulation_transaction, simulation_league: league, event_type: "trade")
      expect(t).not_to be_valid
    end

    it "requires game_date" do
      t = build(:simulation_transaction, simulation_league: league, game_date: nil)
      expect(t).not_to be_valid
    end
  end

  describe "#metadata / #metadata=" do
    it "round-trips a metadata hash" do
      t = build(:simulation_transaction, simulation_league: league)
      t.metadata = { severity: "moderate", il_end_date: "2026-07-01" }
      t.save!
      t.reload
      expect(t.metadata["severity"]).to eq("moderate")
    end
  end

  describe ".log" do
    it "creates a persisted transaction record" do
      expect {
        SimulationTransaction.log(
          league:      league,
          event_type:  "injury_start",
          game_date:   Date.today,
          player_id:   123,
          team_id:     147,
          player_name: "Mike Trout",
          severity:    "minor"
        )
      }.to change(SimulationTransaction, :count).by(1)
    end

    it "stores extra keyword args in metadata" do
      record = SimulationTransaction.log(
        league:     league,
        event_type: "injury_start",
        game_date:  Date.today,
        severity:   "major",
        days:       90
      )
      expect(record.metadata["severity"]).to eq("major")
      expect(record.metadata["days"]).to eq(90)
    end
  end

  describe "scopes" do
    let!(:t1) { create(:simulation_transaction, simulation_league: league, event_type: "injury_start",  game_date: Date.today) }
    let!(:t2) { create(:simulation_transaction, simulation_league: league, event_type: "injury_return", game_date: Date.today - 1) }

    it ".by_type filters by event_type" do
      expect(SimulationTransaction.by_type("injury_start")).to include(t1)
      expect(SimulationTransaction.by_type("injury_start")).not_to include(t2)
    end

    it ".for_date filters by game_date" do
      expect(SimulationTransaction.for_date(Date.today)).to include(t1)
      expect(SimulationTransaction.for_date(Date.today)).not_to include(t2)
    end
  end
end
