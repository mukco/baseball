require "rails_helper"

RSpec.describe SimulationPlayerStat, type: :model do
  describe "associations" do
    it "belongs to a simulation_league" do
      league = create(:simulation_league)
      stat   = create(:simulation_player_stat, simulation_league: league)
      expect(stat.simulation_league).to eq(league)
    end
  end

  # -----------------------------------------------------------------------
  # #ip_display
  # -----------------------------------------------------------------------
  describe "#ip_display" do
    it "formats outs_pitched as innings.outs" do
      stat = build(:simulation_player_stat, :pitcher, outs_pitched: 22)
      expect(stat.ip_display).to eq("7.1")
    end

    it "returns '0.0' when no outs recorded" do
      stat = build(:simulation_player_stat, :pitcher, outs_pitched: 0)
      expect(stat.ip_display).to eq("0.0")
    end

    it "handles exact inning multiples" do
      stat = build(:simulation_player_stat, :pitcher, outs_pitched: 27)
      expect(stat.ip_display).to eq("9.0")
    end
  end

  # -----------------------------------------------------------------------
  # #pa / #tb
  # -----------------------------------------------------------------------
  describe "#pa" do
    it "sums ab + bb + hbp + sf" do
      stat = build(:simulation_player_stat, ab: 100, bb: 10, hbp: 3, sf: 2)
      expect(stat.pa).to eq(115)
    end

    it "treats nil hbp/sf as zero" do
      stat = build(:simulation_player_stat, ab: 50, bb: 5, hbp: nil, sf: nil)
      expect(stat.pa).to eq(55)
    end
  end

  describe "#tb" do
    it "counts singles×1 + doubles×2 + triples×3 + hr×4" do
      stat = build(:simulation_player_stat, h: 10, hr: 2, doubles: 1, triples: 0)
      # singles = 10 - 2 - 1 - 0 = 7 → tb = 7 + 2 + 0 + 8 = 17
      expect(stat.tb).to eq(17)
    end

    it "clamps negative singles to zero" do
      stat = build(:simulation_player_stat, h: 2, hr: 3, doubles: 0, triples: 0)
      expect(stat.tb).to eq(12)   # singles=0 (clamped), 4*3=12
    end
  end

  # -----------------------------------------------------------------------
  # #obp / #slg / #ops / #iso / #woba
  # -----------------------------------------------------------------------
  describe "#obp" do
    it "returns (h + bb + hbp) / pa" do
      # ab=100, bb=10, hbp=2, sf=3 → pa=115; h=30 → obp=42/115≈0.365
      stat = build(:simulation_player_stat, ab: 100, h: 30, bb: 10, hbp: 2, sf: 3)
      expect(stat.obp).to be_within(0.001).of(42.0 / 115)
    end

    it "returns 0.0 when pa is zero" do
      stat = build(:simulation_player_stat, ab: 0, bb: 0, hbp: 0, sf: 0, h: 0)
      expect(stat.obp).to eq(0.0)
    end
  end

  describe "#slg" do
    it "returns total_bases / ab" do
      # h=10, hr=1, doubles=2, triples=0 → singles=7, tb=7+4+0+4=15; slg=15/40=0.375
      stat = build(:simulation_player_stat, ab: 40, h: 10, hr: 1, doubles: 2, triples: 0)
      expect(stat.slg).to be_within(0.001).of(15.0 / 40)
    end

    it "returns 0.0 when ab is zero" do
      stat = build(:simulation_player_stat, ab: 0)
      expect(stat.slg).to eq(0.0)
    end
  end

  describe "#iso" do
    it "returns slg - avg" do
      stat = build(:simulation_player_stat, ab: 100, h: 25, hr: 5, doubles: 5, triples: 1, bb: 0, hbp: 0, sf: 0)
      expect(stat.iso).to be_within(0.001).of(stat.slg - stat.avg)
    end
  end

  describe "#woba" do
    it "weights each event by linear weights" do
      stat = build(:simulation_player_stat,
                   ab: 100, h: 20, hr: 5, doubles: 5, triples: 0,
                   bb: 10, hbp: 2, sf: 1)
      # singles = 20 - 5 - 5 - 0 = 10
      # numerator = 0.690*10 + 0.722*2 + 0.881*10 + 1.243*5 + 1.569*0 + 2.082*5
      expected_num = 0.690*10 + 0.722*2 + 0.881*10 + 1.243*5 + 2.082*5
      pa = 100 + 10 + 2 + 1
      expect(stat.woba).to be_within(0.001).of(expected_num / pa)
    end

    it "returns 0.0 when pa is zero" do
      stat = build(:simulation_player_stat, ab: 0, bb: 0, hbp: 0, sf: 0, h: 0)
      expect(stat.woba).to eq(0.0)
    end
  end

  # -----------------------------------------------------------------------
  # #avg
  # -----------------------------------------------------------------------
  describe "#avg" do
    it "returns h / ab rounded to 3 decimals" do
      stat = build(:simulation_player_stat, h: 30, ab: 100)
      expect(stat.avg).to eq(0.300)
    end

    it "returns 0.0 when ab is zero" do
      stat = build(:simulation_player_stat, ab: 0, h: 0)
      expect(stat.avg).to eq(0.0)
    end

    it "rounds correctly for repeating decimals" do
      stat = build(:simulation_player_stat, h: 1, ab: 3)
      expect(stat.avg).to eq(0.333)
    end
  end

  # -----------------------------------------------------------------------
  # #ops
  # -----------------------------------------------------------------------
  describe "#ops" do
    it "returns obp + slg rounded to 3 decimals" do
      # Explicit: h=30, hr=2, 2B=5, 3B=0, ab=100, bb=10, hbp=0, sf=0
      # pa=110, singles=23, tb=41; obp=40/110, slg=41/100
      stat = build(:simulation_player_stat, h: 30, hr: 2, doubles: 5, triples: 0,
                                            ab: 100, bb: 10, hbp: 0, sf: 0)
      expect(stat.ops).to be_within(0.001).of(40.0 / 110 + 41.0 / 100)
    end

    it "returns 0.0 when ab, bb, hbp, and sf are all zero" do
      stat = build(:simulation_player_stat, h: 0, bb: 0, ab: 0, hbp: 0, sf: 0)
      expect(stat.ops).to eq(0.0)
    end

    it "produces a higher OPS for a high-contact, high-walk hitter" do
      good = build(:simulation_player_stat, h: 50, bb: 20, ab: 120)
      bad  = build(:simulation_player_stat, h: 10, bb: 5,  ab: 120)
      expect(good.ops).to be > bad.ops
    end
  end

  # -----------------------------------------------------------------------
  # #era
  # -----------------------------------------------------------------------
  describe "#era" do
    it "returns (er * 27) / outs_pitched rounded to 2 decimals" do
      stat = build(:simulation_player_stat, :pitcher, er: 10, outs_pitched: 27)
      expect(stat.era).to eq(10.00)
    end

    it "returns 0.0 when outs_pitched is zero" do
      stat = build(:simulation_player_stat, :pitcher, outs_pitched: 0)
      expect(stat.era).to eq(0.0)
    end

    it "computes correctly for fractional innings" do
      # 4 ER over 48 outs (16.0 IP): 4 * 27 / 48 = 2.25
      stat = build(:simulation_player_stat, :pitcher, er: 4, outs_pitched: 48)
      expect(stat.era).to eq(2.25)
    end
  end

  # -----------------------------------------------------------------------
  # #whip
  # -----------------------------------------------------------------------
  describe "#whip" do
    it "returns (bb_allowed + h_allowed) / ip rounded to 2 decimals" do
      # 9 BB + 9 H over 27 outs (9 IP): 18 / 9 = 2.00
      stat = build(:simulation_player_stat, :pitcher,
                   bb_allowed: 9, h_allowed: 9, outs_pitched: 27)
      expect(stat.whip).to eq(2.00)
    end

    it "returns 0.0 when outs_pitched is zero" do
      stat = build(:simulation_player_stat, :pitcher, outs_pitched: 0)
      expect(stat.whip).to eq(0.0)
    end

    it "returns a sub-1.00 WHIP for a dominant pitcher" do
      stat = build(:simulation_player_stat, :pitcher,
                   bb_allowed: 1, h_allowed: 2, outs_pitched: 27)
      expect(stat.whip).to be < 1.0
    end
  end

  # -----------------------------------------------------------------------
  # #k9 / #bb9 / #hr9 / #k_bb
  # -----------------------------------------------------------------------
  describe "#k9" do
    it "returns strikeouts per 9 innings" do
      stat = build(:simulation_player_stat, :pitcher, k_pitched: 9, outs_pitched: 27)
      expect(stat.k9).to eq(9.00)
    end

    it "returns 0.0 when outs_pitched is zero" do
      stat = build(:simulation_player_stat, :pitcher, outs_pitched: 0)
      expect(stat.k9).to eq(0.0)
    end
  end

  describe "#bb9" do
    it "returns walks per 9 innings" do
      # 3 BB over 27 outs → 3.0
      stat = build(:simulation_player_stat, :pitcher, bb_allowed: 3, outs_pitched: 27)
      expect(stat.bb9).to eq(3.00)
    end
  end

  describe "#hr9" do
    it "returns HR per 9 innings" do
      stat = build(:simulation_player_stat, :pitcher, hr_allowed: 1, outs_pitched: 27)
      expect(stat.hr9).to eq(1.00)
    end

    it "returns 0.0 when hr_allowed is nil" do
      stat = build(:simulation_player_stat, :pitcher, hr_allowed: nil, outs_pitched: 27)
      expect(stat.hr9).to eq(0.0)
    end
  end

  describe "#k_bb" do
    it "returns k / bb ratio" do
      stat = build(:simulation_player_stat, :pitcher, k_pitched: 60, bb_allowed: 20)
      expect(stat.k_bb).to eq(3.00)
    end

    it "returns 0.0 when bb_allowed is zero" do
      stat = build(:simulation_player_stat, :pitcher, bb_allowed: 0)
      expect(stat.k_bb).to eq(0.0)
    end
  end
end
