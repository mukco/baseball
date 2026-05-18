require 'rails_helper'

RSpec.describe BullpenManager do
  let(:game_date) { Date.new(2025, 5, 1) }

  def make_roster(pitcher_state, bullpen_roles_json: '{}')
    double(
      'SimulationRoster',
      pitcher_state_json:  pitcher_state.to_json,
      pitcher_state:       pitcher_state,
      has_pitcher_state?:  true,
      bullpen_roles_json:  bullpen_roles_json,
      rotation_state_json: '{}',
      rotation:            []
    )
  end

  def base_state(overrides = {})
    {
      "rotation_slot" => 0,
      "pitchers" => {
        "1" => { "role" => "sp", "slot" => 0, "last_pitched" => nil, "consecutive_days" => 0, "season_g" => 0, "season_outs" => 0 },
        "2" => { "role" => "sp", "slot" => 1, "last_pitched" => nil, "consecutive_days" => 0, "season_g" => 0, "season_outs" => 0 },
        "3" => { "role" => "sp", "slot" => 2, "last_pitched" => nil, "consecutive_days" => 0, "season_g" => 0, "season_outs" => 0 },
        "4" => { "role" => "sp", "slot" => 3, "last_pitched" => nil, "consecutive_days" => 0, "season_g" => 0, "season_outs" => 0 },
        "5" => { "role" => "sp", "slot" => 4, "last_pitched" => nil, "consecutive_days" => 0, "season_g" => 0, "season_outs" => 0 },
        "10" => { "role" => "cl", "last_pitched" => nil, "consecutive_days" => 0, "season_g" => 0, "season_outs" => 0 },
        "11" => { "role" => "su", "last_pitched" => nil, "consecutive_days" => 0, "season_g" => 0, "season_outs" => 0 },
        "12" => { "role" => "mr", "last_pitched" => nil, "consecutive_days" => 0, "season_g" => 0, "season_outs" => 0 },
        "13" => { "role" => "lr", "last_pitched" => nil, "consecutive_days" => 0, "season_g" => 0, "season_outs" => 0 },
      }.merge(overrides)
    }
  end

  describe '#game_pitcher_list' do
    it 'returns SP first, then bullpen in role priority order' do
      roster = make_roster(base_state)
      mgr    = described_class.new(roster, game_date)
      list   = mgr.game_pitcher_list

      expect(list.first).to eq(1)      # slot 0 SP
      expect(list).to include(10, 11, 12, 13)
      expect(list.index(10)).to be < list.index(11)  # CL before SU
      expect(list.index(11)).to be < list.index(12)  # SU before MR
    end

    it 'skips injured players' do
      roster = make_roster(base_state)
      mgr    = described_class.new(roster, game_date)
      list   = mgr.game_pitcher_list(skip_ids: Set.new([10]))

      expect(list).not_to include(10)
      expect(list).to include(11)
    end

    it 'advances to next rotation slot when current SP is skipped' do
      roster = make_roster(base_state)
      mgr    = described_class.new(roster, game_date)
      list   = mgr.game_pitcher_list(skip_ids: Set.new([1]))

      expect(list.first).to eq(2)  # slot 1 when slot 0 is injured
    end
  end

  describe 'SP rest enforcement' do
    it 'skips SP who pitched within 5 days' do
      state = base_state("1" => {
        "role" => "sp", "slot" => 0,
        "last_pitched" => (game_date - 3).to_s,
        "consecutive_days" => 0, "season_g" => 1, "season_outs" => 15,
      })
      roster = make_roster(state)
      mgr    = described_class.new(roster, game_date)
      list   = mgr.game_pitcher_list

      expect(list.first).to eq(2)  # slot 1, not slot 0 (too recent)
    end

    it 'uses SP who pitched exactly 5 days ago' do
      state = base_state("1" => {
        "role" => "sp", "slot" => 0,
        "last_pitched" => (game_date - 5).to_s,
        "consecutive_days" => 0, "season_g" => 1, "season_outs" => 15,
      })
      roster = make_roster(state)
      mgr    = described_class.new(roster, game_date)

      expect(mgr.game_pitcher_list.first).to eq(1)
    end
  end

  describe 'reliever consecutive-day cap' do
    it 'excludes closer who has pitched 2 consecutive days' do
      state = base_state("10" => {
        "role" => "cl",
        "last_pitched" => (game_date - 1).to_s,
        "consecutive_days" => 2,
        "season_g" => 5, "season_outs" => 15,
      })
      roster = make_roster(state)
      mgr    = described_class.new(roster, game_date)
      list   = mgr.game_pitcher_list

      expect(list).not_to include(10)
    end

    it 'allows closer who has pitched 1 consecutive day' do
      state = base_state("10" => {
        "role" => "cl",
        "last_pitched" => (game_date - 1).to_s,
        "consecutive_days" => 1,
        "season_g" => 5, "season_outs" => 15,
      })
      roster = make_roster(state)
      mgr    = described_class.new(roster, game_date)

      expect(mgr.game_pitcher_list).to include(10)
    end
  end

  describe 'season workload cap' do
    it 'excludes closer who has hit the season out limit' do
      state = base_state("10" => {
        "role" => "cl",
        "last_pitched" => nil,
        "consecutive_days" => 0,
        "season_g" => 70, "season_outs" => 210,
      })
      roster = make_roster(state)
      mgr    = described_class.new(roster, game_date)

      expect(mgr.game_pitcher_list).not_to include(10)
    end
  end

  describe '#record_game' do
    it 'advances rotation_slot mod 5' do
      roster = make_roster(base_state.merge("rotation_slot" => 4))
      mgr    = described_class.new(roster, game_date)
      mgr.record_game(5, relievers: [])

      expect(mgr.instance_variable_get(:@state)["rotation_slot"]).to eq(0)
    end

    it 'increments season_g and season_outs for SP' do
      roster = make_roster(base_state)
      mgr    = described_class.new(roster, game_date)
      mgr.record_game(1, relievers: [{ id: 10, outs: 3 }])

      state = mgr.instance_variable_get(:@state)
      expect(state.dig("pitchers", "1", "season_g")).to eq(1)
      expect(state.dig("pitchers", "10", "season_g")).to eq(1)
      expect(state.dig("pitchers", "10", "season_outs")).to eq(3)
    end

    it 'tracks consecutive days correctly' do
      state  = base_state("10" => {
        "role" => "cl", "last_pitched" => (game_date - 1).to_s,
        "consecutive_days" => 1, "season_g" => 3, "season_outs" => 9,
      })
      roster = make_roster(state)
      mgr    = described_class.new(roster, game_date)
      mgr.record_game(1, relievers: [{ id: 10, outs: 3 }])

      st = mgr.instance_variable_get(:@state)
      expect(st.dig("pitchers", "10", "consecutive_days")).to eq(2)
    end

    it 'resets consecutive days when pitcher had a rest day' do
      state  = base_state("10" => {
        "role" => "cl", "last_pitched" => (game_date - 3).to_s,
        "consecutive_days" => 2, "season_g" => 3, "season_outs" => 9,
      })
      roster = make_roster(state)
      mgr    = described_class.new(roster, game_date)
      mgr.record_game(1, relievers: [{ id: 10, outs: 3 }])

      st = mgr.instance_variable_get(:@state)
      expect(st.dig("pitchers", "10", "consecutive_days")).to eq(0)
    end
  end

  describe '#flush!' do
    it 'writes state to the database and clears dirty flag' do
      roster = make_roster(base_state)
      allow(roster).to receive(:update_columns)

      mgr = described_class.new(roster, game_date)
      mgr.record_game(1, relievers: [])
      mgr.flush!

      expect(roster).to have_received(:update_columns).with(pitcher_state_json: anything)

      mgr.flush!  # second flush — not dirty, should not write again
      expect(roster).to have_received(:update_columns).once
    end
  end

  describe '.build_initial_state' do
    let(:pitchers_with_ip) do
      [
        { id: 100, projected_ip: 180.0 },
        { id: 101, projected_ip: 170.0 },
        { id: 102, projected_ip: 160.0 },
        { id: 103, projected_ip: 150.0 },
        { id: 104, projected_ip: 140.0 },
        { id: 105, projected_ip: 55.0  },
        { id: 106, projected_ip: 50.0  },
      ]
    end

    it 'assigns sp role and slots 0-4 to top 5 pitchers by IP' do
      state = described_class.build_initial_state(pitchers_with_ip)
      sps   = state["pitchers"].select { |_, p| p["role"] == "sp" }

      expect(sps.keys.map(&:to_i)).to match_array([100, 101, 102, 103, 104])
      expect(sps["100"]["slot"]).to eq(0)
      expect(sps["104"]["slot"]).to eq(4)
    end

    it 'defaults non-SPs to mr when no bullpen_roles given' do
      state = described_class.build_initial_state(pitchers_with_ip)
      expect(state.dig("pitchers", "105", "role")).to eq("mr")
    end

    it 'assigns cl/su/lr from bullpen_roles' do
      roles = { closer_id: 105, setup_ids: [106], long_ids: [] }
      state = described_class.build_initial_state(pitchers_with_ip, roles)

      expect(state.dig("pitchers", "105", "role")).to eq("cl")
      expect(state.dig("pitchers", "106", "role")).to eq("su")
    end

    it 'sets rotation_slot to 0' do
      state = described_class.build_initial_state(pitchers_with_ip)
      expect(state["rotation_slot"]).to eq(0)
    end
  end

  describe '.sync_roles' do
    it 'updates non-SP roles without touching rest/workload state' do
      current = base_state("10" => {
        "role" => "mr", "last_pitched" => "2025-04-30",
        "consecutive_days" => 1, "season_g" => 5, "season_outs" => 15,
      })
      roles   = { closer_id: 10, setup_ids: [11], long_ids: [13] }
      synced  = described_class.sync_roles(current, roles)

      expect(synced.dig("pitchers", "10", "role")).to eq("cl")
      expect(synced.dig("pitchers", "10", "last_pitched")).to eq("2025-04-30")
      expect(synced.dig("pitchers", "10", "season_g")).to eq(5)
      expect(synced.dig("pitchers", "11", "role")).to eq("su")
      expect(synced.dig("pitchers", "13", "role")).to eq("lr")
      expect(synced.dig("pitchers", "12", "role")).to eq("mr")
    end

    it 'does not change SP roles' do
      current = base_state
      synced  = described_class.sync_roles(current, { closer_id: 1 })

      expect(synced.dig("pitchers", "1", "role")).to eq("sp")
    end
  end
end
