require "rails_helper"

RSpec.describe GenerateDailyNewsJob do
  let(:league) { create(:simulation_league) }

  it "calls SimulationNewsService with the correct arguments" do
    expect(SimulationNewsService).to receive(:generate_for_date).with(league, "2025-06-12")
    described_class.new.perform(league.id, "2025-06-12")
  end

  it "does nothing when league no longer exists" do
    expect(SimulationNewsService).not_to receive(:generate_for_date)
    described_class.new.perform(999_999, "2025-06-12")
  end

  it "swallows errors and does not re-raise" do
    allow(SimulationNewsService).to receive(:generate_for_date).and_raise(RuntimeError, "OpenAI timeout")
    expect { described_class.new.perform(league.id, "2025-06-12") }.not_to raise_error
  end
end
