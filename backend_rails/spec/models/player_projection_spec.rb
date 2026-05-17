require "rails_helper"

RSpec.describe PlayerProjection do
  subject(:proj) { build(:player_projection) }

  describe "validations" do
    it "is valid with factory defaults" do
      expect(proj).to be_valid
    end

    %i[player_id projection_type player_type season].each do |attr|
      it "requires #{attr}" do
        proj.send(:"#{attr}=", nil)
        expect(proj).not_to be_valid
      end
    end

    it "rejects invalid projection_type" do
      proj.projection_type = "career"
      expect(proj).not_to be_valid
    end

    it "accepts valid projection_types" do
      %w[rest_of_season full_season].each do |type|
        proj.projection_type = type
        expect(proj).to be_valid
      end
    end

    it "rejects invalid player_type" do
      proj.player_type = "umpire"
      expect(proj).not_to be_valid
    end

    it "accepts valid player_types" do
      %w[batter pitcher].each do |type|
        proj.player_type = type
        expect(proj).to be_valid
      end
    end
  end

  describe "scopes" do
    before { proj.save! }

    it ".for_season filters by season" do
      other = create(:player_projection, season: 2020, projection_run: proj.projection_run)
      expect(PlayerProjection.for_season(Date.today.year)).to include(proj)
      expect(PlayerProjection.for_season(Date.today.year)).not_to include(other)
    end

    it ".batters returns batter rows" do
      pitcher = create(:player_projection, player_type: "pitcher", player_id: 999,
                       projection_run: proj.projection_run)
      expect(PlayerProjection.batters).to include(proj)
      expect(PlayerProjection.batters).not_to include(pitcher)
    end

    it ".pitchers returns pitcher rows" do
      pitcher = create(:player_projection, player_type: "pitcher", player_id: 999,
                       projection_run: proj.projection_run)
      expect(PlayerProjection.pitchers).to include(pitcher)
      expect(PlayerProjection.pitchers).not_to include(proj)
    end
  end

  describe "#projected_stats_hash" do
    it "parses projected_stats JSON as symbol-keyed hash" do
      proj.projected_stats = '{"hr":30,"avg":0.280}'
      expect(proj.projected_stats_hash).to eq({ hr: 30, avg: 0.280 })
    end

    it "returns empty hash when projected_stats is blank" do
      proj.projected_stats = nil
      expect(proj.projected_stats_hash).to eq({})
    end

    it "returns empty hash on malformed JSON" do
      proj.projected_stats = "not json"
      expect(proj.projected_stats_hash).to eq({})
    end
  end

  describe "#actual_stats_hash" do
    it "returns nil when actual_stats is blank" do
      proj.actual_stats = nil
      expect(proj.actual_stats_hash).to be_nil
    end

    it "parses actual_stats when present" do
      proj.actual_stats = '{"hr":25}'
      expect(proj.actual_stats_hash).to eq({ hr: 25 })
    end
  end

  describe "#accuracy_delta_hash" do
    it "returns nil when accuracy_delta is blank" do
      proj.accuracy_delta = nil
      expect(proj.accuracy_delta_hash).to be_nil
    end

    it "parses accuracy_delta when present" do
      proj.accuracy_delta = '{"hr":5}'
      expect(proj.accuracy_delta_hash).to eq({ hr: 5 })
    end
  end
end
