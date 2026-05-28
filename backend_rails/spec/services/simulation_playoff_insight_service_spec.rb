require "rails_helper"

RSpec.describe SimulationPlayoffInsightService do
  let(:league) { create(:simulation_league) }
  let(:ai_output) do
    {
      output: {
        "narrative"           => "A gripping postseason narrative.",
        "series_storylines"   => ["Team A swept Team B in a dominant fashion."],
        "standout_performers" => ["Player X hit .400 with 3 HR.", "Pitcher Y posted a 1.50 ERA."],
        "champion_notes"      => ["Team A's bullpen was lights-out all October."],
      },
    }
  end
  let(:client) { instance_double(OpenAi::Client) }

  before do
    allow(OpenAi::Client).to receive(:new).and_return(client)
    allow(client).to receive(:json_completion).and_return(ai_output)
  end

  def make_series(round:, status:, home_abbr: "NYY", away_abbr: "BOS", home_wins: 0, away_wins: 0, winner_id: nil)
    create(:simulation_playoff_series,
           simulation_league: league,
           round:             round,
           status:            status,
           home_team_abbr:    home_abbr,
           away_team_abbr:    away_abbr,
           home_team_id:      147,
           away_team_id:      111,
           home_wins:         home_wins,
           away_wins:         away_wins,
           winner_team_id:    winner_id)
  end

  # ── #call ────────────────────────────────────────────────────────────────────

  describe ".call" do
    context "when no playoff series exist" do
      it "returns an error" do
        result = described_class.call(league: league)
        expect(result[:error]).to eq("No playoff series found")
      end
    end

    context "when the Wild Card is in progress" do
      before { make_series(round: "wc", status: "in_progress") }

      it "generates insights without error" do
        result = described_class.call(league: league)
        expect(result[:error]).to be_nil
        expect(result[:narrative]).to eq("A gripping postseason narrative.")
      end

      it "returns phase: wild_card" do
        result = described_class.call(league: league)
        expect(result[:phase]).to eq("wild_card")
      end

      it "passes Wild Card context to the AI" do
        described_class.call(league: league)
        expect(client).to have_received(:json_completion).with(
          hash_including(
            user_payload: hash_including(current_round: "Wild Card"),
            interaction_type: "sim_playoff_insight",
          )
        )
      end
    end

    context "when the Division Series is in progress (Wild Card complete)" do
      before do
        make_series(round: "wc", status: "complete", home_wins: 2, away_wins: 1, winner_id: 147)
        make_series(round: "ds", status: "in_progress", home_abbr: "NYY", away_abbr: "HOU")
      end

      it "returns phase: division_series" do
        result = described_class.call(league: league)
        expect(result[:phase]).to eq("division_series")
      end

      it "includes the completed Wild Card in the payload" do
        described_class.call(league: league)
        expect(client).to have_received(:json_completion).with(
          hash_including(
            user_payload: hash_including(
              current_round: "Division Series",
              rounds_complete: ["Wild Card"],
            ),
          )
        )
      end
    end

    context "when the Championship Series is in progress" do
      before do
        make_series(round: "wc", status: "complete", home_wins: 2, away_wins: 0, winner_id: 147)
        make_series(round: "ds", status: "complete", home_wins: 3, away_wins: 1, winner_id: 147)
        make_series(round: "cs", status: "in_progress")
      end

      it "returns phase: championship_series" do
        result = described_class.call(league: league)
        expect(result[:phase]).to eq("championship_series")
      end
    end

    context "when the World Series is in progress" do
      before do
        make_series(round: "wc", status: "complete", home_wins: 2, away_wins: 0, winner_id: 147)
        make_series(round: "ds", status: "complete", home_wins: 3, away_wins: 0, winner_id: 147)
        make_series(round: "cs", status: "complete", home_wins: 4, away_wins: 1, winner_id: 147)
        make_series(round: "ws", status: "in_progress")
      end

      it "returns phase: world_series" do
        result = described_class.call(league: league)
        expect(result[:phase]).to eq("world_series")
      end
    end

    context "when all rounds are complete" do
      before do
        make_series(round: "wc", status: "complete", home_wins: 2, away_wins: 0, winner_id: 147)
        make_series(round: "ds", status: "complete", home_wins: 3, away_wins: 0, winner_id: 147)
        make_series(round: "cs", status: "complete", home_wins: 4, away_wins: 1, winner_id: 147)
        make_series(round: "ws", status: "complete", home_wins: 4, away_wins: 3, winner_id: 147)
      end

      it "returns phase: complete" do
        result = described_class.call(league: league)
        expect(result[:phase]).to eq("complete")
      end

      it "includes all bullet sections" do
        result = described_class.call(league: league)
        expect(result[:bullets]).to have_key(:series_storylines)
        expect(result[:bullets]).to have_key(:standout_performers)
        expect(result[:bullets]).to have_key(:champion_notes)
      end
    end

    context "caching" do
      before { make_series(round: "wc", status: "complete", home_wins: 2, away_wins: 0, winner_id: 147) }

      it "returns cached insight on subsequent calls without regenerating" do
        described_class.call(league: league)
        described_class.call(league: league)
        expect(client).to have_received(:json_completion).once
      end

      it "regenerates when refresh: true" do
        described_class.call(league: league)
        described_class.call(league: league, refresh: true)
        expect(client).to have_received(:json_completion).twice
      end
    end
  end

  # ── #playoff_context ─────────────────────────────────────────────────────────

  describe ".playoff_context (private)" do
    subject(:ctx) { described_class.send(:playoff_context, series_all) }

    context "all pending" do
      let(:series_all) do
        [build_stubbed(:simulation_playoff_series, round: "wc", status: "pending")]
      end

      it { is_expected.to include(phase: :wild_card, current_round: "wc") }
      it { expect(ctx[:complete_rounds]).to be_empty }
      it { expect(ctx[:active_rounds]).to be_empty }
    end

    context "Wild Card in_progress" do
      let(:series_all) do
        [build_stubbed(:simulation_playoff_series, round: "wc", status: "in_progress")]
      end

      it { is_expected.to include(phase: :wild_card, current_round: "wc") }
      it { expect(ctx[:active_rounds]).to eq(["wc"]) }
    end

    context "Wild Card complete, DS pending" do
      let(:series_all) do
        [
          build_stubbed(:simulation_playoff_series, round: "wc", status: "complete"),
          build_stubbed(:simulation_playoff_series, round: "ds", status: "pending"),
        ]
      end

      it { is_expected.to include(phase: :division_series, current_round: "ds") }
      it { expect(ctx[:complete_rounds]).to eq(["wc"]) }
    end

    context "Wild Card + DS complete, CS in_progress" do
      let(:series_all) do
        [
          build_stubbed(:simulation_playoff_series, round: "wc", status: "complete"),
          build_stubbed(:simulation_playoff_series, round: "ds", status: "complete"),
          build_stubbed(:simulation_playoff_series, round: "cs", status: "in_progress"),
        ]
      end

      it { is_expected.to include(phase: :championship_series, current_round: "cs") }
    end

    context "everything complete" do
      let(:series_all) do
        %w[wc ds cs ws].map { |r| build_stubbed(:simulation_playoff_series, round: r, status: "complete") }
      end

      it { is_expected.to include(phase: :complete, current_round: "ws") }
      it { expect(ctx[:complete_rounds]).to eq(%w[wc ds cs ws]) }
    end
  end
end
