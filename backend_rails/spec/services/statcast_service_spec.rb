require "rails_helper"

RSpec.describe StatcastService do
  before do
    described_class.class_variable_set(:@@cache, {})
    described_class.class_variable_set(:@@cache_timestamps, {})
  end

  describe ".spray_direction" do
    let(:season)    { 2024 }
    let(:player_id) { 592450 }

    let(:fg_rows) do
      [
        { player_id: player_id, pull_pct: 0.40, cent_pct: 0.35, oppo_pct: 0.25 },
        { player_id: 999999,    pull_pct: 0.33, cent_pct: 0.33, oppo_pct: 0.34 },
      ]
    end

    before do
      allow(described_class).to receive(:fetch_fangraphs_batted_ball)
        .with(season)
        .and_return(fg_rows)
    end

    it "returns pull/cent/oppo for the requested player" do
      result = described_class.spray_direction(player_id, season)
      expect(result[:pull_pct]).to eq(0.40)
      expect(result[:cent_pct]).to eq(0.35)
      expect(result[:oppo_pct]).to eq(0.25)
    end

    it "returns an empty hash when the player is not in the leaderboard" do
      result = described_class.spray_direction(0, season)
      expect(result).to eq({})
    end

    it "fetches the leaderboard only once per season across multiple player lookups" do
      described_class.spray_direction(player_id, season)
      described_class.spray_direction(999999, season)
      expect(described_class).to have_received(:fetch_fangraphs_batted_ball).once
    end
  end
end
