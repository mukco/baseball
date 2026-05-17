require "rails_helper"

RSpec.describe OddsService do
  let(:date_str) { "2025-04-15" }

  # ------------------------------------------------------------------
  # Helpers
  # ------------------------------------------------------------------
  def espn_event(competition_id: "401", event_id: "501", status: "STATUS_SCHEDULED",
                 home_name: "New York Yankees", away_name: "Boston Red Sox",
                 home_abbrev: "NYY", away_abbrev: "BOS",
                 home_score: nil, away_score: nil)
    {
      "id" => event_id,
      "competitions" => [{
        "id" => competition_id,
        "status" => { "type" => { "name" => status } },
        "competitors" => [
          {
            "homeAway" => "home",
            "team" => { "displayName" => home_name, "abbreviation" => home_abbrev },
            "score" => home_score
          },
          {
            "homeAway" => "away",
            "team" => { "displayName" => away_name, "abbreviation" => away_abbrev },
            "score" => away_score
          }
        ]
      }]
    }
  end

  def odds_payload(provider: "ESPN BET", moneyline: "BOS -150",
                   home_ml: 130, away_ml: -150, spread: -1.5,
                   over_under: 8.5, over_odds: -110, under_odds: -110)
    {
      "items" => [{
        "provider"     => { "name" => provider },
        "details"      => moneyline,
        "spread"       => spread,
        "overUnder"    => over_under,
        "overOdds"     => over_odds,
        "underOdds"    => under_odds,
        "homeTeamOdds" => { "current" => { "moneyLine" => { "american" => home_ml } } },
        "awayTeamOdds" => { "current" => { "moneyLine" => { "american" => away_ml } } }
      }]
    }
  end

  # ------------------------------------------------------------------
  # .today
  # ------------------------------------------------------------------
  describe ".today" do
    before do
      # Use a null cache store so Rails.cache.fetch always yields
      allow(Rails).to receive(:cache).and_return(ActiveSupport::Cache::NullStore.new)
    end

    it "returns fetched_at and games keys on success" do
      allow(Faraday).to receive(:get).and_return(
        double(body: JSON.generate({ "events" => [espn_event] }))
      )
      allow_any_instance_of(Faraday::Connection).to receive(:get).and_return(
        double(body: JSON.generate(odds_payload))
      )

      result = described_class.today(date: date_str)
      expect(result).to have_key(:fetched_at)
      expect(result).to have_key(:games)
      expect(result[:games]).to be_an(Array)
    end

    it "returns { error: } when the ESPN call raises" do
      allow(Faraday).to receive(:get).and_raise(Faraday::ConnectionFailed.new("timeout"))

      result = described_class.today(date: date_str)
      expect(result).to have_key(:error)
    end

    it "uses today's date when no date argument is given" do
      allow(Date).to receive(:current).and_return(Date.parse(date_str))
      allow(Faraday).to receive(:get).and_return(
        double(body: JSON.generate({ "events" => [] }))
      )

      result = described_class.today
      expect(result[:games]).to eq([])
    end

    it "uses Rails.cache with the correct key" do
      cache = instance_double(ActiveSupport::Cache::MemoryStore)
      allow(Rails).to receive(:cache).and_return(cache)
      allow(cache).to receive(:fetch).with("espn_odds_#{date_str}", expires_in: OddsService::CACHE_TTL).and_return({ cached: true })

      result = described_class.today(date: date_str)
      expect(result).to eq({ cached: true })
    end
  end

  # ------------------------------------------------------------------
  # parse_scoreboard_event (private)
  # ------------------------------------------------------------------
  describe "parse_scoreboard_event" do
    def parse(event)
      described_class.send(:parse_scoreboard_event, event)
    end

    it "maps STATUS_SCHEDULED to Preview and omits score" do
      result = parse(espn_event(status: "STATUS_SCHEDULED"))
      expect(result[:status]).to eq("Preview")
      expect(result[:score]).to be_nil
    end

    it "maps STATUS_PRE_GAME to Preview" do
      result = parse(espn_event(status: "STATUS_PRE_GAME"))
      expect(result[:status]).to eq("Preview")
    end

    it "maps STATUS_IN_PROGRESS to Live and includes score" do
      result = parse(espn_event(status: "STATUS_IN_PROGRESS",
                                home_score: "3", away_score: "1"))
      expect(result[:status]).to eq("Live")
      expect(result[:score]).to eq({ home: 3, away: 1 })
    end

    it "maps STATUS_HALFTIME to Live" do
      result = parse(espn_event(status: "STATUS_HALFTIME"))
      expect(result[:status]).to eq("Live")
    end

    it "maps unknown status to Final" do
      result = parse(espn_event(status: "STATUS_FINAL"))
      expect(result[:status]).to eq("Final")
    end

    it "extracts team abbreviations" do
      result = parse(espn_event(home_abbrev: "NYY", away_abbrev: "BOS"))
      expect(result[:home_abbrev]).to eq("NYY")
      expect(result[:away_abbrev]).to eq("BOS")
    end

    it "handles an empty competition gracefully" do
      result = parse({ "id" => "1", "competitions" => [] })
      expect(result[:home_team]).to be_nil
      expect(result[:away_team]).to be_nil
      expect(result[:status]).to eq("Final")
    end
  end

  # ------------------------------------------------------------------
  # parse_odds_response (private)
  # ------------------------------------------------------------------
  describe "parse_odds_response" do
    let(:game) { { competition_id: "401", home_team: "NYY", away_team: "BOS" } }

    def parse(data, g = game)
      described_class.send(:parse_odds_response, data, g)
    end

    it "returns nil when items is empty" do
      expect(parse({ "items" => [] })).to be_nil
    end

    it "returns nil when items key is absent" do
      expect(parse({})).to be_nil
    end

    it "extracts all odds fields from the first item" do
      result = parse(odds_payload)
      expect(result[:provider]).to eq("ESPN BET")
      expect(result[:moneyline]).to eq("BOS -150")
      expect(result[:home_moneyline]).to eq(130)
      expect(result[:away_moneyline]).to eq(-150)
      expect(result[:spread]).to eq(-1.5)
      expect(result[:over_under]).to eq(8.5)
      expect(result[:over_odds]).to eq(-110)
      expect(result[:under_odds]).to eq(-110)
    end

    it "returns nil moneyline components when nested keys are absent" do
      data = { "items" => [{ "provider" => { "name" => "X" }, "details" => "NYY pk" }] }
      result = parse(data)
      expect(result[:home_moneyline]).to be_nil
      expect(result[:away_moneyline]).to be_nil
      expect(result[:spread]).to be_nil
    end
  end

  # ------------------------------------------------------------------
  # parallel_odds (private) — minimal smoke test
  # ------------------------------------------------------------------
  describe "parallel_odds" do
    it "returns [] when passed an empty array" do
      expect(described_class.send(:parallel_odds, [])).to eq([])
    end

    it "includes nil for games whose odds fetch fails" do
      allow_any_instance_of(Faraday::Connection).to receive(:get).and_raise(Faraday::ConnectionFailed.new("err"))
      game = { competition_id: "1", event_id: "2", home_team: "A", away_team: "B" }
      result = described_class.send(:parallel_odds, [game])
      expect(result).to eq([nil])
    end
  end
end
