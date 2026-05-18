require "rails_helper"

RSpec.describe PlayerMetadataService do
  before do
    described_class.class_variable_set(:@@cache, {})
    described_class.class_variable_set(:@@cache_timestamps, {})
    described_class.class_variable_set(:@@page_cache, {})
    described_class.class_variable_set(:@@page_cache_timestamps, {})
    # Reset memoized class instance variables
    described_class.instance_variable_set(:@mlb_service, nil)
    described_class.instance_variable_set(:@finance_connection, nil)
  end

  describe ".fetch" do
    let(:player_id)  { 521692 }
    let(:team_id)    { 118 }
    let(:player_name) { "Salvador Perez" }

    it "caches the result so the awards endpoint is not called twice" do
      fake_mlb = instance_double(MlbApiService)
      allow(fake_mlb).to receive(:send).with(:get, "people/#{player_id}/awards", { sportId: 1 })
                                       .and_return({ "awards" => [] })
      allow(MlbApiService).to receive(:new).and_return(fake_mlb)
      allow(described_class).to receive(:fetch_payroll_page).and_return("<html></html>")

      described_class.fetch(player_id: player_id, team_id: team_id, player_name: player_name)
      described_class.fetch(player_id: player_id, team_id: team_id, player_name: player_name)

      expect(fake_mlb).to have_received(:send).once
    end
  end

  describe "payroll page caching" do
    let(:slug)      { "royals" }
    let(:team_id)   { 118 }
    let(:fake_html) { "<html><body>payroll data</body></html>" }

    it "fetches the Fangraphs page only once per team when multiple players are looked up" do
      faraday_conn = instance_double(Faraday::Connection)
      faraday_resp = instance_double(Faraday::Response, body: fake_html)
      allow(faraday_conn).to receive(:get).and_return(faraday_resp)

      fake_mlb = instance_double(MlbApiService)
      allow(fake_mlb).to receive(:send).and_return({ "awards" => [] })
      allow(MlbApiService).to receive(:new).and_return(fake_mlb)

      allow(Faraday).to receive(:new).and_call_original
      allow(Faraday).to receive(:new).with(no_args).and_return(faraday_conn)

      allow(described_class).to receive(:finance_connection).and_return(faraday_conn)

      described_class.fetch(player_id: 521692, team_id: team_id, player_name: "Salvador Perez")
      described_class.fetch(player_id: 664728, team_id: team_id, player_name: "Bobby Witt Jr.")

      expect(faraday_conn).to have_received(:get)
        .with("https://www.fangraphs.com/roster-resource/payroll/#{slug}")
        .once
    end

    it "serves a cached page without HTTP when TTL is fresh" do
      described_class.class_variable_get(:@@page_cache)[slug]            = fake_html
      described_class.class_variable_get(:@@page_cache_timestamps)[slug] = Time.now.to_i

      fake_mlb = instance_double(MlbApiService)
      allow(fake_mlb).to receive(:send).and_return({ "awards" => [] })
      allow(MlbApiService).to receive(:new).and_return(fake_mlb)
      allow(described_class).to receive(:finance_connection).and_return(double("conn"))

      expect(described_class).not_to receive(:finance_connection)

      result = described_class.send(:fetch_payroll_page, slug)
      expect(result).to eq(fake_html)
    end
  end
end
