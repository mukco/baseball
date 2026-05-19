require "rails_helper"

RSpec.describe "Api::SimulationsController", type: :request do
  # -----------------------------------------------------------------------
  # Shared helpers
  # -----------------------------------------------------------------------
  def stub_setup_league(league)
    allow(SimulationService).to receive(:setup_league).and_return(
      SimulationService.serialize_league(league)
    )
  end

  def stub_projections
    allow(ProjectionService).to receive(:project_player).and_return(component_stats: {})
    allow(ProjectionService).to receive(:create_run).and_return(projections: [])
    allow(ProjectionDataService).to receive(:player_name).and_return("Test Player")
    allow(ProjectionScenario).to receive(:ensure_default!)
    allow(ProjectionScenario).to receive(:default_scenario).and_return(
      instance_double(ProjectionScenario, id: 1)
    )
  end

  def make_league_with_rosters
    league  = create(:simulation_league)
    game    = create(:simulation_game, simulation_league: league)
    create(:simulation_roster, simulation_league: league, team_id: game.home_team_id)
    create(:simulation_roster, simulation_league: league, team_id: game.away_team_id)
    [league, game]
  end

  # -----------------------------------------------------------------------
  # GET /api/simulations
  # -----------------------------------------------------------------------
  describe "GET /api/simulations" do
    it "returns 200 with a leagues array" do
      create(:simulation_league, name: "Alpha")
      create(:simulation_league, name: "Beta")

      get "/api/simulations"

      expect(response).to have_http_status(:ok)
      names = response.parsed_body["leagues"].map { |l| l["name"] }
      expect(names).to include("Alpha", "Beta")
    end

    it "returns an empty leagues array when none exist" do
      get "/api/simulations"

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["leagues"]).to eq([])
    end
  end

  # -----------------------------------------------------------------------
  # POST /api/simulations
  # -----------------------------------------------------------------------
  describe "POST /api/simulations" do
    before do
      mlb = instance_double(MlbApiService)
      allow(MlbApiService).to receive(:new).and_return(mlb)
      allow(mlb).to receive(:all_teams).and_return([])
      allow(mlb).to receive(:season_schedule).and_return([])
      allow(mlb).to receive(:send).with(:team_roster, anything).and_return([])
    end

    it "returns 200 and creates a league" do
      expect {
        post "/api/simulations", params: { name: "Test League", season: 2025 }, as: :json
      }.to change(SimulationLeague, :count).by(1)

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["name"]).to eq("Test League")
    end

    it "stores the scenario_id when provided" do
      scenario = create(:projection_scenario)
      post "/api/simulations",
           params: { name: "Scenario League", season: 2025, scenario_id: scenario.id },
           as: :json

      expect(SimulationLeague.last.scenario_id).to eq(scenario.id)
    end

    it "stores the batter_pitcher_blend when provided" do
      post "/api/simulations",
           params: { name: "Pitcher League", season: 2025, batter_pitcher_blend: 0.3 },
           as: :json

      expect(SimulationLeague.last.batter_pitcher_blend).to be_within(0.001).of(0.3)
    end

    it "returns 502 when name is missing" do
      post "/api/simulations", params: { season: 2025 }, as: :json
      expect(response).to have_http_status(:bad_gateway)
    end
  end

  # -----------------------------------------------------------------------
  # GET /api/simulations/:id
  # -----------------------------------------------------------------------
  describe "GET /api/simulations/:id" do
    it "returns 200 with league state" do
      league = create(:simulation_league)
      get "/api/simulations/#{league.id}"

      expect(response).to have_http_status(:ok)
      body = response.parsed_body
      expect(body).to have_key("league")
      expect(body).to have_key("standings")
      expect(body).to have_key("today")
    end

    it "returns 502 when league does not exist" do
      get "/api/simulations/99999"
      expect(response).to have_http_status(:bad_gateway)
    end
  end

  # -----------------------------------------------------------------------
  # DELETE /api/simulations/:id
  # -----------------------------------------------------------------------
  describe "DELETE /api/simulations/:id" do
    it "returns 200 and deletes the league" do
      league = create(:simulation_league)
      expect {
        delete "/api/simulations/#{league.id}"
      }.to change(SimulationLeague, :count).by(-1)

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["ok"]).to be true
    end

    it "also destroys associated games and rosters" do
      league = create(:simulation_league)
      create(:simulation_game, simulation_league: league)
      create(:simulation_roster, simulation_league: league)

      delete "/api/simulations/#{league.id}"

      expect(SimulationGame.count).to eq(0)
      expect(SimulationRoster.count).to eq(0)
    end

    it "returns 502 when league does not exist" do
      delete "/api/simulations/99999"
      expect(response).to have_http_status(:bad_gateway)
    end
  end

  # -----------------------------------------------------------------------
  # POST /api/simulations/:id/simulate_day
  # -----------------------------------------------------------------------
  describe "POST /api/simulations/:id/simulate_day" do
    it "returns 200 and enqueues a background job" do
      league, _game = make_league_with_rosters

      post "/api/simulations/#{league.id}/simulate_day",
           params: { date: Date.today.to_s }, as: :json

      expect(response).to have_http_status(:ok)
      body = response.parsed_body
      expect(body).to have_key("job_id")
      expect(body["status"]).to eq("pending")
      expect(body).to have_key("date")
    end

    it "creates a SimulationJobRun record" do
      league, _game = make_league_with_rosters

      expect {
        post "/api/simulations/#{league.id}/simulate_day",
             params: { date: Date.today.to_s }, as: :json
      }.to change(SimulationJobRun, :count).by(1)

      job_run = SimulationJobRun.last
      expect(job_run.status).to eq("pending")
      expect(job_run.sim_date).to eq(Date.today)
    end

    it "uses the league's current_sim_date when no date is given" do
      league, _game = make_league_with_rosters
      league.update!(current_sim_date: Date.today)

      post "/api/simulations/#{league.id}/simulate_day", as: :json

      expect(response).to have_http_status(:ok)
      expect(SimulationJobRun.last.sim_date).to eq(Date.today)
    end

    it "returns 502 when the league does not exist" do
      post "/api/simulations/99999/simulate_day", as: :json
      expect(response).to have_http_status(:bad_gateway)
    end
  end

  describe "GET /api/simulations/:id/jobs/:job_id" do
    it "returns the job run status" do
      league = create(:simulation_league)
      job_run = create(:simulation_job_run, simulation_league: league, status: "running")

      get "/api/simulations/#{league.id}/jobs/#{job_run.id}"

      expect(response).to have_http_status(:ok)
      body = response.parsed_body
      expect(body["status"]).to eq("running")
      expect(body["id"]).to eq(job_run.id)
    end

    it "returns 502 when the job does not exist" do
      league = create(:simulation_league)
      get "/api/simulations/#{league.id}/jobs/99999"
      expect(response).to have_http_status(:bad_gateway)
    end
  end

  # -----------------------------------------------------------------------
  # POST /api/simulations/:id/games/:game_id/simulate
  # -----------------------------------------------------------------------
  describe "POST /api/simulations/:id/games/:game_id/simulate" do
    it "returns 200 and a game result" do
      league, game = make_league_with_rosters
      stub_projections

      post "/api/simulations/#{league.id}/games/#{game.id}/simulate", as: :json

      expect(response).to have_http_status(:ok)
      body = response.parsed_body
      expect(body).to have_key("game")
      expect(body).to have_key("box_score")
    end

    it "marks the game as having a score after simulation" do
      league, game = make_league_with_rosters
      stub_projections

      post "/api/simulations/#{league.id}/games/#{game.id}/simulate", as: :json

      game.reload
      expect(game.home_score).not_to be_nil
      expect(game.away_score).not_to be_nil
    end

    it "returns 502 when game_id does not exist" do
      league = create(:simulation_league)
      post "/api/simulations/#{league.id}/games/99999/simulate", as: :json
      expect(response).to have_http_status(:bad_gateway)
    end
  end

  # -----------------------------------------------------------------------
  # GET /api/simulations/:id/games/:game_id
  # -----------------------------------------------------------------------
  describe "GET /api/simulations/:id/games/:game_id" do
    it "returns 200 with game and box_score keys" do
      league = create(:simulation_league)
      game   = create(:simulation_game, :completed, simulation_league: league,
                      box_score_json: { home: {}, away: {}, linescore: [] }.to_json)

      get "/api/simulations/#{league.id}/games/#{game.id}"

      expect(response).to have_http_status(:ok)
      body = response.parsed_body
      expect(body).to have_key("game")
      expect(body).to have_key("box_score")
    end
  end

  # -----------------------------------------------------------------------
  # GET /api/simulations/:id/schedule
  # -----------------------------------------------------------------------
  describe "GET /api/simulations/:id/schedule" do
    it "returns 200 with date and games keys" do
      league = create(:simulation_league, current_sim_date: Date.today)
      create(:simulation_game, simulation_league: league, game_date: Date.today)

      get "/api/simulations/#{league.id}/schedule"

      expect(response).to have_http_status(:ok)
      body = response.parsed_body
      expect(body).to have_key("date")
      expect(body).to have_key("games")
      expect(body["games"].size).to eq(1)
    end

    it "accepts a date param and returns games for that date" do
      league = create(:simulation_league)
      create(:simulation_game, simulation_league: league, game_date: Date.today)
      create(:simulation_game, simulation_league: league, game_date: Date.tomorrow)

      get "/api/simulations/#{league.id}/schedule",
          params: { date: Date.tomorrow.to_s }

      expect(response.parsed_body["games"].size).to eq(1)
    end
  end

  # -----------------------------------------------------------------------
  # GET /api/simulations/:id/rosters/:team_id
  # -----------------------------------------------------------------------
  describe "GET /api/simulations/:id/rosters/:team_id" do
    it "returns 200 with roster details" do
      league = create(:simulation_league)
      roster = create(:simulation_roster, simulation_league: league, team_id: 147)

      get "/api/simulations/#{league.id}/rosters/147"

      expect(response).to have_http_status(:ok)
      body = response.parsed_body
      expect(body["team_id"]).to eq("147").or eq(147)
      expect(body).to have_key("lineup_order")
      expect(body).to have_key("rotation")
      expect(body).to have_key("roster")
    end

    it "returns 502 when the team has no roster in this league" do
      league = create(:simulation_league)
      get "/api/simulations/#{league.id}/rosters/999"
      expect(response).to have_http_status(:bad_gateway)
    end
  end

  # -----------------------------------------------------------------------
  # PATCH /api/simulations/:id/rosters/:team_id
  # -----------------------------------------------------------------------
  describe "PATCH /api/simulations/:id/rosters/:team_id" do
    it "returns 200 and updates the lineup_order" do
      league = create(:simulation_league)
      create(:simulation_roster, simulation_league: league, team_id: 147,
             lineup_order_json: [1, 2, 3].to_json)

      patch "/api/simulations/#{league.id}/rosters/147",
            params: { lineup_order: [3, 1, 2] }, as: :json

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["ok"]).to be true
      expect(SimulationRoster.find_by(team_id: 147).lineup_order).to eq([3, 1, 2])
    end

    it "returns 200 and updates the rotation" do
      league = create(:simulation_league)
      create(:simulation_roster, simulation_league: league, team_id: 147,
             rotation_json: [10, 11, 12].to_json)

      patch "/api/simulations/#{league.id}/rosters/147",
            params: { rotation: [12, 10, 11] }, as: :json

      expect(response).to have_http_status(:ok)
      expect(SimulationRoster.find_by(team_id: 147).rotation).to eq([12, 10, 11])
    end

    it "stores bullpen_roles when provided" do
      league = create(:simulation_league)
      create(:simulation_roster, simulation_league: league, team_id: 147)

      patch "/api/simulations/#{league.id}/rosters/147",
            params: { bullpen_roles: { closer_id: 55, setup_ids: [56, 57], long_ids: [] } },
            as: :json

      expect(response).to have_http_status(:ok)
      roles = JSON.parse(SimulationRoster.find_by(team_id: 147).bullpen_roles_json)
      expect(roles["closer_id"]).to eq(55)
    end

    it "returns an error when the roster does not exist" do
      league = create(:simulation_league)
      patch "/api/simulations/#{league.id}/rosters/999",
            params: { lineup_order: [1, 2] }, as: :json
      expect(response.parsed_body).to have_key("error")
    end
  end

  # -----------------------------------------------------------------------
  # GET /api/simulations/:id/stats
  # -----------------------------------------------------------------------
  describe "GET /api/simulations/:id/stats" do
    it "returns 200 with batting_leaders, pitching_leaders, and team_stats keys" do
      league = create(:simulation_league)
      create(:simulation_roster, simulation_league: league, team_id: 147,
             team_abbr: "NYY", team_color: "#003087")

      get "/api/simulations/#{league.id}/stats"

      expect(response).to have_http_status(:ok)
      body = response.parsed_body
      expect(body).to have_key("batting_leaders")
      expect(body).to have_key("pitching_leaders")
      expect(body).to have_key("team_stats")
    end

    it "returns player stats in the HR leader list when stats exist" do
      league = create(:simulation_league)
      create(:simulation_roster, simulation_league: league, team_id: 147,
             team_abbr: "NYY", team_color: "#003087")
      create(:simulation_player_stat, simulation_league: league,
             team_id: 147, player_id: 1, player_name: "HR King",
             player_type: "batter", ab: 120, h: 36, hr: 20, rbi: 60,
             bb: 15, k: 40, r: 30, g: 40)

      get "/api/simulations/#{league.id}/stats"

      hr_leaders = response.parsed_body.dig("batting_leaders", "hr")
      expect(hr_leaders.first["player_name"]).to eq("HR King")
    end

    it "returns 502 when league does not exist" do
      get "/api/simulations/99999/stats"
      expect(response).to have_http_status(:bad_gateway)
    end
  end

  # -----------------------------------------------------------------------
  # GET /api/simulations/:id/stats/:player_id
  # -----------------------------------------------------------------------
  describe "GET /api/simulations/:id/stats/:player_id" do
    it "returns 200 with season_line and game_log when player exists" do
      allow(ProjectionService).to receive(:project_player).and_return(component_stats: {})

      league = create(:simulation_league)
      create(:simulation_player_stat, simulation_league: league,
             team_id: 147, player_id: 55, player_name: "Test Batter",
             player_type: "batter", ab: 100, h: 30, hr: 5, rbi: 20,
             bb: 10, k: 25, r: 15, g: 30)

      get "/api/simulations/#{league.id}/stats/55"

      expect(response).to have_http_status(:ok)
      body = response.parsed_body
      expect(body).to have_key("season_line")
      expect(body).to have_key("game_log")
      expect(body["player_name"]).to eq("Test Batter")
    end

    it "returns an error key when the player has no stats" do
      league = create(:simulation_league)
      get "/api/simulations/#{league.id}/stats/99999"
      expect(response).to have_http_status(:ok)
      expect(response.parsed_body).to have_key("error")
    end
  end

  # -----------------------------------------------------------------------
  # POST /api/simulations/:id/simulate_season
  # -----------------------------------------------------------------------
  describe "POST /api/simulations/:id/simulate_season" do
    it "returns 200 and enqueues a background job" do
      league, _game = make_league_with_rosters

      post "/api/simulations/#{league.id}/simulate_season", as: :json

      expect(response).to have_http_status(:ok)
      body = response.parsed_body
      expect(body).to have_key("job_id")
      expect(body["status"]).to eq("pending")
    end

    it "creates a SimulationJobRun with job_type simulate_season" do
      league, _game = make_league_with_rosters

      expect {
        post "/api/simulations/#{league.id}/simulate_season", as: :json
      }.to change(SimulationJobRun, :count).by(1)

      expect(SimulationJobRun.last.job_type).to eq("simulate_season")
    end

    it "returns 502 when league does not exist" do
      post "/api/simulations/99999/simulate_season", as: :json
      expect(response).to have_http_status(:bad_gateway)
    end
  end

  # -----------------------------------------------------------------------
  # GET /api/simulations/:id/playoffs
  # -----------------------------------------------------------------------
  describe "GET /api/simulations/:id/playoffs" do
    it "returns 200 with a rounds key" do
      league = create(:simulation_league)
      get "/api/simulations/#{league.id}/playoffs"

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body).to have_key("rounds")
    end

    it "returns empty rounds when no playoff series exist" do
      league = create(:simulation_league)
      get "/api/simulations/#{league.id}/playoffs"

      expect(response.parsed_body["rounds"]).to be_empty
    end

    it "includes seeded series when playoffs have been seeded" do
      league = create(:simulation_league)
      create(:simulation_playoff_series, simulation_league: league, round: "wc",
             league: "AL", series_index: 0)

      get "/api/simulations/#{league.id}/playoffs"

      rounds = response.parsed_body["rounds"]
      expect(rounds.any? { |r| r["round"] == "wc" }).to be true
    end

    it "returns 502 when league does not exist" do
      get "/api/simulations/99999/playoffs"
      expect(response).to have_http_status(:bad_gateway)
    end
  end

  # -----------------------------------------------------------------------
  # POST /api/simulations/:id/seed_playoffs
  # -----------------------------------------------------------------------
  describe "POST /api/simulations/:id/seed_playoffs" do
    it "returns 502 when league does not exist" do
      post "/api/simulations/99999/seed_playoffs", as: :json
      expect(response).to have_http_status(:bad_gateway)
    end

    it "returns an error body when playoffs are already seeded" do
      league = create(:simulation_league)
      create(:simulation_playoff_series, simulation_league: league)

      post "/api/simulations/#{league.id}/seed_playoffs", as: :json

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body).to have_key("error")
    end
  end

  # -----------------------------------------------------------------------
  # GET /api/simulations/:id/awards
  # -----------------------------------------------------------------------
  describe "GET /api/simulations/:id/awards" do
    it "returns 502 when league does not exist" do
      get "/api/simulations/99999/awards"
      expect(response).to have_http_status(:bad_gateway)
    end

    it "returns generated: false when no awards exist" do
      league = create(:simulation_league)
      get "/api/simulations/#{league.id}/awards"
      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["generated"]).to be false
    end

    it "returns generated: true with awards data when insight exists" do
      league  = create(:simulation_league)
      payload = { "mvp" => { "al" => { "winner" => { "player_name" => "Test Player" } } } }
      create(:simulation_insight,
             simulation_league: league,
             subject_type: "awards",
             subject_id:   league.id,
             bullets_json: payload.to_json)

      get "/api/simulations/#{league.id}/awards"

      expect(response).to have_http_status(:ok)
      body = response.parsed_body
      expect(body["generated"]).to be true
      expect(body["awards"]["mvp"]["al"]["winner"]["player_name"]).to eq("Test Player")
    end
  end

  # -----------------------------------------------------------------------
  # POST /api/simulations/:id/generate_awards
  # -----------------------------------------------------------------------
  describe "POST /api/simulations/:id/generate_awards" do
    let(:ai_response) do
      {
        "mvp"           => { "al" => nil, "nl" => nil },
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

    it "returns 502 when league does not exist" do
      post "/api/simulations/99999/generate_awards", as: :json
      expect(response).to have_http_status(:bad_gateway)
    end

    it "enqueues a background job and returns pending" do
      league = create(:simulation_league)

      post "/api/simulations/#{league.id}/generate_awards", as: :json

      expect(response).to have_http_status(:ok)
      body = response.parsed_body
      expect(body).to have_key("job_id")
      expect(body["status"]).to eq("pending")
    end
  end
end
