require "rails_helper"

RSpec.describe SimulationSeasonContext do
  let(:league) { create(:simulation_league) }

  def create_games(total:, played:)
    create_list(:simulation_game, played, :completed, simulation_league: league)
    create_list(:simulation_game, total - played, simulation_league: league)
  end

  describe ".for_league" do
    subject(:ctx) { described_class.for_league(league) }

    context "when no games have been played" do
      before { create_games(total: 10, played: 0) }

      it { is_expected.to include(phase: :pre_season, games_played: 0) }
      it { is_expected.to include(pct_complete: 0.0) }
    end

    context "when 5% of games are played (early season)" do
      before { create_games(total: 100, played: 5) }

      it { is_expected.to include(phase: :early) }
    end

    context "when 30% of games are played (first half)" do
      before { create_games(total: 100, played: 30) }

      it { is_expected.to include(phase: :first_half) }
    end

    context "when 50% of games are played (midseason)" do
      before { create_games(total: 100, played: 50) }

      it { is_expected.to include(phase: :midseason) }
    end

    context "when 58% of games are played (second half / post-trade-deadline)" do
      before { create_games(total: 100, played: 58) }

      it { is_expected.to include(phase: :second_half) }
    end

    context "when 82% of games are played (stretch run)" do
      before { create_games(total: 100, played: 82) }

      it { is_expected.to include(phase: :stretch_run) }
    end

    context "when 98% of games are played (final weeks)" do
      before { create_games(total: 100, played: 98) }

      it { is_expected.to include(phase: :final_weeks) }
    end

    context "when all games are played (season complete)" do
      before { create_games(total: 100, played: 100) }

      it { is_expected.to include(phase: :complete) }
    end

    it "returns a present phase_label string" do
      create_games(total: 10, played: 0)
      expect(ctx[:phase_label]).to be_a(String).and be_present
    end

    it "returns milestone_notes as an array" do
      create_games(total: 10, played: 0)
      expect(ctx[:milestone_notes]).to be_an(Array)
    end

    it "includes an All-Star note at midseason" do
      create_games(total: 100, played: 50)
      expect(ctx[:milestone_notes].join).to match(/all-star/i)
    end

    it "includes a trade deadline note early in second half" do
      create_games(total: 100, played: 57)
      expect(ctx[:milestone_notes].join).to match(/trade deadline/i)
    end

    it "includes an award race note late in the season" do
      create_games(total: 100, played: 90)
      expect(ctx[:milestone_notes].join).to match(/award/i)
    end

    it "includes pct_complete matching games_played / total" do
      create_games(total: 100, played: 25)
      expect(ctx[:pct_complete]).to be_within(0.001).of(0.25)
    end
  end
end
