require "rails_helper"

RSpec.describe PlayoffSimulationService do
  def stub_projections
    allow(ProjectionService).to receive(:project_player).and_return(component_stats: {})
    allow(ProjectionDataService).to receive(:player_name).and_return("Test Player")
  end

  # Build a minimal set of standings data for a league.
  # Returns 3 division winners + 3 WC teams for each of AL and NL.
  def seed_standings(league, teams_by_league)
    teams_by_league.each do |(team_id, abbr, color, wins, losses, division, lg)|
      create(:simulation_roster, simulation_league: league, team_id: team_id,
             team_abbr: abbr, team_color: color, team_name: "#{abbr} Team")
      wins.times do
        create(:simulation_game, :completed, simulation_league: league,
               home_team_id: team_id, away_team_id: 111,
               home_score: 5, away_score: 2)
      end
      losses.times do
        create(:simulation_game, :completed, simulation_league: league,
               home_team_id: team_id, away_team_id: 111,
               home_score: 2, away_score: 5)
      end
    end
  end

  # Create a fully-seeded league with 6 AL + 6 NL qualified teams via direct standings injection.
  def create_seeded_league
    league = create(:simulation_league)

    # AL teams — 6 in different divisions
    al_teams = [
      [147, "NYY", "#003087", 90, 72, "East",    "AL"],  # div winner (most wins)
      [139, "TBR", "#092C5C", 88, 74, "East",    "AL"],  # wc
      [141, "TOR", "#134A8E", 85, 77, "East",    "AL"],  # wc
      [145, "CWS", "#27251F", 92, 70, "Central", "AL"],  # div winner
      [118, "KCR", "#004687", 80, 82, "Central", "AL"],  # wc
      [108, "LAA", "#003263", 86, 76, "West",    "AL"],  # div winner
    ]
    # NL teams
    nl_teams = [
      [143, "PHI", "#E81828", 91, 71, "East",    "NL"],  # div winner
      [121, "NYM", "#002D72", 83, 79, "East",    "NL"],  # wc
      [120, "WSN", "#AB0003", 79, 83, "East",    "NL"],  # wc
      [112, "CHC", "#0E3386", 87, 75, "Central", "NL"],  # div winner
      [158, "MIL", "#FFC52F", 82, 80, "Central", "NL"],  # wc
      [109, "ARI", "#A71930", 89, 73, "West",    "NL"],  # div winner
    ]
    (al_teams + nl_teams).each do |(team_id, abbr, color, wins, losses, _div, _lg)|
      create(:simulation_roster, simulation_league: league,
             team_id: team_id, team_abbr: abbr, team_color: color, team_name: "#{abbr} Team")
      wins.times do
        create(:simulation_game, :completed, simulation_league: league,
               home_team_id: team_id, away_team_id: 999,
               home_score: 5, away_score: 2)
      end
      losses.times do
        create(:simulation_game, :completed, simulation_league: league,
               home_team_id: team_id, away_team_id: 999,
               home_score: 2, away_score: 5)
      end
    end

    league
  end

  # -----------------------------------------------------------------------
  # seed_playoffs
  # -----------------------------------------------------------------------
  describe ".seed_playoffs" do
    before { stub_projections }

    it "returns error when playoffs are already seeded" do
      league = create(:simulation_league)
      create(:simulation_playoff_series, simulation_league: league)
      result = described_class.seed_playoffs(league)
      expect(result[:error]).to be_present
    end

    context "with a league that has enough qualified teams" do
      let(:league) { create_seeded_league }

      it "creates 4 Wild Card series (2 AL + 2 NL)" do
        expect {
          described_class.seed_playoffs(league)
        }.to change(SimulationPlayoffSeries, :count).by(4)
      end

      it "all seeded series are in the 'wc' round" do
        described_class.seed_playoffs(league)
        rounds = league.simulation_playoff_series.pluck(:round).uniq
        expect(rounds).to eq(["wc"])
      end

      it "returns seeded: true" do
        result = described_class.seed_playoffs(league)
        expect(result[:seeded]).to be true
      end

      it "returns a bracket hash" do
        result = described_class.seed_playoffs(league)
        expect(result[:bracket]).to have_key(:rounds)
      end
    end
  end

  # -----------------------------------------------------------------------
  # bracket_state
  # -----------------------------------------------------------------------
  describe ".bracket_state" do
    it "returns empty rounds when no series exist" do
      league = create(:simulation_league)
      result = described_class.bracket_state(league)
      expect(result[:rounds]).to be_empty
    end

    it "groups series by round" do
      league = create(:simulation_league)
      create(:simulation_playoff_series, simulation_league: league, round: "wc",
             league: "AL", series_index: 0)
      create(:simulation_playoff_series, simulation_league: league, round: "wc",
             league: "AL", series_index: 1)

      result = described_class.bracket_state(league)
      wc = result[:rounds].find { |r| r[:round] == "wc" }
      expect(wc[:series].size).to eq(2)
    end

    it "includes series fields needed by the frontend" do
      league = create(:simulation_league)
      create(:simulation_playoff_series, simulation_league: league, round: "wc",
             league: "AL", series_index: 0)

      result = described_class.bracket_state(league)
      series = result[:rounds].first[:series].first
      expect(series.keys).to include(
        :id, :round, :league, :home_team_abbr, :away_team_abbr,
        :home_wins, :away_wins, :status, :series_length
      )
    end
  end

  # -----------------------------------------------------------------------
  # simulate_round
  # -----------------------------------------------------------------------
  describe ".simulate_round" do
    before { stub_projections }

    it "returns error when no round to simulate" do
      league = create(:simulation_league)
      result = described_class.simulate_round(league, "wc")
      expect(result[:error]).to be_present
    end

    context "with a pending WC series" do
      let(:league) { create(:simulation_league) }

      before do
        # Two AL WC series — required for advance_bracket to function correctly
        [
          [147, "NYY", "#003087", 111, "BAL", "#DF4601", 0],
          [141, "TOR", "#134A8E", 139, "TBR", "#092C5C", 1],
        ].each do |(home_id, home_abbr, home_color, away_id, away_abbr, away_color, idx)|
          create(:simulation_roster, simulation_league: league, team_id: home_id,
                 team_abbr: home_abbr, team_color: home_color)
          create(:simulation_roster, simulation_league: league, team_id: away_id,
                 team_abbr: away_abbr, team_color: away_color)
          create(:simulation_playoff_series, simulation_league: league,
                 round: "wc", league: "AL", series_index: idx,
                 home_team_id: home_id, away_team_id: away_id,
                 home_team_abbr: home_abbr, away_team_abbr: away_abbr,
                 home_team_color: home_color, away_team_color: away_color,
                 series_length: 3, status: "pending")
        end
      end

      it "completes all WC series in the round" do
        described_class.simulate_round(league, "wc")
        wc_statuses = league.simulation_playoff_series.where(round: "wc").pluck(:status).uniq
        expect(wc_statuses).to eq(["complete"])
      end

      it "sets a winner_team_id on each completed WC series" do
        described_class.simulate_round(league, "wc")
        league.simulation_playoff_series.where(round: "wc").each do |s|
          expect([s.home_team_id, s.away_team_id]).to include(s.winner_team_id)
        end
      end

      it "returns a round key in the result" do
        result = described_class.simulate_round(league, "wc")
        expect(result[:round]).to eq("wc")
      end
    end
  end
end
