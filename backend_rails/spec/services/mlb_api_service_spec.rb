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
end
