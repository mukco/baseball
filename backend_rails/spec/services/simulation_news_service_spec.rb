require "rails_helper"

RSpec.describe SimulationNewsService do
  let(:league) { create(:simulation_league) }

  def make_game(home_score:, away_score:, date: Date.today,
                home_abbr: "NYY", away_abbr: "BOS",
                home_pitchers: [], away_pitchers: [],
                home_batters:  [], away_batters:  [])
    bs = {
      home: { batters: home_batters, pitchers: home_pitchers },
      away: { batters: away_batters, pitchers: away_pitchers },
    }
    create(:simulation_game,
           simulation_league: league,
           game_date:         date,
           home_score:        home_score,
           away_score:        away_score,
           home_team_abbr:    home_abbr,
           away_team_abbr:    away_abbr,
           simulated_at:      Time.now,
           box_score_json:    bs.to_json)
  end

  def games_for_today
    league.simulation_games.where(game_date: Date.today).where.not(simulated_at: nil).to_a
  end

  # ─── find_notable_events ─────────────────────────────────────────────────────

  describe ".find_notable_events" do
    it "detects a blowout (diff >= 8)" do
      make_game(home_score: 12, away_score: 2)
      events = described_class.find_notable_events(games_for_today)
      expect(events).to include(a_string_starting_with("BLOWOUT:"))
    end

    it "detects a pitcher's duel (total runs <= 1)" do
      make_game(home_score: 1, away_score: 0)
      events = described_class.find_notable_events(games_for_today)
      expect(events).to include(a_string_starting_with("PITCHER'S DUEL:"))
    end

    it "detects an offensive explosion (max team score >= 12)" do
      make_game(home_score: 13, away_score: 5)
      events = described_class.find_notable_events(games_for_today)
      expect(events).to include(a_string_starting_with("OFFENSIVE EXPLOSION:"))
    end

    it "detects a multi-HR batter" do
      batters = [{ player_id: 1, name: "Aaron Judge", ab: 4, h: 3, hr: 2, rbi: 5, bb: 0, k: 1, r: 2, double: 0, triple: 0 }]
      make_game(home_score: 8, away_score: 2, home_batters: batters)
      events = described_class.find_notable_events(games_for_today)
      expect(events).to include(a_string_matching(/MULTI-HR.*Aaron Judge/))
    end

    it "detects a dominant starter by strikeouts (>= 10 K)" do
      pitchers = [{ player_id: 100, name: "Gerrit Cole", ip: "7.0", h: 4, er: 1, bb: 1, k: 11, bf: 24, hr: 0, decision: "W" }]
      make_game(home_score: 5, away_score: 1, home_pitchers: pitchers)
      events = described_class.find_notable_events(games_for_today)
      expect(events).to include(a_string_matching(/DOMINANT START.*Gerrit Cole/))
    end

    it "detects a dominant starter by innings (7+ IP 0 ER)" do
      pitchers = [{ player_id: 100, name: "Max Scherzer", ip: "7.0", h: 5, er: 0, bb: 1, k: 8, bf: 24, hr: 0, decision: "W" }]
      make_game(home_score: 3, away_score: 0, home_pitchers: pitchers)
      events = described_class.find_notable_events(games_for_today)
      expect(events).to include(a_string_matching(/DOMINANT START.*Max Scherzer/))
    end

    it "detects a no-hit candidate (8+ IP, 0 H)" do
      pitchers = [{ player_id: 100, name: "Sandy Koufax", ip: "8.0", h: 0, er: 0, bb: 1, k: 12, bf: 25, hr: 0, decision: "W" }]
      make_game(home_score: 2, away_score: 0, home_pitchers: pitchers)
      events = described_class.find_notable_events(games_for_today)
      expect(events).to include(a_string_starting_with("NO-HIT CANDIDATE:"))
    end

    it "returns empty array when nothing notable happens" do
      make_game(home_score: 4, away_score: 3)
      events = described_class.find_notable_events(games_for_today)
      expect(events).to be_empty
    end

    it "deduplicates identical events" do
      make_game(home_score: 12, away_score: 1)  # blowout AND explosion — only one event for each type
      events = described_class.find_notable_events(games_for_today)
      expect(events.uniq).to eq(events)
    end
  end

  # ─── generate_for_date ───────────────────────────────────────────────────────

  describe ".generate_for_date" do
    let(:ai_response) do
      { output: { "headline" => "Big day in the league", "stories" => [{ "headline" => "Judge dominates", "body" => "Two homers." }] } }
    end

    before do
      allow_any_instance_of(OpenAi::Client).to receive(:json_completion).and_return(ai_response)
    end

    context "when no games exist for the date" do
      it "returns nil" do
        result = described_class.generate_for_date(league, Date.tomorrow)
        expect(result).to be_nil
      end
    end

    context "when fewer than 2 notable events" do
      before { make_game(home_score: 4, away_score: 3) }

      it "writes a stub record without calling OpenAI" do
        expect_any_instance_of(OpenAi::Client).not_to receive(:json_completion)
        result = described_class.generate_for_date(league, Date.today)
        expect(result).to be_a(SimulationNewsStory)
        expect(result.ai_generated).to eq(false)
        expect(result.headline).to be_nil
      end
    end

    context "when >= 2 notable events" do
      before do
        batters = [{ player_id: 1, name: "Judge", ab: 4, h: 3, hr: 2, rbi: 5, bb: 0, k: 0, r: 2, double: 0, triple: 0 }]
        make_game(home_score: 14, away_score: 2, home_batters: batters)  # blowout + multi-HR
      end

      it "calls OpenAI and persists an ai_generated story" do
        expect {
          described_class.generate_for_date(league, Date.today)
        }.to change(SimulationNewsStory, :count).by(1)

        story = SimulationNewsStory.find_by(simulation_league: league, story_date: Date.today)
        expect(story.ai_generated).to eq(true)
        expect(story.headline).to eq("Big day in the league")
        expect(story.stories.first["headline"]).to eq("Judge dominates")
      end

      it "is idempotent — returns existing record without calling AI on re-call" do
        described_class.generate_for_date(league, Date.today)
        expect_any_instance_of(OpenAi::Client).not_to receive(:json_completion)
        expect {
          described_class.generate_for_date(league, Date.today)
        }.not_to change(SimulationNewsStory, :count)
      end

      it "accepts a date string" do
        expect {
          described_class.generate_for_date(league, Date.today.to_s)
        }.to change(SimulationNewsStory, :count).by(1)
      end
    end
  end
end
