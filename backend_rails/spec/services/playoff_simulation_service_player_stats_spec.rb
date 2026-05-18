require "rails_helper"

RSpec.describe PlayoffSimulationService, "player stat accumulation" do
  let(:league) { create(:simulation_league) }

  let!(:home_roster) do
    create(:simulation_roster, simulation_league: league, team_id: 147,
           team_abbr: "NYY",
           roster_json: [
             { "id" => 1001, "name" => "Batter A", "position" => "OF" },
             { "id" => 1002, "name" => "Pitcher A", "position" => "SP" },
           ].to_json,
           lineup_order_json: [1001].to_json,
           rotation_json: [1002].to_json)
  end

  let!(:away_roster) do
    create(:simulation_roster, simulation_league: league, team_id: 111,
           team_abbr: "BAL",
           roster_json: [
             { "id" => 2001, "name" => "Batter B", "position" => "1B" },
             { "id" => 2002, "name" => "Pitcher B", "position" => "SP" },
           ].to_json,
           lineup_order_json: [2001].to_json,
           rotation_json: [2002].to_json)
  end

  let!(:series) do
    create(:simulation_playoff_series, simulation_league: league,
           round: "ws", league: "MLB", series_index: 0,
           home_team_id: 147, away_team_id: 111,
           home_team_abbr: "NYY", away_team_abbr: "BAL",
           series_length: 7, status: "pending")
  end

  let(:game_result) do
    {
      home_score:    5,
      away_score:    3,
      linescore:     [],
      batter_stats:  {
        1001 => { ab: 4, h: 2, hr: 1, rbi: 2, bb: 1, k: 1, r: 1, double: 0, triple: 0, hbp: 0, sf: 0 },
        2001 => { ab: 3, h: 0, hr: 0, rbi: 0, bb: 0, k: 2, r: 0, double: 0, triple: 0, hbp: 0, sf: 0 },
      },
      pitcher_stats: {
        1002 => { bf: 12, outs: 15, h: 4, er: 2, bb: 1, k: 10, hr: 0, decision: "W" },
        2002 => { bf: 15, outs: 12, h: 6, er: 4, bb: 2, k:  6, hr: 1, decision: "L" },
      },
    }
  end

  before do
    allow(GameSimulationEngine).to receive(:simulate_game).and_return(game_result)
    allow(ProjectionService).to receive(:project_player).and_return({ error: "stubbed" })
    allow(ProjectionDataService).to receive(:player_name).and_return("Test Player")
  end

  describe "simulate_round → persist_series_player_stats" do
    it "creates SimulationPlayoffPlayerStat rows after series completes" do
      expect {
        described_class.simulate_round(league, "ws")
      }.to change(SimulationPlayoffPlayerStat, :count).by_at_least(1)
    end

    it "records the correct round on each stat row" do
      described_class.simulate_round(league, "ws")
      expect(SimulationPlayoffPlayerStat.where(simulation_league: league).pluck(:round).uniq).to eq(["ws"])
    end

    it "associates stats with the correct series" do
      described_class.simulate_round(league, "ws")
      stat_series_ids = SimulationPlayoffPlayerStat.where(simulation_league: league)
                                                   .pluck(:simulation_playoff_series_id).uniq
      expect(stat_series_ids).to include(series.id)
    end

    it "assigns home team_id to home players" do
      described_class.simulate_round(league, "ws")
      home_player = SimulationPlayoffPlayerStat.find_by(player_id: 1001)
      expect(home_player&.team_id).to eq(147)
    end

    it "assigns away team_id to away players" do
      described_class.simulate_round(league, "ws")
      away_player = SimulationPlayoffPlayerStat.find_by(player_id: 2001)
      expect(away_player&.team_id).to eq(111)
    end
  end

  describe "accumulate_series_stats (private)" do
    let(:service) { described_class }

    it "accumulates batter stats across multiple games" do
      acc = {}
      service.send(:accumulate_series_stats, game_result[:batter_stats], acc, type: :batter)
      service.send(:accumulate_series_stats, game_result[:batter_stats], acc, type: :batter)

      expect(acc[1001][:ab]).to eq(8)
      expect(acc[1001][:h]).to  eq(4)
      expect(acc[1001][:hr]).to eq(2)
    end

    it "counts g only when batter has ab > 0" do
      acc = {}
      service.send(:accumulate_series_stats, game_result[:batter_stats], acc, type: :batter)
      expect(acc[1001][:g]).to eq(1)
    end

    it "accumulates pitcher decisions" do
      acc = {}
      service.send(:accumulate_series_stats, game_result[:pitcher_stats], acc, type: :pitcher)
      expect(acc[1002][:w]).to eq(1)
      expect(acc[2002][:l]).to eq(1)
    end

    it "skips non-integer player IDs (e.g. :league_avg_rp)" do
      stats = { league_avg_rp: { bf: 3, outs: 3, h: 1, er: 0, bb: 0, k: 2, hr: 0, decision: nil } }
      acc   = {}
      service.send(:accumulate_series_stats, stats, acc, type: :pitcher)
      expect(acc).to be_empty
    end
  end
end
