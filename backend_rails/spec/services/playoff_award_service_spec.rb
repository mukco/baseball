require "rails_helper"

RSpec.describe PlayoffAwardService do
  let(:league) { create(:simulation_league) }

  let(:ws_series) do
    create(:simulation_playoff_series, simulation_league: league,
           round: "ws", league: "MLB", series_index: 0,
           home_team_id: 114, away_team_id: 113,
           home_team_abbr: "CLE", away_team_abbr: "CIN",
           home_wins: 1, away_wins: 4, winner_team_id: 113, status: "complete")
  end

  let(:al_cs) do
    create(:simulation_playoff_series, simulation_league: league,
           round: "cs", league: "AL", series_index: 0,
           home_team_id: 136, away_team_id: 114,
           home_team_abbr: "SEA", away_team_abbr: "CLE",
           home_wins: 3, away_wins: 4, winner_team_id: 114, status: "complete")
  end

  let(:nl_cs) do
    create(:simulation_playoff_series, simulation_league: league,
           round: "cs", league: "NL", series_index: 0,
           home_team_id: 113, away_team_id: 135,
           home_team_abbr: "CIN", away_team_abbr: "SD",
           home_wins: 4, away_wins: 2, winner_team_id: 113, status: "complete")
  end

  let(:pid_counter) { { v: 700_000 } }

  def next_pid
    pid_counter[:v] += 1
  end

  def make_playoff_batter(series:, team_id:, ab: 18, h: 6, hr: 2, rbi: 5, bb: 2, **attrs)
    SimulationPlayoffPlayerStat.create!(
      simulation_league: league,
      simulation_playoff_series: series,
      round: series.round,
      player_id: next_pid,
      player_name: "Batter",
      player_type: "batter",
      team_id: team_id,
      g: 5, ab: ab, h: h, hr: hr, rbi: rbi, bb: bb, k: 4, r: 3,
      doubles: 1, triples: 0, hbp: 0, sf: 0,
      g_pitched: 0, gs: 0, outs_pitched: 0, h_allowed: 0, er: 0,
      bb_allowed: 0, k_pitched: 0, bf: 0, hr_allowed: 0, w: 0, l: 0, sv: 0,
      **attrs
    )
  end

  def make_playoff_pitcher(series:, team_id:, outs_pitched: 18, er: 2, **attrs)
    SimulationPlayoffPlayerStat.create!(
      simulation_league: league,
      simulation_playoff_series: series,
      round: series.round,
      player_id: next_pid,
      player_name: "Pitcher",
      player_type: "pitcher",
      team_id: team_id,
      g: 0, ab: 0, h: 0, hr: 0, rbi: 0, bb: 0, k: 0, r: 0,
      doubles: 0, triples: 0, hbp: 0, sf: 0,
      g_pitched: 2, gs: 1, outs_pitched: outs_pitched,
      h_allowed: 5, er: er, bb_allowed: 3, k_pitched: 14,
      bf: 24, hr_allowed: 1, w: 1, l: 0, sv: 0,
      **attrs
    )
  end

  let(:ai_response) do
    {
      "ws_mvp"   => { "winner" => { "player_id" => 1, "player_name" => "WS Hero", "team_abbr" => "CIN", "stats" => {} },
                      "finalists" => [], "rationale" => "Dominant in the WS." },
      "alcs_mvp" => { "winner" => { "player_id" => 2, "player_name" => "ALCS Hero", "team_abbr" => "CLE", "stats" => {} },
                      "finalists" => [], "rationale" => "Anchored the ALCS." },
      "nlcs_mvp" => { "winner" => { "player_id" => 3, "player_name" => "NLCS Hero", "team_abbr" => "CIN", "stats" => {} },
                      "finalists" => [], "rationale" => "Led the NLCS." },
    }
  end

  before do
    allow_any_instance_of(OpenAi::Client).to receive(:json_completion).and_return(ai_response)
  end

  describe ".playoff_awards_data" do
    context "when no insight exists" do
      it "returns nil" do
        expect(described_class.playoff_awards_data(league)).to be_nil
      end
    end

    context "when a playoff_awards insight exists" do
      before do
        create(:simulation_insight,
               simulation_league: league,
               subject_type: "playoff_awards",
               subject_id:   league.id,
               bullets_json: ai_response.to_json)
      end

      it "returns the parsed JSON" do
        result = described_class.playoff_awards_data(league)
        expect(result).to eq(ai_response)
      end
    end
  end

  describe ".generate_playoff_awards" do
    context "when playoffs are not complete" do
      it "returns an error" do
        result = described_class.generate_playoff_awards(league)
        expect(result[:error]).to be_present
      end
    end

    context "when all series are complete" do
      before do
        ws_series; al_cs; nl_cs
        # Add at least one batter and pitcher per series/team so candidates exist
        pid = 500_000
        [
          [ws_series,  113],
          [al_cs,  114],
          [nl_cs,  113],
        ].each do |series, team_id|
          SimulationPlayoffPlayerStat.create!(
            simulation_league: league, simulation_playoff_series: series,
            round: series.round, player_id: (pid += 1),
            player_name: "Player", player_type: "batter", team_id: team_id,
            g: 4, ab: 16, h: 5, hr: 1, rbi: 3, bb: 2, k: 3, r: 2,
            doubles: 1, triples: 0, hbp: 0, sf: 0,
            g_pitched: 0, gs: 0, outs_pitched: 0, h_allowed: 0, er: 0,
            bb_allowed: 0, k_pitched: 0, bf: 0, hr_allowed: 0, w: 0, l: 0, sv: 0
          )
        end
      end

      it "calls OpenAI and persists a SimulationInsight" do
        expect {
          described_class.generate_playoff_awards(league)
        }.to change(SimulationInsight, :count).by(1)

        insight = SimulationInsight.find_by(simulation_league: league, subject_type: "playoff_awards")
        expect(insight).to be_present
        expect(JSON.parse(insight.bullets_json)).to eq(ai_response)
      end

      it "returns the AI response" do
        result = described_class.generate_playoff_awards(league)
        expect(result).to eq(ai_response)
      end

      it "upserts on re-generation — does not duplicate insights" do
        described_class.generate_playoff_awards(league)
        expect {
          described_class.generate_playoff_awards(league)
        }.not_to change(SimulationInsight, :count)
      end

      it "sends all three award keys in the OpenAI payload" do
        expect_any_instance_of(OpenAi::Client).to receive(:json_completion) do |_, args|
          payload = JSON.parse(args[:user_payload])
          expect(payload.keys).to include("ws_mvp", "alcs_mvp", "nlcs_mvp")
          ai_response
        end
        described_class.generate_playoff_awards(league)
      end
    end
  end
end
