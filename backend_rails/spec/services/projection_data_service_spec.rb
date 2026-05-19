require "rails_helper"

RSpec.describe ProjectionDataService do
  describe ".batter_history" do
    let(:player_id) { 592450 }
    let(:season)    { Date.today.year }

    let(:hitting_stats) do
      {
        "atBats"           => 550,
        "plateAppearances" => 600,
        "baseOnBalls"      => 80,
        "hitByPitch"       => 5,
        "sacFlies"         => 4,
        "strikeOuts"       => 140,
        "homeRuns"         => 35,
        "hits"             => 155,
        "avg"              => "0.282",
        "slg"              => "0.562",
      }
    end

    let(:mlb_service) { instance_double(MlbApiService) }

    before do
      allow(MlbApiService).to receive(:new).and_return(mlb_service)
      allow(mlb_service).to receive(:player_season_stats)
        .with(player_id, season)
        .and_return({ hitting: hitting_stats })

      allow(StatcastService).to receive(:batter).and_return({ error: "stubbed" })
      allow(StatcastService).to receive(:spray_direction)
        .with(player_id, season)
        .and_return({ pull_pct: 0.40, cent_pct: 0.35, oppo_pct: 0.25 })
    end

    it "includes pull_pct, cent_pct, oppo_pct from FanGraphs spray data" do
      history = described_class.batter_history(player_id, years: 1, before_season: season + 1)
      expect(history).not_to be_empty
      season_entry = history.first
      expect(season_entry[:pull_pct]).to eq(0.40)
      expect(season_entry[:cent_pct]).to eq(0.35)
      expect(season_entry[:oppo_pct]).to eq(0.25)
    end

    it "sets spray fields to nil when spray_direction returns empty" do
      allow(StatcastService).to receive(:spray_direction).and_return({})
      history = described_class.batter_history(player_id, years: 1, before_season: season + 1)
      season_entry = history.first
      expect(season_entry[:pull_pct]).to be_nil
      expect(season_entry[:cent_pct]).to be_nil
      expect(season_entry[:oppo_pct]).to be_nil
    end
  end
end
