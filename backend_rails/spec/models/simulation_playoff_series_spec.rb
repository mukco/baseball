require "rails_helper"

RSpec.describe SimulationPlayoffSeries, type: :model do
  describe "associations" do
    it "belongs to a simulation_league" do
      league = create(:simulation_league)
      series = create(:simulation_playoff_series, simulation_league: league)
      expect(series.simulation_league).to eq(league)
    end
  end

  # -----------------------------------------------------------------------
  # #games
  # -----------------------------------------------------------------------
  describe "#games" do
    it "parses games_json into an array of symbol-keyed hashes" do
      series = build(:simulation_playoff_series,
                     games_json: [{ home_score: 3, away_score: 2 }].to_json)
      expect(series.games.first[:home_score]).to eq(3)
      expect(series.games.first[:away_score]).to eq(2)
    end

    it "returns an empty array when games_json is nil" do
      series = build(:simulation_playoff_series, games_json: nil)
      expect(series.games).to eq([])
    end

    it "returns an empty array when games_json is an empty JSON array" do
      series = build(:simulation_playoff_series, games_json: "[]")
      expect(series.games).to eq([])
    end
  end

  # -----------------------------------------------------------------------
  # #wins_needed
  # -----------------------------------------------------------------------
  describe "#wins_needed" do
    it "returns 2 for a best-of-3 Wild Card series" do
      series = build(:simulation_playoff_series, series_length: 3)
      expect(series.wins_needed).to eq(2)
    end

    it "returns 3 for a best-of-5 Division Series" do
      series = build(:simulation_playoff_series, series_length: 5)
      expect(series.wins_needed).to eq(3)
    end

    it "returns 4 for a best-of-7 series" do
      series = build(:simulation_playoff_series, series_length: 7)
      expect(series.wins_needed).to eq(4)
    end
  end

  # -----------------------------------------------------------------------
  # #complete?
  # -----------------------------------------------------------------------
  describe "#complete?" do
    it "returns true when status is 'complete'" do
      series = build(:simulation_playoff_series, status: "complete")
      expect(series.complete?).to be true
    end

    it "returns false when status is 'pending'" do
      series = build(:simulation_playoff_series, status: "pending")
      expect(series.complete?).to be false
    end

    it "returns false when status is 'in_progress'" do
      series = build(:simulation_playoff_series, status: "in_progress")
      expect(series.complete?).to be false
    end
  end

  # -----------------------------------------------------------------------
  # #winner_abbr
  # -----------------------------------------------------------------------
  describe "#winner_abbr" do
    let(:series) do
      build(:simulation_playoff_series,
            home_team_id: 147, home_team_abbr: "NYY",
            away_team_id: 111, away_team_abbr: "BAL")
    end

    it "returns home_team_abbr when the home team won" do
      series.winner_team_id = 147
      expect(series.winner_abbr).to eq("NYY")
    end

    it "returns away_team_abbr when the away team won" do
      series.winner_team_id = 111
      expect(series.winner_abbr).to eq("BAL")
    end

    it "returns nil when no winner has been determined" do
      series.winner_team_id = nil
      expect(series.winner_abbr).to be_nil
    end
  end
end
