require "rails_helper"

RSpec.describe AwardService do
  let(:league) { create(:simulation_league) }

  # AL team (Yankees = 147), NL team (Cubs = 112)
  def make_batter(league:, team_id:, ab: 420, h: 126, hr: 30, rbi: 90, bb: 50, **attrs)
    create(:simulation_player_stat, simulation_league: league, team_id: team_id,
           player_type: "batter", ab: ab, h: h, hr: hr, rbi: rbi, bb: bb, **attrs)
  end

  def make_starter(league:, team_id:, gs: 28, g_pitched: 28, outs_pitched: 540, h_allowed: 120,
                   er: 36, bb_allowed: 40, k_pitched: 180, w: 14, l: 8)
    create(:simulation_player_stat, simulation_league: league, team_id: team_id,
           player_type: "pitcher", gs: gs, g_pitched: g_pitched,
           outs_pitched: outs_pitched, h_allowed: h_allowed, er: er,
           bb_allowed: bb_allowed, k_pitched: k_pitched, w: w, l: l, sv: 0)
  end

  def make_reliever(league:, team_id:, g_pitched: 60, outs_pitched: 60, er: 5,
                    h_allowed: 30, bb_allowed: 10, k_pitched: 70, sv: 30)
    create(:simulation_player_stat, simulation_league: league, team_id: team_id,
           player_type: "pitcher", gs: 0, g_pitched: g_pitched,
           outs_pitched: outs_pitched, er: er, h_allowed: h_allowed,
           bb_allowed: bb_allowed, k_pitched: k_pitched, w: 3, l: 2, sv: sv)
  end

  describe ".awards_data" do
    context "when no insight exists" do
      it "returns nil" do
        expect(described_class.awards_data(league)).to be_nil
      end
    end

    context "when an awards insight exists" do
      let(:award_payload) { { "mvp" => { "al" => { "winner" => { "player_name" => "Babe Ruth" } } } } }

      before do
        create(:simulation_insight,
               simulation_league: league,
               subject_type: "awards",
               subject_id:   league.id,
               bullets_json: award_payload.to_json)
      end

      it "returns the parsed JSON" do
        result = described_class.awards_data(league)
        expect(result).to eq(award_payload)
      end
    end
  end

  describe ".generate_awards" do
    let(:ai_response) do
      {
        "mvp"           => { "al" => { "winner" => nil, "finalists" => [], "rationale" => "AL MVP." }, "nl" => nil },
        "cy_young"      => { "al" => nil, "nl" => nil },
        "batting_title" => { "al" => nil, "nl" => nil },
        "hr_leader"     => { "al" => nil, "nl" => nil },
        "rbi_leader"    => { "al" => nil, "nl" => nil },
        "era_title"     => { "al" => nil, "nl" => nil },
        "k_leader"      => { "overall" => nil },
        "saves_leader"  => { "overall" => nil },
        "reliever"      => { "overall" => nil }
      }
    end

    before do
      allow_any_instance_of(OpenAi::Client).to receive(:json_completion).and_return(ai_response)
      allow(SimulationSeasonContext).to receive(:for_league).and_return(
        { phase: :midseason, games_played: 81, total_games: 162, pct_complete: 0.5, phase_label: "midseason", milestone_notes: [] }
      )
    end

    context "with eligible players" do
      before do
        make_batter(league: league, team_id: 147)  # AL
        make_batter(league: league, team_id: 112)  # NL
        make_starter(league: league, team_id: 147)
        make_reliever(league: league, team_id: 147)
      end

      it "calls OpenAI and persists result as SimulationInsight" do
        expect {
          described_class.generate_awards(league)
        }.to change(SimulationInsight, :count).by(1)

        insight = SimulationInsight.find_by(simulation_league: league, subject_type: "awards")
        expect(insight).to be_present
        expect(JSON.parse(insight.bullets_json)).to eq(ai_response)
      end

      it "returns the AI response" do
        result = described_class.generate_awards(league)
        expect(result).to eq(ai_response)
      end

      it "upserts on re-generation" do
        described_class.generate_awards(league)
        expect {
          described_class.generate_awards(league)
        }.not_to change(SimulationInsight, :count)
      end
    end
  end

  describe "AL/NL split logic" do
    it "puts AL team players in :al bucket" do
      make_batter(league: league, team_id: 147) # Yankees — AL
      stats = SimulationPlayerStat.where(simulation_league_id: league.id)
      batters = stats.where(player_type: "batter").select { |s| s.ab >= 400 }.map { |s|
        { team_id: s.team_id }
      }
      al = batters.select { |p| described_class::AL_TEAM_IDS.include?(p[:team_id]) }
      nl = batters.reject { |p| described_class::AL_TEAM_IDS.include?(p[:team_id]) }
      expect(al.size).to eq(1)
      expect(nl.size).to eq(0)
    end

    it "puts NL team players in :nl bucket" do
      make_batter(league: league, team_id: 112) # Cubs — NL
      stats = SimulationPlayerStat.where(simulation_league_id: league.id)
      batters = stats.where(player_type: "batter").select { |s| s.ab >= 400 }.map { |s|
        { team_id: s.team_id }
      }
      nl = batters.reject { |p| described_class::AL_TEAM_IDS.include?(p[:team_id]) }
      expect(nl.size).to eq(1)
    end
  end

  describe "eligibility thresholds" do
    let(:midseason_ctx) do
      { phase: :midseason, games_played: 81, total_games: 162, pct_complete: 0.5, phase_label: "midseason", milestone_notes: [] }
    end

    it "excludes batters with insufficient AB relative to season length" do
      # max_g = 0 → 1, so min_ab = max(2, 25) = 25; player with 10 AB excluded
      create(:simulation_player_stat, simulation_league: league, player_type: "batter",
             team_id: 147, g: 3, ab: 10, h: 3, hr: 1, rbi: 2, bb: 1)
      ai_resp = { "mvp" => { "al" => nil, "nl" => nil }, "cy_young" => { "al" => nil, "nl" => nil },
                  "batting_title" => { "al" => nil, "nl" => nil }, "hr_leader" => { "al" => nil, "nl" => nil },
                  "rbi_leader" => { "al" => nil, "nl" => nil }, "era_title" => { "al" => nil, "nl" => nil },
                  "k_leader" => { "overall" => nil }, "saves_leader" => { "overall" => nil },
                  "reliever" => { "overall" => nil } }
      client_dbl = instance_double(OpenAi::Client)
      allow(OpenAi::Client).to receive(:new).and_return(client_dbl)
      allow(client_dbl).to receive(:json_completion).and_return(ai_resp)
      allow(SimulationSeasonContext).to receive(:for_league).and_return(midseason_ctx)

      expect(client_dbl).to receive(:json_completion) do |args|
        payload = JSON.parse(args[:user_payload])
        mvp_al = payload["mvp"]["al"]
        expect(mvp_al).to be_empty
        ai_resp
      end

      described_class.generate_awards(league)
    end

    it "excludes pitchers with insufficient outs_pitched relative to season length" do
      # max_g = 0 → 1, so min_outs = max(1, 10) = 10; player with 6 outs (~2 IP) excluded
      create(:simulation_player_stat, simulation_league: league, player_type: "pitcher",
             team_id: 147, gs: 1, g_pitched: 1, outs_pitched: 6, er: 1,
             h_allowed: 3, bb_allowed: 1, k_pitched: 4, w: 0, l: 1, sv: 0)
      ai_resp = { "mvp" => { "al" => nil, "nl" => nil }, "cy_young" => { "al" => nil, "nl" => nil },
                  "batting_title" => { "al" => nil, "nl" => nil }, "hr_leader" => { "al" => nil, "nl" => nil },
                  "rbi_leader" => { "al" => nil, "nl" => nil }, "era_title" => { "al" => nil, "nl" => nil },
                  "k_leader" => { "overall" => nil }, "saves_leader" => { "overall" => nil },
                  "reliever" => { "overall" => nil } }
      client_dbl = instance_double(OpenAi::Client)
      allow(OpenAi::Client).to receive(:new).and_return(client_dbl)
      allow(client_dbl).to receive(:json_completion).and_return(ai_resp)
      allow(SimulationSeasonContext).to receive(:for_league).and_return(midseason_ctx)

      expect(client_dbl).to receive(:json_completion) do |args|
        payload = JSON.parse(args[:user_payload])
        cy_al = payload["cy_young"]["al"]
        expect(cy_al).to be_empty
        ai_resp
      end

      described_class.generate_awards(league)
    end
  end
end
