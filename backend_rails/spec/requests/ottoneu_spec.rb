require "rails_helper"

RSpec.describe "Api::OttoneuController", type: :request do
  let(:roster_response) do
    {
      team_id:   6054,
      team_name: "Dingers and Dugouts",
      players: [
        { name: "Aaron Judge", mlb_team: "NYY", positions: "OF", salary: 40, fg_id: "116539" }
      ]
    }
  end

  # ── GET /api/ottoneu/roster ───────────────────────────────────────────────────

  describe "GET /api/ottoneu/roster" do
    it "returns 200 with roster data" do
      allow(OttoneuService).to receive(:my_enriched_roster).and_return(roster_response)

      get "/api/ottoneu/roster"

      expect(response).to have_http_status(:ok)
      body = response.parsed_body
      expect(body["team_name"]).to eq("Dingers and Dugouts")
      expect(body["players"]).to be_an(Array)
    end

    it "includes enriched season_points from production data" do
      enriched = roster_response.merge(
        players: [roster_response[:players].first.merge(season_points: 412.5, pts_per_game: 18.2)]
      )
      allow(OttoneuService).to receive(:my_enriched_roster).and_return(enriched)

      get "/api/ottoneu/roster"

      expect(response).to have_http_status(:ok)
      player = response.parsed_body["players"].first
      expect(player["season_points"]).to eq(412.5)
    end
  end

  # ── GET /api/ottoneu/standings ────────────────────────────────────────────────

  describe "GET /api/ottoneu/standings" do
    let(:standings_response) do
      { divisions: [{ name: "Lansdowne", teams: [{ name: "Dingers and Dugouts", record: "5-3" }] }] }
    end

    it "returns 200 with divisions" do
      allow(OttoneuService).to receive(:standings).and_return(standings_response)

      get "/api/ottoneu/standings"

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["divisions"]).to be_an(Array)
    end
  end

  # ── GET /api/ottoneu/auctions ─────────────────────────────────────────────────

  describe "GET /api/ottoneu/auctions" do
    let(:auctions_response) do
      { active: [{ name: "Curtis Mead", bid: 5 }], completed: [] }
    end

    it "returns 200 with active and completed auctions" do
      allow(OttoneuService).to receive(:auctions).and_return(auctions_response)

      get "/api/ottoneu/auctions"

      expect(response).to have_http_status(:ok)
      body = response.parsed_body
      expect(body["active"]).to be_an(Array)
      expect(body["completed"]).to be_an(Array)
    end
  end

  # ── GET /api/ottoneu/waivers ──────────────────────────────────────────────────

  describe "GET /api/ottoneu/waivers" do
    let(:waivers_response) do
      { active: [{ name: "Bryan Abreu", salary: 3 }], completed: [] }
    end

    it "returns 200 with active and completed waivers" do
      allow(OttoneuService).to receive(:waivers).and_return(waivers_response)

      get "/api/ottoneu/waivers"

      expect(response).to have_http_status(:ok)
      body = response.parsed_body
      expect(body["active"]).to be_an(Array)
      expect(body["completed"]).to be_an(Array)
    end
  end

  # ── GET /api/ottoneu/cap_overview ─────────────────────────────────────────────

  describe "GET /api/ottoneu/cap_overview" do
    let(:cap_response) do
      [
        { team_name: "Dingers and Dugouts", player_count: 40, base_salary: 400, penalties: 0, cap_space: 100 },
        { team_name: "Other Team",          player_count: 38, base_salary: 380, penalties: 5, cap_space: 115 }
      ]
    end

    it "returns 200 with an array of team cap entries" do
      allow(OttoneuService).to receive(:cap_overview).and_return(cap_response)

      get "/api/ottoneu/cap_overview"

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body).to be_an(Array)
      expect(response.parsed_body.first["team_name"]).to be_present
    end
  end

  # ── GET /api/ottoneu/player_status ───────────────────────────────────────────

  describe "GET /api/ottoneu/player_status" do
    context "when fg_id is provided" do
      it "returns 200 with player status" do
        allow(OttoneuService).to receive(:player_status).with("116539")
          .and_return({ rostered: true, team_name: "Dingers and Dugouts", salary: 40 })

        get "/api/ottoneu/player_status", params: { fg_id: "116539" }

        expect(response).to have_http_status(:ok)
        expect(response.parsed_body["rostered"]).to be true
      end

      it "returns rostered: false for unrostered player" do
        allow(OttoneuService).to receive(:player_status).with("9999")
          .and_return({ rostered: false })

        get "/api/ottoneu/player_status", params: { fg_id: "9999" }

        expect(response).to have_http_status(:ok)
        expect(response.parsed_body["rostered"]).to be false
      end
    end

    context "when fg_id is missing" do
      it "returns 400 with error message" do
        get "/api/ottoneu/player_status"

        expect(response).to have_http_status(:bad_request)
        expect(response.parsed_body["error"]).to match(/fg_id/i)
      end
    end
  end

  # ── GET /api/ottoneu/insights ─────────────────────────────────────────────────

  describe "GET /api/ottoneu/insights" do
    let(:insights_response) do
      { factoids: ["Judge is raking this week.", "Bieber starts Thursday."], generated_at: "2026-05-26T00:00:00Z" }
    end

    it "returns 200 with factoids" do
      allow(OttoneuInsightsService).to receive(:call).with(refresh: nil).and_return(insights_response)

      get "/api/ottoneu/insights"

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["factoids"]).to be_an(Array)
    end

    it "passes refresh: true when param present" do
      allow(OttoneuInsightsService).to receive(:call).with(refresh: true).and_return(insights_response)

      get "/api/ottoneu/insights", params: { refresh: "true" }

      expect(response).to have_http_status(:ok)
    end
  end

  # ── GET /api/ottoneu/free_agents ──────────────────────────────────────────────

  describe "GET /api/ottoneu/free_agents" do
    let(:fa_response) do
      {
        players:        [{ name: "Top Batter", fg_id: "abc123" }],
        waiver_players: [{ name: "Bryan Abreu", salary: 3 }],
        factoids:       ["Top Batter is a strong auction target."],
        cap_space:      60,
        generated_at:   "2026-05-26T00:00:00Z"
      }
    end

    it "returns 200 with players, waivers, and factoids" do
      allow(OttoneuFreeAgentsService).to receive(:call).with(refresh: nil).and_return(fa_response)

      get "/api/ottoneu/free_agents"

      expect(response).to have_http_status(:ok)
      body = response.parsed_body
      expect(body["players"]).to be_an(Array)
      expect(body["waiver_players"]).to be_an(Array)
      expect(body["factoids"]).to be_an(Array)
      expect(body["cap_space"]).to eq(60)
    end

    it "passes refresh: true when param present" do
      allow(OttoneuFreeAgentsService).to receive(:call).with(refresh: true).and_return(fa_response)

      get "/api/ottoneu/free_agents", params: { refresh: "true" }

      expect(response).to have_http_status(:ok)
    end
  end

  # ── GET /api/ottoneu/player_stats ─────────────────────────────────────────────

  describe "GET /api/ottoneu/player_stats" do
    let(:stats_response) do
      [{ fg_id: "116539", name: "Aaron Judge", woba: 0.421, hr: 27, bb_pct: 14.2, group: "batter" }]
    end

    it "returns 200 with stats array when fg_ids provided" do
      allow(OttoneuPlayerStatsService).to receive(:fetch)
        .with(fg_ids: ["116539"], names: [])
        .and_return(stats_response)

      get "/api/ottoneu/player_stats", params: { fg_ids: ["116539"] }

      expect(response).to have_http_status(:ok)
      body = response.parsed_body
      expect(body).to be_an(Array)
      expect(body.first["name"]).to eq("Aaron Judge")
    end

    it "returns 200 with stats array when names provided" do
      allow(OttoneuPlayerStatsService).to receive(:fetch)
        .with(fg_ids: [], names: ["Kyle Finnegan"])
        .and_return([{ fg_id: "669392", name: "Kyle Finnegan", fip: 3.21, group: "pitcher" }])

      get "/api/ottoneu/player_stats", params: { names: ["Kyle Finnegan"] }

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body.first["group"]).to eq("pitcher")
    end

    it "returns 400 when neither fg_ids nor names provided" do
      get "/api/ottoneu/player_stats"

      expect(response).to have_http_status(:bad_request)
      expect(response.parsed_body["error"]).to be_present
    end
  end

  # ── GET /api/ottoneu/league_stats ───────────────────────────────────────────

  describe "GET /api/ottoneu/league_stats" do
    it "returns 200 with an array of player stats rows" do
      allow(OttoneuLeagueStatsService).to receive(:call).and_return([
        { fg_id: "12345", name: "Mike Trout", group: "batter", salary: 40, ppd: 12.5, surplus: 100.0,
          roster_team: "Dingers and Dugouts", positions: "OF", approx_fg_pts: 500.0 }
      ])

      get "/api/ottoneu/league_stats"

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body).to be_an(Array)
      expect(response.parsed_body.first["name"]).to eq("Mike Trout")
      expect(response.parsed_body.first["ppd"]).to eq(12.5)
    end

    it "returns 200 with empty array when no data" do
      allow(OttoneuLeagueStatsService).to receive(:call).and_return([])

      get "/api/ottoneu/league_stats"

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body).to eq([])
    end
  end

  # ── GET /api/ottoneu/loans ───────────────────────────────────────────────────

  describe "GET /api/ottoneu/loans" do
    it "returns 200 with an array of loan entries" do
      allow(OttoneuService).to receive(:loans).and_return([
        { from_team: "Team A", to_team: "Team B", amount: 20, season: "2025", status: "" }
      ])

      get "/api/ottoneu/loans"

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body).to be_an(Array)
      expect(response.parsed_body.first["from_team"]).to eq("Team A")
    end

    it "returns 200 with empty array when no loans" do
      allow(OttoneuService).to receive(:loans).and_return([])

      get "/api/ottoneu/loans"

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body).to eq([])
    end
  end
end
