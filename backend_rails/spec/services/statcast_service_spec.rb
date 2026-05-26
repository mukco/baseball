require "rails_helper"

RSpec.describe StatcastService do
  before do
    described_class.class_variable_set(:@@cache, {})
    described_class.class_variable_set(:@@cache_timestamps, {})
  end

  describe ".batter" do
    let(:player_id) { 592450 }
    let(:season)    { 2024 }

    let(:csv_rows) do
      [{ "launch_speed" => "105.2", "launch_angle" => "28.0", "hc_x" => nil, "hc_y" => nil,
         "events" => "home_run", "estimated_ba_using_speedangle" => "0.810",
         "estimated_woba_using_speedangle" => "0.990", "sprint_speed" => nil,
         "bat_speed" => nil, "swing_length" => nil, "zone" => "5",
         "description" => "hit_into_play_score" }]
    end

    let(:spray_rows) do
      [{ player_id: player_id, pull_pct: 0.45, cent_pct: 0.32, oppo_pct: 0.23 }]
    end

    let(:sprint_rows) { [{ player_id: player_id, sprint_speed: 28.5 }] }

    before do
      allow(described_class).to receive(:fetch_csv).and_return(csv_rows)
      allow(described_class).to receive(:fetch_fangraphs_batted_ball).and_return(spray_rows)
      allow(described_class).to receive(:fetch_sprint_speed_leaderboard).and_return(sprint_rows)
      allow(described_class).to receive(:bat_tracking_for).and_return({})
    end

    it "merges pull/cent/oppo as whole-number percentages into the summary" do
      result = described_class.batter(player_id, season)
      expect(result[:summary][:pullPct]).to eq(45.0)
      expect(result[:summary][:centPct]).to eq(32.0)
      expect(result[:summary][:oppoPct]).to eq(23.0)
    end

    it "merges sprint speed from the leaderboard" do
      result = described_class.batter(player_id, season)
      expect(result[:summary][:sprintSpeed]).to eq(28.5)
    end

    it "still returns summary stats when spray data is unavailable" do
      allow(described_class).to receive(:fetch_fangraphs_batted_ball).and_return([])
      result = described_class.batter(player_id, season)
      expect(result[:summary]).not_to have_key(:pullPct)
      expect(result[:error]).to be_nil
    end
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
