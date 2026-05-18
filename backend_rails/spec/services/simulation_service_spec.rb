require "rails_helper"

RSpec.describe SimulationService do
  # -----------------------------------------------------------------------
  # Shared stubs — keeps each example focused on what it's testing
  # -----------------------------------------------------------------------
  let(:fake_teams) do
    [
      { id: 147, name: "New York Yankees", abbreviation: "NYY", color: "#003087" },
      { id: 111, name: "Baltimore Orioles", abbreviation: "BAL", color: "#DF4601" },
    ]
  end

  let(:fake_roster) do
    [
      { id: 1, name: "Batter A", position: "OF" },
      { id: 2, name: "Batter B", position: "1B" },
      { id: 3, name: "Batter C", position: "2B" },
      { id: 4, name: "Batter D", position: "3B" },
      { id: 5, name: "Batter E", position: "SS" },
      { id: 6, name: "Batter F", position: "C" },
      { id: 7, name: "Batter G", position: "DH" },
      { id: 8, name: "Batter H", position: "OF" },
      { id: 9, name: "Batter I", position: "OF" },
      { id: 10, name: "Pitcher A", position: "SP" },
      { id: 11, name: "Pitcher B", position: "RP" },
    ]
  end

  let(:fake_schedule) do
    [{ game_pk: 800001, game_date: Date.today.to_s,
       home_team_id: 147, away_team_id: 111,
       home_team_abbr: "NYY", away_team_abbr: "BAL",
       home_team_name: "New York Yankees", away_team_name: "Baltimore Orioles" }]
  end

  def stub_mlb_api
    mlb = instance_double(MlbApiService)
    allow(MlbApiService).to receive(:new).and_return(mlb)
    allow(mlb).to receive(:all_teams).and_return(fake_teams)
    allow(mlb).to receive(:send).with(:team_roster, anything).and_return(fake_roster)
    allow(mlb).to receive(:season_schedule).and_return(fake_schedule)
    mlb
  end

  def stub_projections(rates = {})
    # Legacy: still stub project_player for any direct calls
    allow(ProjectionService).to receive(:project_player).and_return(component_stats: rates)
    # Stub the batch flow used by prefetch_into_cache
    allow(ProjectionService).to receive(:create_run).and_return(
      projections: [{ player_id: 1, component_stats: rates, projected_stats: rates }]
    )
    allow(ProjectionScenario).to receive(:ensure_default!)
    allow(ProjectionScenario).to receive(:default_scenario).and_return(
      instance_double(ProjectionScenario, id: 1)
    )
    allow(ProjectionDataService).to receive(:player_name).and_return("Test Player")
  end

  # -----------------------------------------------------------------------
  # setup_league
  # -----------------------------------------------------------------------
  describe ".setup_league" do
    before { stub_mlb_api }

    it "creates a SimulationLeague with the given attributes" do
      expect {
        described_class.setup_league(name: "My League", season: 2025)
      }.to change(SimulationLeague, :count).by(1)

      league = SimulationLeague.last
      expect(league.name).to eq("My League")
      expect(league.season).to eq(2025)
      expect(league.status).to eq("active")
    end

    it "stores the scenario_id when provided" do
      scenario = create(:projection_scenario)
      described_class.setup_league(name: "Scenario League", season: 2025, scenario_id: scenario.id)
      expect(SimulationLeague.last.scenario_id).to eq(scenario.id)
    end

    it "stores the batter_pitcher_blend" do
      described_class.setup_league(name: "Blend League", season: 2025, batter_pitcher_blend: 0.60)
      expect(SimulationLeague.last.batter_pitcher_blend).to be_within(0.001).of(0.60)
    end

    it "imports rosters (one per team returned)" do
      described_class.setup_league(name: "L", season: 2025)
      expect(SimulationRoster.count).to eq(fake_teams.size)
    end

    it "imports schedule games" do
      described_class.setup_league(name: "L", season: 2025)
      expect(SimulationGame.count).to eq(fake_schedule.size)
    end

    it "still creates the league when the MLB API fails (graceful degradation)" do
      allow(MlbApiService).to receive(:new).and_raise("API down")
      expect {
        described_class.setup_league(name: "L", season: 2025)
      }.to change(SimulationLeague, :count).by(1)
    end
  end

  # -----------------------------------------------------------------------
  # simulate_game
  # -----------------------------------------------------------------------
  describe ".simulate_game" do
    let(:league)  { create(:simulation_league) }
    let(:game)    { create(:simulation_game, simulation_league: league) }
    let!(:home_r) { create(:simulation_roster, simulation_league: league, team_id: game.home_team_id) }
    let!(:away_r) { create(:simulation_roster, simulation_league: league, team_id: game.away_team_id) }

    before { stub_projections }

    it "saves home_score and away_score on the game record" do
      described_class.simulate_game(league, game)
      game.reload
      expect(game.home_score).not_to be_nil
      expect(game.away_score).not_to be_nil
    end

    it "marks the game as simulated (simulated_at is set)" do
      described_class.simulate_game(league, game)
      game.reload
      expect(game.simulated_at).not_to be_nil
    end

    it "stores a box_score_json with home and away keys" do
      described_class.simulate_game(league, game)
      game.reload
      bs = game.box_score
      expect(bs).to have_key(:home)
      expect(bs).to have_key(:away)
      expect(bs).to have_key(:linescore)
    end

    it "returns a result hash with :game and :box_score keys" do
      result = described_class.simulate_game(league, game)
      expect(result).to have_key(:game)
      expect(result).to have_key(:box_score)
    end

    it "returns an error hash when rosters are missing" do
      game2 = create(:simulation_game, simulation_league: league,
                     home_team_id: 999, away_team_id: 998)
      result = described_class.simulate_game(league, game2)
      expect(result[:error]).to be_present
    end

    it "uses the league's scenario_id when fetching projections" do
      scenario = create(:projection_scenario)
      league.update!(scenario_id: scenario.id)
      expect(ProjectionService).to receive(:create_run).with(
        hash_including(scenario_id: scenario.id)
      ).at_least(:once).and_return(projections: [])

      described_class.simulate_game(league, game)
    end
  end

  # -----------------------------------------------------------------------
  # simulate_day
  # -----------------------------------------------------------------------
  describe ".simulate_day" do
    let(:league) { create(:simulation_league, current_sim_date: Date.today) }

    before do
      stub_projections
      home_r = create(:simulation_roster, simulation_league: league, team_id: 147)
      away_r = create(:simulation_roster, simulation_league: league, team_id: 111)
      2.times do |i|
        create(:simulation_game, simulation_league: league,
               game_date: Date.today, home_team_id: 147, away_team_id: 111)
      end
    end

    it "simulates all upcoming games on that date" do
      result = described_class.simulate_day(league, Date.today)
      expect(result[:simulated]).to eq(2)
    end

    it "updates the league's current_sim_date" do
      described_class.simulate_day(league, Date.today)
      expect(league.reload.current_sim_date).to eq(Date.today)
    end

    it "does not re-simulate already-completed games" do
      create(:simulation_game, :completed, simulation_league: league,
             game_date: Date.today, home_team_id: 147, away_team_id: 111)
      result = described_class.simulate_day(league, Date.today)
      expect(result[:simulated]).to eq(2)
    end
  end

  # -----------------------------------------------------------------------
  # fetch_rates (private)
  # -----------------------------------------------------------------------
  describe ".fetch_rates (private)" do
    let(:league) { create(:simulation_league) }

    it "returns component_stats as symbol-keyed hash on success" do
      allow(ProjectionService).to receive(:project_player).and_return(
        component_stats: { "bb_pct" => 0.09, "k_pct" => 0.22 }
      )
      rates = described_class.send(:fetch_rates, 123, league)
      expect(rates[:bb_pct]).to be_within(0.001).of(0.09)
      expect(rates[:k_pct]).to be_within(0.001).of(0.22)
    end

    it "returns an empty hash when ProjectionService returns an error" do
      allow(ProjectionService).to receive(:project_player).and_return(error: "not found")
      rates = described_class.send(:fetch_rates, 999, league)
      expect(rates).to eq({})
    end

    it "returns an empty hash when ProjectionService raises" do
      allow(ProjectionService).to receive(:project_player).and_raise("boom")
      rates = described_class.send(:fetch_rates, 999, league)
      expect(rates).to eq({})
    end
  end

  # -----------------------------------------------------------------------
  # compute_standings (private)
  # -----------------------------------------------------------------------
  describe ".compute_standings (private)" do
    let(:league) { create(:simulation_league) }

    before do
      # NYY (147) wins 3, BAL (111) wins 1
      create(:simulation_game, :completed, simulation_league: league,
             home_team_id: 147, away_team_id: 111, home_score: 5, away_score: 2)
      create(:simulation_game, :completed, simulation_league: league,
             home_team_id: 147, away_team_id: 111, home_score: 3, away_score: 1)
      create(:simulation_game, :completed, simulation_league: league,
             home_team_id: 111, away_team_id: 147, home_score: 4, away_score: 2)
      create(:simulation_game, :completed, simulation_league: league,
             home_team_id: 147, away_team_id: 111, home_score: 6, away_score: 0)
    end

    subject(:standings) { described_class.send(:compute_standings_from, league.simulation_games.completed.to_a) }

    it "returns standings grouped by league and division" do
      expect(standings).to be_a(Hash)
      expect(standings.keys).to include("AL")
    end

    it "correctly tallies wins for a team" do
      al_east = standings.dig("AL", "East") || []
      nyy = al_east.find { |t| t[:team_id] == 147 }
      bal = al_east.find { |t| t[:team_id] == 111 }
      expect(nyy[:w]).to eq(3)
      expect(bal[:w]).to eq(1)
    end

    it "correctly tallies losses" do
      al_east = standings.dig("AL", "East") || []
      nyy = al_east.find { |t| t[:team_id] == 147 }
      expect(nyy[:l]).to eq(1)
    end

    it "computes pct = wins / games played" do
      al_east = standings.dig("AL", "East") || []
      nyy = al_east.find { |t| t[:team_id] == 147 }
      expect(nyy[:pct]).to be_within(0.001).of(3.0 / 4)
    end

    it "orders division by descending pct" do
      al_east = standings.dig("AL", "East") || []
      pcts = al_east.map { |t| t[:pct] }
      expect(pcts).to eq(pcts.sort.reverse)
    end

    it "marks division leader with '—' games-back" do
      al_east = standings.dig("AL", "East") || []
      expect(al_east.first[:gb]).to eq("—")
    end

    it "computes games-back correctly for teams behind the leader" do
      al_east = standings.dig("AL", "East") || []
      bal = al_east.find { |t| t[:team_id] == 111 }
      # Leader: 3W-1L; BAL: 1W-3L → GB = ((3-1)+(3-1))/2 = 2.0
      expect(bal[:gb]).to eq("2.0")
    end
  end

  # -----------------------------------------------------------------------
  # rotation_starter (private) — day-rest-aware
  # -----------------------------------------------------------------------
  describe ".rotation_starter (private)" do
    let(:league) { create(:simulation_league) }
    let(:game_date) { Date.new(2025, 4, 15) }

    it "returns the first pitcher when no rotation state exists" do
      roster = create(:simulation_roster, simulation_league: league, team_id: 147,
                      rotation_json: [10, 11, 12].to_json)
      result = described_class.send(:rotation_starter, league, 147, roster, game_date: game_date)
      expect(result).to eq(10)
    end

    it "skips a pitcher who started less than 5 days ago" do
      recent_date = (game_date - 3).to_s  # only 3 days rest
      roster = create(:simulation_roster, simulation_league: league, team_id: 147,
                      rotation_json: [10, 11, 12].to_json,
                      rotation_state_json: { "10" => recent_date }.to_json)

      result = described_class.send(:rotation_starter, league, 147, roster, game_date: game_date)
      expect(result).to eq(11)  # skips 10 (tired), returns 11
    end

    it "returns a pitcher who had exactly 5 days rest" do
      five_days_ago = (game_date - 5).to_s
      roster = create(:simulation_roster, simulation_league: league, team_id: 147,
                      rotation_json: [10, 11, 12].to_json,
                      rotation_state_json: { "10" => five_days_ago }.to_json)

      result = described_class.send(:rotation_starter, league, 147, roster, game_date: game_date)
      expect(result).to eq(10)  # exactly 5 days — eligible
    end

    it "falls back to cyclic when all pitchers are tired" do
      recent = (game_date - 2).to_s
      state  = { "10" => recent, "11" => recent, "12" => recent }
      roster = create(:simulation_roster, simulation_league: league, team_id: 147,
                      rotation_json: [10, 11, 12].to_json,
                      rotation_state_json: state.to_json)

      # With 3 completed home games, cyclic index = 3 % 3 = 0 → pitcher 10
      3.times do
        create(:simulation_game, :completed, simulation_league: league,
               home_team_id: 147, away_team_id: 111)
      end

      result = described_class.send(:rotation_starter, league, 147, roster, game_date: game_date)
      expect([10, 11, 12]).to include(result)
    end

    it "accepts a plain array and returns the first entry (no state)" do
      result = described_class.send(:rotation_starter, league, 147, [10, 11, 12], game_date: game_date)
      expect(result).to eq(10)
    end
  end

  # -----------------------------------------------------------------------
  # serialize_league
  # -----------------------------------------------------------------------
  describe ".serialize_league" do
    it "includes all expected keys" do
      league = create(:simulation_league)
      result = described_class.serialize_league(league)
      expect(result.keys).to include(
        :id, :name, :season, :scenario_id, :batter_pitcher_blend,
        :current_sim_date, :status, :games_played, :games_total
      )
    end

    it "includes scenario_name when a scenario is attached" do
      scenario = create(:projection_scenario, name: "Custom")
      league   = create(:simulation_league, scenario_id: scenario.id)
      expect(described_class.serialize_league(league)[:scenario_name]).to eq("Custom")
    end
  end

  # -----------------------------------------------------------------------
  # accumulate_game_stats (private)
  # -----------------------------------------------------------------------
  describe ".accumulate_game_stats (private)" do
    let(:league)  { create(:simulation_league) }
    let!(:home_r) { create(:simulation_roster, simulation_league: league, team_id: 147) }
    let!(:away_r) { create(:simulation_roster, simulation_league: league, team_id: 111) }

    let(:box_score) do
      {
        home: {
          batters: [
            { player_id: 1, name: "Batter A", ab: 4, h: 2, hr: 1, rbi: 2, bb: 0, k: 1, r: 1 },
          ],
          pitchers: [
            { player_id: 10, name: "Pitcher A", ip: "6.0", h: 5, er: 2, bb: 1, k: 7, decision: "W" },
          ],
        },
        away: {
          batters: [
            { player_id: 2, name: "Batter B", ab: 3, h: 1, hr: 0, rbi: 0, bb: 1, k: 2, r: 0 },
          ],
          pitchers: [
            { player_id: 11, name: "Pitcher B", ip: "7.0", h: 6, er: 3, bb: 2, k: 5, decision: "L" },
          ],
        },
      }
    end

    before { stub_projections }

    it "creates SimulationPlayerStat records for batters" do
      expect {
        described_class.send(:accumulate_game_stats, league, box_score, 147, 111, 10, 11)
      }.to change(SimulationPlayerStat, :count).by(4)
    end

    it "increments batter counting stats on repeat calls" do
      described_class.send(:accumulate_game_stats, league, box_score, 147, 111, 10, 11)
      described_class.send(:accumulate_game_stats, league, box_score, 147, 111, 10, 11)

      stat = SimulationPlayerStat.find_by(simulation_league: league, player_id: 1)
      expect(stat.ab).to eq(8)
      expect(stat.h).to  eq(4)
      expect(stat.hr).to eq(2)
    end

    it "records gs=1 for the starting pitcher" do
      described_class.send(:accumulate_game_stats, league, box_score, 147, 111, 10, 11)
      stat = SimulationPlayerStat.find_by(simulation_league: league, player_id: 10)
      expect(stat.gs).to eq(1)
    end

    it "converts IP string to outs_pitched correctly" do
      described_class.send(:accumulate_game_stats, league, box_score, 147, 111, 10, 11)
      stat = SimulationPlayerStat.find_by(simulation_league: league, player_id: 10)
      expect(stat.outs_pitched).to eq(18)  # 6.0 IP = 18 outs
    end

    it "records a win decision for the winning pitcher" do
      described_class.send(:accumulate_game_stats, league, box_score, 147, 111, 10, 11)
      stat = SimulationPlayerStat.find_by(simulation_league: league, player_id: 10)
      expect(stat.w).to eq(1)
      expect(stat.l).to eq(0)
    end
  end

  # -----------------------------------------------------------------------
  # simulate_season
  # -----------------------------------------------------------------------
  describe ".simulate_season" do
    let(:league) { create(:simulation_league) }

    before do
      stub_projections
      create(:simulation_roster, simulation_league: league, team_id: 147)
      create(:simulation_roster, simulation_league: league, team_id: 111)
      # Three games on two different dates
      create(:simulation_game, simulation_league: league,
             game_date: Date.today,     home_team_id: 147, away_team_id: 111)
      create(:simulation_game, simulation_league: league,
             game_date: Date.tomorrow,  home_team_id: 147, away_team_id: 111)
      create(:simulation_game, simulation_league: league,
             game_date: Date.tomorrow,  home_team_id: 147, away_team_id: 111)
    end

    it "simulates all unplayed games and returns simulated_dates count" do
      result = described_class.simulate_season(league)
      expect(result[:simulated_dates]).to eq(2)
    end

    it "marks all games as simulated" do
      described_class.simulate_season(league)
      expect(league.simulation_games.where(simulated_at: nil).count).to eq(0)
    end

    it "updates a job_run's result_json with progress after each date" do
      job_run = create(:simulation_job_run, simulation_league: league, job_type: "simulate_season")
      described_class.simulate_season(league, job_run: job_run)
      result = JSON.parse(job_run.reload.result_json)
      expect(result["done"]).to eq(result["total"])
    end

    it "skips already-simulated games" do
      create(:simulation_game, :completed, simulation_league: league,
             game_date: Date.today, home_team_id: 147, away_team_id: 111)
      expect {
        described_class.simulate_season(league)
      }.not_to raise_error
    end
  end

  # -----------------------------------------------------------------------
  # season_stats
  # -----------------------------------------------------------------------
  describe ".season_stats" do
    let(:league) { create(:simulation_league) }

    before do
      create(:simulation_roster, simulation_league: league, team_id: 147,
             team_abbr: "NYY", team_name: "New York Yankees", team_color: "#003087")
    end

    context "with no stats recorded" do
      it "returns empty leader arrays" do
        result = described_class.season_stats(league)
        expect(result[:batting_leaders][:hr]).to be_empty
        expect(result[:pitching_leaders][:era]).to be_empty
      end

      it "still returns team_stats for each roster" do
        result = described_class.season_stats(league)
        team = result[:team_stats].find { |t| t[:team_id] == 147 }
        expect(team).not_to be_nil
        expect(team[:abbr]).to eq("NYY")
      end
    end

    context "with accumulated batter stats" do
      before do
        create(:simulation_player_stat, simulation_league: league,
               team_id: 147, player_id: 1, player_name: "Slugger",
               player_type: "batter", g: 50, ab: 180, h: 54, hr: 15, rbi: 45, bb: 20, k: 40, r: 30)
        create(:simulation_player_stat, simulation_league: league,
               team_id: 147, player_id: 2, player_name: "ContactGuy",
               player_type: "batter", g: 50, ab: 190, h: 66, hr: 3, rbi: 20, bb: 10, k: 25, r: 25)
      end

      it "returns HR leaders sorted by HR descending" do
        result = described_class.season_stats(league)
        hr_leaders = result[:batting_leaders][:hr]
        expect(hr_leaders.first[:player_name]).to eq("Slugger")
        expect(hr_leaders.first[:hr]).to eq(15)
      end

      it "returns AVG leaders sorted by average descending (min 50 AB)" do
        result = described_class.season_stats(league)
        avg_leaders = result[:batting_leaders][:avg]
        expect(avg_leaders.first[:player_name]).to eq("ContactGuy")
      end
    end

    context "with accumulated pitcher stats" do
      before do
        create(:simulation_player_stat, simulation_league: league,
               team_id: 147, player_id: 10, player_name: "Ace",
               player_type: "pitcher", gs: 12, g_pitched: 12, outs_pitched: 216,
               h_allowed: 60, er: 18, bb_allowed: 20, k_pitched: 90, w: 9, l: 3, sv: 0)
      end

      it "returns ERA leaders sorted ascending (lower is better)" do
        result = described_class.season_stats(league)
        era_leaders = result[:pitching_leaders][:era]
        expect(era_leaders.first[:player_name]).to eq("Ace")
        expect(era_leaders.first[:era]).to be_within(0.1).of(2.25)
      end

      it "returns strikeout leaders" do
        result = described_class.season_stats(league)
        k_leaders = result[:pitching_leaders][:k]
        expect(k_leaders.first[:k]).to eq(90)
      end
    end
  end

  # -----------------------------------------------------------------------
  # player_season_stats
  # -----------------------------------------------------------------------
  describe ".player_season_stats" do
    let(:league) { create(:simulation_league) }

    it "returns error when player has no stats" do
      result = described_class.player_season_stats(league, 999)
      expect(result[:error]).to be_present
    end
  end

  describe ".team_player_stats" do
    let(:league) { create(:simulation_league) }
    let!(:roster) do
      create(:simulation_roster, simulation_league: league, team_id: 117, team_abbr: "HOU", team_color: "#002D62")
    end

    let!(:batter1) do
      create(:simulation_player_stat, simulation_league: league,
             team_id: 117, player_id: 1, player_name: "Batter One",
             player_type: "batter", g: 30, ab: 100, h: 27, hr: 5, rbi: 20, bb: 10, k: 25, r: 15)
    end

    let!(:batter2) do
      create(:simulation_player_stat, simulation_league: league,
             team_id: 117, player_id: 2, player_name: "Batter Two",
             player_type: "batter", g: 20, ab: 60, h: 15, hr: 1, rbi: 8, bb: 5, k: 14, r: 7)
    end

    let!(:pitcher1) do
      create(:simulation_player_stat, :pitcher, simulation_league: league,
             team_id: 117, player_id: 10, player_name: "Pitcher One",
             player_type: "pitcher", gs: 6, g_pitched: 7, outs_pitched: 108)
    end

    let!(:other_team_stat) do
      create(:simulation_player_stat, simulation_league: league,
             team_id: 147, player_id: 99, player_name: "Other Team",
             player_type: "batter", g: 30, ab: 100, h: 30, hr: 8, rbi: 25)
    end

    it "returns batters and pitchers keys" do
      result = described_class.team_player_stats(league, 117)
      expect(result).to have_key(:batters)
      expect(result).to have_key(:pitchers)
    end

    it "includes all team batters regardless of AB count" do
      result = described_class.team_player_stats(league, 117)
      batter_ids = result[:batters].map { |b| b[:player_id] }
      expect(batter_ids).to include(1, 2)
    end

    it "includes all team pitchers who have pitched" do
      result = described_class.team_player_stats(league, 117)
      pitcher_ids = result[:pitchers].map { |p| p[:player_id] }
      expect(pitcher_ids).to include(10)
    end

    it "excludes players from other teams" do
      result = described_class.team_player_stats(league, 117)
      all_ids = (result[:batters] + result[:pitchers]).map { |p| p[:player_id] }
      expect(all_ids).not_to include(99)
    end

    it "sorts batters by AB descending" do
      result = described_class.team_player_stats(league, 117)
      abs = result[:batters].map { |b| b[:ab] }
      expect(abs).to eq(abs.sort.reverse)
    end

    it "includes computed batting stats" do
      result = described_class.team_player_stats(league, 117)
      batter = result[:batters].find { |b| b[:player_id] == 1 }
      expect(batter[:avg]).to be_a(Float)
      expect(batter[:ops]).to be_a(Float)
    end

    it "returns empty batters when the team has no stats" do
      result = described_class.team_player_stats(league, 999)
      expect(result[:batters]).to be_empty
      expect(result[:pitchers]).to be_empty
    end
  end

  describe ".player_season_stats" do
    let(:league) { create(:simulation_league) }

    context "with a batter stat record" do
      let!(:stat) do
        create(:simulation_player_stat, simulation_league: league,
               team_id: 147, player_id: 55, player_name: "Batter X",
               player_type: "batter", g: 40, ab: 140, h: 42, hr: 8, rbi: 30,
               bb: 14, k: 35, r: 22)
      end

      it "returns player metadata" do
        result = described_class.player_season_stats(league, 55)
        expect(result[:player_name]).to eq("Batter X")
        expect(result[:player_type]).to eq("batter")
        expect(result[:team_id]).to eq(147)
      end

      it "returns a season_line hash with batting stats" do
        result = described_class.player_season_stats(league, 55)
        expect(result[:season_line]).to have_key(:ab)
        expect(result[:season_line]).to have_key(:hr)
        expect(result[:season_line]).to have_key(:avg)
        expect(result[:season_line]).to have_key(:ops)
      end

      it "returns game_log as an array (may be empty when no completed games)" do
        result = described_class.player_season_stats(league, 55)
        expect(result[:game_log]).to be_an(Array)
      end

      it "includes game log entries when matching box_score_json exists" do
        box = {
          home: {
            batters: [{ player_id: 55, name: "Batter X", ab: 4, h: 2, hr: 1, rbi: 2, bb: 0, k: 0, r: 1 }],
            pitchers: [],
          },
          away: { batters: [], pitchers: [] },
          linescore: [],
        }
        create(:simulation_game, :completed, simulation_league: league,
               home_team_id: 147, away_team_id: 111,
               box_score_json: box.to_json)

        result = described_class.player_season_stats(league, 55)
        expect(result[:game_log]).not_to be_empty
        expect(result[:game_log].first).to have_key(:date)
        expect(result[:game_log].first).to have_key(:opp)
      end
    end
  end
end
