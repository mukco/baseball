require "rails_helper"
require "tmpdir"

RSpec.describe CacheWarmingService do
  let(:tmp_dir)  { Dir.mktmpdir }
  let(:log_path) { Pathname.new(tmp_dir).join("cache_warming_log.json") }

  before { stub_const("CacheWarmingService::LOG_PATH", log_path) }
  after  { FileUtils.rm_rf(tmp_dir) }

  # -----------------------------------------------------------------------
  # Helpers
  # -----------------------------------------------------------------------
  def stub_statcast_ok(player_id, season)
    allow(StatcastService).to receive(:batter).with(player_id, season).and_return({ summary: { exit_velo: 90.0 } })
    allow(StatcastService).to receive(:pitcher).with(player_id, season).and_return({ summary: { k_pct: 0.25 } })
  end

  def stub_statcast_error(player_id, season)
    allow(StatcastService).to receive(:batter).with(player_id, season).and_return({ error: "timeout" })
    allow(StatcastService).to receive(:pitcher).with(player_id, season).and_return({ error: "timeout" })
  end

  # -----------------------------------------------------------------------
  # .warm_simulation_players!
  # -----------------------------------------------------------------------
  describe ".warm_simulation_players!" do
    context "with active simulation leagues that have rosters" do
      let!(:league)  { create(:simulation_league, status: "active") }
      let!(:league2) { create(:simulation_league, status: "inactive") }
      let!(:roster1) { create(:simulation_roster, simulation_league: league,
                               roster_json: [{ id: 111, name: "Batter A" }, { id: 222, name: "Pitcher B" }].to_json) }
      let!(:roster2) { create(:simulation_roster, simulation_league: league2,
                               roster_json: [{ id: 999, name: "Ignored Player" }].to_json,
                               team_id: roster1.team_id + 1) }

      before do
        stub_statcast_ok(111, Date.today.year)
        stub_statcast_ok(222, Date.today.year)
      end

      it "warms only active league roster players" do
        expect(StatcastService).not_to receive(:batter).with(999, anything)
        described_class.warm_simulation_players!
      end

      it "returns a hash with warmed keys" do
        result = described_class.warm_simulation_players!
        expect(result[:warmed].size).to eq(4)  # 2 players × 2 calls each
        expect(result[:errors]).to be_empty
      end

      it "writes the log file" do
        described_class.warm_simulation_players!
        expect(File.exist?(log_path)).to be true
        logged = JSON.parse(File.read(log_path))
        expect(logged["simulation"]["warmed"]).to eq(4)
        expect(logged["simulation"]["duration_s"]).to be >= 0
      end
    end

    context "when a statcast call returns an error" do
      let!(:league) { create(:simulation_league, status: "active") }
      let!(:roster) { create(:simulation_roster, simulation_league: league,
                              roster_json: [{ id: 333, name: "Player C" }].to_json) }

      before { stub_statcast_error(333, Date.today.year) }

      it "counts errors but does not raise" do
        result = described_class.warm_simulation_players!
        expect(result[:errors]).to be_empty  # errors returned as :error hash, counted in :skipped
        expect(result[:skipped].size).to eq(2)
      end
    end

    context "when roster_json is malformed" do
      let!(:league) { create(:simulation_league, status: "active") }
      let!(:roster) { create(:simulation_roster, simulation_league: league, roster_json: "not json {{{") }

      it "skips the bad roster without raising" do
        expect { described_class.warm_simulation_players! }.not_to raise_error
      end
    end

    context "with no active leagues" do
      before { SimulationLeague.update_all(status: "inactive") rescue nil }

      it "returns empty results" do
        result = described_class.warm_simulation_players!
        expect(result[:warmed]).to be_empty
      end
    end
  end

  # -----------------------------------------------------------------------
  # .warm_leaderboards!
  # -----------------------------------------------------------------------
  describe ".warm_leaderboards!" do
    before do
      allow(StatcastService).to receive(:batting_leaderboard).and_return([{ player_id: 1 }])
      allow(StatcastService).to receive(:pitching_leaderboard).and_return([{ player_id: 2 }])
    end

    it "calls both leaderboard methods" do
      expect(StatcastService).to receive(:batting_leaderboard)
      expect(StatcastService).to receive(:pitching_leaderboard)
      described_class.warm_leaderboards!
    end

    it "returns two warmed entries" do
      result = described_class.warm_leaderboards!
      expect(result[:warmed].size).to eq(2)
      expect(result[:errors]).to be_empty
    end

    it "writes the log with a leaderboards tier entry" do
      described_class.warm_leaderboards!
      logged = JSON.parse(File.read(log_path))
      expect(logged["leaderboards"]).to include("warmed" => 2, "total" => 2)
    end

    context "when a leaderboard call raises" do
      before { allow(StatcastService).to receive(:batting_leaderboard).and_raise("FanGraphs unavailable") }

      it "records the error and continues" do
        result = described_class.warm_leaderboards!
        expect(result[:errors].size).to eq(1)
        expect(result[:warmed].size).to eq(1)  # pitching still warmed
      end
    end

    context "when a leaderboard returns an error hash" do
      before { allow(StatcastService).to receive(:batting_leaderboard).and_return({ error: "429 rate limit" }) }

      it "records as an error" do
        result = described_class.warm_leaderboards!
        expect(result[:errors].size).to eq(1)
      end
    end
  end

  # -----------------------------------------------------------------------
  # .status
  # -----------------------------------------------------------------------
  describe ".status" do
    context "when log file does not exist" do
      it "returns a never_run status" do
        expect(described_class.status["status"]).to eq("never_run")
      end
    end

    context "when log file exists with valid content" do
      before do
        FileUtils.mkdir_p(tmp_dir)
        File.write(log_path, JSON.generate({ "simulation" => { "warmed" => 10, "ran_at" => "2026-05-19T00:00:00Z" } }))
      end

      it "returns the parsed log" do
        expect(described_class.status.dig("simulation", "warmed")).to eq(10)
      end
    end

    context "when log file is corrupt" do
      before { File.write(log_path, "broken{{{") }

      it "returns a log_corrupt status" do
        expect(described_class.status["status"]).to eq("log_corrupt")
      end
    end
  end
end
