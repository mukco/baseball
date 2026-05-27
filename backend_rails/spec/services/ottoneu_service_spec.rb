require "rails_helper"

RSpec.describe OttoneuService do
  # Reset class-level cache and memoized Faraday connection before each example
  before do
    described_class.class_variable_set(:@@cache, {})
    described_class.class_variable_set(:@@cache_timestamps, {})
    described_class.class_variable_set(:@@cache_ttls, {})
    described_class.instance_variable_set(:@conn, nil)
  end

  let(:roster_csv) do
    <<~CSV
      TeamID,Team Name,Name,ottoneu ID,FG MajorLeagueID,MLB Team,Position(s),Salary
      6054,Dingers and Dugouts,Aaron Judge,1001,116539,NYY,OF,$40
      6054,Dingers and Dugouts,Shane Bieber,1002,669456,CLE,SP,$25
      6054,Dingers and Dugouts,Julio Rodriguez,1003,682998,SEA,OF/DH,$18
      9999,Other Team,Shohei Ohtani,1004,660271,LAD,DH/SP,$50
    CSV
  end

  let(:fake_conn) { instance_double(Faraday::Connection) }
  let(:roster_response) { instance_double(Faraday::Response, body: roster_csv.dup.force_encoding("UTF-8")) }

  before do
    allow(described_class).to receive(:conn).and_return(fake_conn)
    allow(fake_conn).to receive(:get).and_return(roster_response)
  end

  # ── all_rosters ──────────────────────────────────────────────────────────────

  describe ".all_rosters" do
    it "returns an array of teams" do
      expect(described_class.all_rosters).to be_an(Array)
      expect(described_class.all_rosters.size).to eq(2)
    end

    it "parses team_id, team_name, and player fields" do
      dingers = described_class.all_rosters.find { |t| t[:team_id] == 6054 }
      expect(dingers[:team_name]).to eq("Dingers and Dugouts")
      expect(dingers[:players].size).to eq(3)
    end

    it "parses salary as integer dollars (strips $)" do
      judge = described_class.all_rosters
        .find { |t| t[:team_id] == 6054 }[:players]
        .find { |p| p[:name] == "Aaron Judge" }
      expect(judge[:salary]).to eq(40)
    end

    it "maps fg_id from FG MajorLeagueID column" do
      bieber = described_class.all_rosters
        .find { |t| t[:team_id] == 6054 }[:players]
        .find { |p| p[:name] == "Shane Bieber" }
      expect(bieber[:fg_id]).to eq("669456")
    end

    it "caches result on second call" do
      described_class.all_rosters
      described_class.all_rosters
      expect(fake_conn).to have_received(:get).once
    end

    context "when HTTP raises" do
      before { allow(fake_conn).to receive(:get).and_raise(Faraday::Error, "timeout") }

      it "returns an error hash" do
        expect(described_class.all_rosters).to include(error: "timeout")
      end

      it "does not cache the error" do
        described_class.all_rosters
        expect(described_class.class_variable_get(:@@cache)).not_to have_key(:all_rosters)
      end
    end

    context "when response body is HTML (not CSV)" do
      let(:roster_response) do
        instance_double(Faraday::Response, body: "<html><body>Forbidden</body></html>")
      end

      it "returns an empty array" do
        expect(described_class.all_rosters).to eq([])
      end
    end
  end

  # ── my_roster ────────────────────────────────────────────────────────────────

  describe ".my_roster" do
    it "returns only the Dingers and Dugouts team" do
      result = described_class.my_roster
      expect(result[:team_name]).to eq("Dingers and Dugouts")
      expect(result[:team_id]).to eq(6054)
    end

    it "includes all 3 players on the team" do
      expect(described_class.my_roster[:players].size).to eq(3)
    end

    it "returns error hash when all_rosters fails" do
      allow(fake_conn).to receive(:get).and_raise(Faraday::Error, "timeout")
      expect(described_class.my_roster).to include(error: "timeout")
    end

    context "when OTTONEU_TEAM_ID points to an absent team" do
      before { stub_const("ENV", ENV.to_h.merge("OTTONEU_TEAM_ID" => "9999999")) }

      it "returns an error about team not found" do
        expect(described_class.my_roster[:error]).to match(/not found/i)
      end
    end
  end

  # ── player_status ─────────────────────────────────────────────────────────────

  describe ".player_status" do
    it "returns rostered: true with team and salary when player is found" do
      result = described_class.player_status("116539")
      expect(result[:rostered]).to be true
      expect(result[:team_name]).to eq("Dingers and Dugouts")
      expect(result[:salary]).to eq(40)
    end

    it "returns rostered: false when fg_id not in any roster" do
      expect(described_class.player_status("9999999")).to eq({ rostered: false })
    end

    it "returns error hash when all_rosters fails" do
      allow(fake_conn).to receive(:get).and_raise(Faraday::Error, "timeout")
      expect(described_class.player_status("116539")).to include(error: "timeout")
    end
  end

  # ── standings ────────────────────────────────────────────────────────────────

  describe ".standings" do
    let(:standings_html) do
      <<~HTML
        <html><body>
          <h2>Lansdowne Division</h2>
          <table>
            <thead><tr><th>Team</th><th>Record</th><th>Points</th><th>Avg Pts</th><th>Avg Pts Against</th></tr></thead>
            <tbody>
              <tr><td>Dingers and Dugouts</td><td>5-3</td><td>312.4</td><td>39.1</td><td>35.2</td></tr>
              <tr><td>Other Team</td><td>3-5</td><td>280.0</td><td>35.0</td><td>38.0</td></tr>
            </tbody>
          </table>
        </body></html>
      HTML
    end

    before do
      allow(fake_conn).to receive(:get)
        .with(include("standings"))
        .and_return(instance_double(Faraday::Response, body: standings_html))
    end

    it "returns a hash with :divisions key" do
      expect(described_class.standings).to have_key(:divisions)
    end

    it "caches on second call" do
      described_class.standings
      described_class.standings
      expect(fake_conn).to have_received(:get).with(include("standings")).once
    end

    context "when HTTP raises" do
      before { allow(fake_conn).to receive(:get).and_raise(Faraday::Error, "net error") }

      it "returns an error hash" do
        expect(described_class.standings).to include(error: "net error")
      end

      it "does not cache the error" do
        described_class.standings
        expect(described_class.class_variable_get(:@@cache)).not_to have_key(:standings)
      end
    end
  end

  # ── auctions ─────────────────────────────────────────────────────────────────

  describe ".auctions" do
    let(:auctions_html) do
      <<~HTML
        <html><body>
          <table>
            <tbody>
              <tr><td><a href="#">Curtis Mead</a> TB 3B</td><td>$5</td><td>Jun 5 10:00 PM</td></tr>
            </tbody>
          </table>
          <table><tbody></tbody></table>
        </body></html>
      HTML
    end

    before do
      allow(fake_conn).to receive(:get)
        .with(include("auctions"))
        .and_return(instance_double(Faraday::Response, body: auctions_html))
    end

    it "returns :active and :completed keys" do
      result = described_class.auctions
      expect(result).to have_key(:active)
      expect(result).to have_key(:completed)
    end

    it "caches result on second call" do
      described_class.auctions
      described_class.auctions
      expect(fake_conn).to have_received(:get).with(include("auctions")).once
    end
  end

  # ── waivers ──────────────────────────────────────────────────────────────────

  describe ".waivers" do
    let(:waivers_html) do
      <<~HTML
        <html><body>
          <table>
            <tbody>
              <tr><td><a href="#">Bryan Abreu</a></td><td>HOU</td><td>Jun 5</td><td>$3</td></tr>
            </tbody>
          </table>
          <table><tbody></tbody></table>
        </body></html>
      HTML
    end

    before do
      allow(fake_conn).to receive(:get)
        .with(include("waiverclaim"))
        .and_return(instance_double(Faraday::Response, body: waivers_html))
    end

    it "returns :active and :completed keys" do
      result = described_class.waivers
      expect(result).to have_key(:active)
      expect(result).to have_key(:completed)
    end

    it "caches result on second call" do
      described_class.waivers
      described_class.waivers
      expect(fake_conn).to have_received(:get).with(include("waiverclaim")).once
    end
  end

  # ── cap_overview ─────────────────────────────────────────────────────────────

  describe ".cap_overview" do
    let(:tools_html) do
      <<~HTML
        <html><body>
          <table>
            <thead><tr><th>Team</th><th>Players</th><th>Spots</th><th>Base Salaries</th><th>Cap Penalties</th><th>Incoming Loans</th><th>Outgoing Loans</th><th>Available Cap Space</th></tr></thead>
            <tbody>
              <tr><td>Dingers and Dugouts</td><td>40</td><td>2</td><td>$300</td><td>$0</td><td>$0</td><td>$0</td><td>$100</td></tr>
              <tr><td>Other Team</td><td>38</td><td>4</td><td>$280</td><td>$5</td><td>$0</td><td>$0</td><td>$115</td></tr>
            </tbody>
          </table>
        </body></html>
      HTML
    end

    before do
      allow(fake_conn).to receive(:get)
        .with(include("tools"))
        .and_return(instance_double(Faraday::Response, body: tools_html))
    end

    it "returns an array of team cap entries" do
      expect(described_class.cap_overview).to be_an(Array)
    end

    it "parses cap_space as integer" do
      dingers = described_class.cap_overview.find { |t| t[:team_name] == "Dingers and Dugouts" }
      expect(dingers[:cap_space]).to eq(100)
    end

    it "caches result on second call" do
      described_class.cap_overview
      described_class.cap_overview
      expect(fake_conn).to have_received(:get).with(include("tools")).once
    end
  end

  # ── current_matchups ─────────────────────────────────────────────────────────

  describe ".current_matchups" do
    let(:schedule_html) do
      <<~HTML
        <html><body>
          <table>
            <tbody>
              <tr>
                <td><a href="#">Dingers and Dugouts</a></td>
                <td><a href="#">Opponent A</a></td>
                <td>321.5</td><td>310.0</td><td>Live</td>
              </tr>
            </tbody>
          </table>
        </body></html>
      HTML
    end

    before do
      allow(fake_conn).to receive(:get)
        .with(include("schedule"))
        .and_return(instance_double(Faraday::Response, body: schedule_html))
      # my_roster needs all_rosters data (which also calls conn)
      allow(fake_conn).to receive(:get)
        .with(include("rosterexport"))
        .and_return(roster_response)
    end

    it "returns a hash with :matchups key" do
      result = described_class.current_matchups
      expect(result).to have_key(:matchups)
      expect(result[:matchups]).to be_an(Array)
    end

    it "caches on second call" do
      described_class.current_matchups
      described_class.current_matchups
      expect(fake_conn).to have_received(:get).with(include("schedule")).once
    end
  end
end
