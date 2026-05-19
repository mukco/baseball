require "rails_helper"

RSpec.describe ProjectionAccuracyService do
  describe ".league_accuracy" do
    context "when no PlayerProjections exist" do
      it "returns empty aggregate with sample_size: 0" do
        result = described_class.league_accuracy(player_type: "batter")
        expect(result[:sample_size]).to eq(0)
        expect(result[:aggregate]).to eq({})
        expect(result[:player_type]).to eq("batter")
      end
    end

    context "with cached data" do
      it "returns the cached result without re-computing" do
        cached = { player_type: "batter", aggregate: {}, sample_size: 0, seasons_range: [] }
        allow(Rails.cache).to receive(:read)
          .with("projection_accuracy_league_batter")
          .and_return(cached)

        expect(described_class).not_to receive(:compute_league)
        result = described_class.league_accuracy(player_type: "batter")
        expect(result).to eq(cached)
      end
    end
  end

  describe "delta_if_present (private)" do
    let(:bucket) { [] }
    let(:svc)    { described_class }

    def delta(bucket, stat, proj, actual)
      svc.send(:delta_if_present, bucket, stat, proj, actual)
    end

    it "appends a delta entry when both values are present" do
      delta(bucket, :era, 3.50, 3.80)
      expect(bucket).to eq([{ stat: :era, delta: (3.50 - 3.80) }])
    end

    it "does nothing when projected value is nil" do
      delta(bucket, :era, nil, 3.80)
      expect(bucket).to be_empty
    end

    it "does nothing when actual value is nil" do
      delta(bucket, :era, 3.50, nil)
      expect(bucket).to be_empty
    end

    it "skips zero float actuals (missing data marker)" do
      delta(bucket, :era, 3.50, 0.0)
      expect(bucket).to be_empty
    end

    it "keeps integer zero actuals (valid HR = 0)" do
      delta(bucket, :hr, 20, 0)
      expect(bucket).to eq([{ stat: :hr, delta: 20 }])
    end
  end

  describe "ip_to_f (private)" do
    it "converts '180.0' to 180.0" do
      expect(described_class.send(:ip_to_f, "180.0")).to eq(180.0)
    end

    it "converts '180.1' (1 out) to 180 + 1/3" do
      expect(described_class.send(:ip_to_f, "180.1")).to be_within(0.01).of(180.333)
    end

    it "returns 0.0 for blank input" do
      expect(described_class.send(:ip_to_f, nil)).to eq(0.0)
      expect(described_class.send(:ip_to_f, "")).to eq(0.0)
    end
  end
end
