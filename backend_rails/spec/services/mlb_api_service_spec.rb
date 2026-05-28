require "rails_helper"

RSpec.describe MlbApiService do
  subject(:service) { described_class.new }

  before do
    # Reset class-level cache between examples
    described_class.class_variable_set(:@@cache, {})
    described_class.class_variable_set(:@@cache_timestamps, {})
    described_class.class_variable_set(:@@cache_ttls, {})
  end

  describe "#player_roster_status" do
    let(:team_id)   { 118 }
    let(:player_id) { 666969 }
    let(:roster_response) do
      {
        "roster" => [
          { "person" => { "id" => player_id }, "status" => { "description" => "Active" } },
          { "person" => { "id" => 999999 },    "status" => { "description" => "10-Day IL" } }
        ]
      }
    end

    it "returns the player's roster status" do
      allow(service).to receive(:get).with("teams/#{team_id}/roster", { rosterType: "fullRoster" })
                                     .and_return(roster_response)

      expect(service.player_roster_status(player_id, team_id)).to eq("Active")
    end

    it "fetches the roster only once per team when called for multiple players" do
      expect(service).to receive(:get).with("teams/#{team_id}/roster", { rosterType: "fullRoster" })
                                      .once
                                      .and_return(roster_response)

      service.player_roster_status(player_id, team_id)
      service.player_roster_status(999999, team_id)
    end

    it "returns nil when the player is not on the roster" do
      allow(service).to receive(:get).and_return(roster_response)

      expect(service.player_roster_status(111111, team_id)).to be_nil
    end

    it "returns nil when team_id is nil" do
      expect(service).not_to receive(:get)
      expect(service.player_roster_status(player_id, nil)).to be_nil
    end

    it "returns nil and does not raise when the API call fails" do
      allow(service).to receive(:get).and_raise(StandardError, "timeout")

      expect(service.player_roster_status(player_id, team_id)).to be_nil
    end

    it "caches the roster response for 30 minutes" do
      allow(service).to receive(:get).and_return(roster_response)
      service.player_roster_status(player_id, team_id)

      cache_key = "team_full_roster:#{team_id}"
      expect(described_class.cache_fresh?(cache_key)).to be true
    end
  end

  # ── person_stats_snapshot ────────────────────────────────────────────────────

  describe "#person_stats_snapshot (private)" do
    subject(:snapshot) { service.send(:person_stats_snapshot, person) }

    def stat_group(display_name, stat_hash)
      {
        "group"  => { "displayName" => display_name },
        "splits" => [{ "stat" => stat_hash }],
      }
    end

    context "when the API returns group displayName" do
      context "for a pitcher" do
        let(:person) do
          { "stats" => [
            stat_group("pitching", { "gamesPitched" => 14, "inningsPitched" => "80.0", "era" => "3.20", "whip" => "1.12", "strikeOuts" => 88 }),
          ] }
        end

        it "populates pitching and leaves hitting nil" do
          expect(snapshot[:pitching]).to include(games: 14, era: 3.20, strikeOuts: 88)
          expect(snapshot[:hitting]).to be_nil
        end
      end

      context "for a pitcher with nil ERA and nil inningsPitched (no stats yet)" do
        let(:person) do
          { "stats" => [
            stat_group("pitching", { "gamesPitched" => 1, "gamesPlayed" => 1, "inningsPitched" => nil, "era" => nil, "whip" => nil, "strikeOuts" => 0 }),
          ] }
        end

        it "still classifies as pitching via group name" do
          expect(snapshot[:pitching]).not_to be_nil
          expect(snapshot[:pitching][:group]).to eq("pitching")
          expect(snapshot[:hitting]).to be_nil
        end
      end

      context "for a hitter" do
        let(:person) do
          { "stats" => [
            stat_group("hitting", { "gamesPlayed" => 80, "plateAppearances" => 320, "avg" => ".270", "ops" => ".810", "homeRuns" => 12, "rbi" => 44 }),
          ] }
        end

        it "populates hitting and leaves pitching nil" do
          expect(snapshot[:hitting]).to include(games: 80, homeRuns: 12)
          expect(snapshot[:pitching]).to be_nil
        end
      end

      context "for a two-way player" do
        let(:person) do
          { "stats" => [
            stat_group("hitting",  { "gamesPlayed" => 60, "plateAppearances" => 210, "avg" => ".250", "ops" => ".720", "homeRuns" => 5, "rbi" => 20 }),
            stat_group("pitching", { "gamesPitched" => 8, "inningsPitched" => "42.0", "era" => "3.86", "whip" => "1.30", "strikeOuts" => 40 }),
          ] }
        end

        it "populates both hitting and pitching" do
          expect(snapshot[:hitting][:homeRuns]).to eq(5)
          expect(snapshot[:pitching][:games]).to eq(8)
        end
      end
    end

    context "when group displayName is absent (legacy fallback)" do
      context "for a pitcher with inningsPitched present" do
        let(:person) do
          { "stats" => [{ "splits" => [{ "stat" => { "inningsPitched" => "50.0", "era" => "2.80", "whip" => "1.05", "strikeOuts" => 55, "gamesPitched" => 10 } }] }] }
        end

        it "classifies as pitching via heuristic" do
          expect(snapshot[:pitching]).not_to be_nil
          expect(snapshot[:hitting]).to be_nil
        end
      end

      context "for a hitter with no pitching fields" do
        let(:person) do
          { "stats" => [{ "splits" => [{ "stat" => { "gamesPlayed" => 50, "plateAppearances" => 200, "avg" => ".280", "ops" => ".800", "homeRuns" => 8, "rbi" => 30 } }] }] }
        end

        it "classifies as hitting via heuristic" do
          expect(snapshot[:hitting]).not_to be_nil
          expect(snapshot[:pitching]).to be_nil
        end
      end
    end

    context "when all stat rows are empty" do
      let(:person) { { "stats" => [{ "group" => { "displayName" => "pitching" }, "splits" => [{ "stat" => {} }] }] } }

      it "returns nil for both groups" do
        expect(snapshot[:pitching]).to be_nil
        expect(snapshot[:hitting]).to be_nil
      end
    end

    context "when person has no stats key" do
      let(:person) { {} }

      it "returns nil for both groups" do
        expect(snapshot).to eq({ pitching: nil, hitting: nil })
      end
    end
  end
end
