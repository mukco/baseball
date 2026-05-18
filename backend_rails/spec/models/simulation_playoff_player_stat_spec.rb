require "rails_helper"

RSpec.describe SimulationPlayoffPlayerStat do
  let(:league)  { create(:simulation_league) }
  let(:series)  { create(:simulation_playoff_series, simulation_league: league, round: "ws") }

  def build_batter(**attrs)
    defaults = {
      simulation_league: league, simulation_playoff_series: series,
      round: "ws", player_id: 700_001, player_name: "Test Batter",
      player_type: "batter", team_id: 147,
      g: 5, ab: 18, h: 6, hr: 2, rbi: 5, bb: 3, k: 4, r: 3,
      doubles: 1, triples: 0, hbp: 0, sf: 0,
      g_pitched: 0, gs: 0, outs_pitched: 0, h_allowed: 0, er: 0,
      bb_allowed: 0, k_pitched: 0, bf: 0, hr_allowed: 0, w: 0, l: 0, sv: 0,
    }
    described_class.new(defaults.merge(attrs))
  end

  def build_pitcher(**attrs)
    defaults = {
      simulation_league: league, simulation_playoff_series: series,
      round: "ws", player_id: 700_002, player_name: "Test Pitcher",
      player_type: "pitcher", team_id: 147,
      g: 0, ab: 0, h: 0, hr: 0, rbi: 0, bb: 0, k: 0, r: 0,
      doubles: 0, triples: 0, hbp: 0, sf: 0,
      g_pitched: 2, gs: 1, outs_pitched: 18, h_allowed: 5, er: 2,
      bb_allowed: 3, k_pitched: 14, bf: 24, hr_allowed: 1, w: 1, l: 0, sv: 0,
    }
    described_class.new(defaults.merge(attrs))
  end

  describe "batter computed stats" do
    subject(:stat) { build_batter }

    it "computes pa correctly" do
      expect(stat.pa).to eq(stat.ab + stat.bb + stat.hbp + stat.sf)
    end

    it "computes avg" do
      expect(stat.avg).to eq((6.0 / 18).round(3))
    end

    it "computes obp" do
      denom = stat.pa
      expect(stat.obp).to eq(((6 + 3 + 0).to_f / denom).round(3))
    end

    it "computes slg including extra bases" do
      # singles = 6 - 2 - 1 - 0 = 3; tb = 3 + 2 + 0 + 8 = 13
      expect(stat.slg).to eq((13.0 / 18).round(3))
    end

    it "computes ops as obp + slg" do
      expect(stat.ops).to eq((stat.obp + stat.slg).round(3))
    end

    it "returns 0.0 avg when ab is zero" do
      expect(build_batter(ab: 0, h: 0).avg).to eq(0.0)
    end

    it "returns 0.0 obp when pa is zero" do
      expect(build_batter(ab: 0, bb: 0, hbp: 0, sf: 0, h: 0).obp).to eq(0.0)
    end
  end

  describe "pitcher computed stats" do
    subject(:stat) { build_pitcher }

    it "displays ip correctly" do
      # 18 outs = 6.0 IP
      expect(stat.ip_display).to eq("6.0")
    end

    it "computes era" do
      # 2 ER * 27 / 18 outs = 3.0
      expect(stat.era).to eq(3.0)
    end

    it "computes whip" do
      # (3 bb + 5 h) / (18/3 innings) = 8/6 = 1.33
      expect(stat.whip).to eq(((3 + 5) / (18 / 3.0)).round(2))
    end

    it "computes k9" do
      expect(stat.k9).to eq((14 * 27.0 / 18).round(2))
    end

    it "returns 0.0 era when outs_pitched is zero" do
      expect(build_pitcher(outs_pitched: 0, er: 0).era).to eq(0.0)
    end
  end

  describe "tb with edge cases" do
    it "does not go negative when hits are all HR" do
      stat = build_batter(h: 3, hr: 3, doubles: 0, triples: 0)
      expect(stat.tb).to be >= 0
    end
  end
end
