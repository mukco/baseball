class Api::SimulationsController < Api::BaseController
  before_action :load_league, only: %i[show destroy sync simulate_day simulate_through simulate_game schedule roster update_roster game_show probabilities game_insights analysis job_status stats team_player_stats player_stats simulate_season seed_playoffs simulate_playoff_round playoffs season_insights player_insights team_insights awards generate_awards playoff_awards generate_playoff_awards news news_calendar]

  def index
    leagues = SimulationLeague.recent.includes(:projection_scenario)
    render json: { leagues: leagues.map { |l| SimulationService.serialize_league(l) } }
  end

  def create
    result = SimulationService.setup_league(
      name:                 params.require(:name),
      season:               params[:season]&.to_i || Date.today.year,
      scenario_id:          params[:scenario_id]&.to_i.presence,
      batter_pitcher_blend: params[:batter_pitcher_blend]&.to_f || 0.45,
      mode:                 params[:mode]&.to_sym || :live
    )
    render json: result
  end

  def show
    render json: SimulationService.league_state(@league)
  end

  def destroy
    @league.destroy!
    render json: { ok: true }
  end

  def sync
    through = params[:through_date] ? Date.parse(params[:through_date]) : Date.today
    render json: SimulationService.sync_real_results(@league, through_date: through)
  end

  def simulate_day
    date = params[:date] ? Date.parse(params[:date]) : (@league.current_sim_date || Date.today)

    unless SimulationService.live_mode?(@league)
      earliest = @league.simulation_games
                        .where(simulated_at: nil)
                        .where.not(home_team_id: nil)
                        .minimum(:game_date)
      if earliest && earliest < date
        return render json: { error: "Cannot simulate #{date} — unplayed games exist on #{earliest}. Use 'Sim to Here' to sim in order." },
                      status: :unprocessable_entity
      end
    end

    job_run = SimulationJobRun.create!(
      simulation_league: @league,
      job_type:          "simulate_day",
      sim_date:          date,
      status:            "pending"
    )
    SimulateDayJob.perform_later(job_run.id)
    render json: { job_id: job_run.id, status: "pending", date: date.to_s }
  end

  def job_status
    job_run = ActiveRecord::Base.uncached { @league.simulation_job_runs.find(params[:job_id]) }
    render json: job_run
  end

  def simulate_game
    game = @league.simulation_games.find(params[:game_id])

    unless SimulationService.live_mode?(@league)
      earliest = @league.simulation_games
                        .where(simulated_at: nil)
                        .where.not(home_team_id: nil)
                        .where('game_date < ?', game.game_date)
                        .minimum(:game_date)
      if earliest
        return render json: { error: "Cannot simulate this game — unplayed games exist on #{earliest}. Use 'Sim to Here' to sim in order." },
                      status: :unprocessable_entity
      end
    end

    render json: SimulationService.simulate_game(@league, game)
  end

  def game_show
    game = @league.simulation_games.find(params[:game_id])
    bs   = game.box_score
    render json: {
      game:      SimulationService.serialize_game(game),
      box_score: bs,
    }
  end

  def probabilities
    game = @league.simulation_games.find(params[:game_id])
    runs = (params[:runs] || 100).to_i
    render json: SimulationService.game_probabilities(@league, game, runs: runs)
  end

  def game_insights
    game    = @league.simulation_games.find(params[:game_id])
    refresh = params[:refresh] == "true"
    render json: SimulationGameInsightsService.call(game_id: game.id, refresh: refresh)
  end

  def analysis
    render json: SimulationService.season_accuracy(@league)
  end

  def schedule
    date = params[:date] ? Date.parse(params[:date]) : (@league.current_sim_date || Date.today)
    render json: SimulationService.schedule_for_date(@league, date)
  end

  def roster
    roster = @league.simulation_rosters.find_by!(team_id: params[:team_id])

    active_injuries = @league.simulation_injuries
                              .active
                              .for_team(params[:team_id].to_i)
    injured_map = active_injuries.index_by(&:player_id)

    ratings = SimulationService.live_mode?(@league) ? {} : PlayerRatingService.ratings_for_league(@league)

    render json: {
      team_id:       roster.team_id,
      team_name:     roster.team_name,
      team_abbr:     roster.team_abbr,
      team_color:    roster.team_color,
      roster:        roster.roster,
      lineup_order:  roster.lineup_order,
      rotation:      roster.rotation,
      bullpen_roles: JSON.parse(roster.bullpen_roles_json || '{}'),
      pitcher_state: roster.pitcher_state,
      injured_player_ids: injured_map.keys,
      injuries: injured_map.transform_values { |i|
        { severity: i.severity, il_end_date: i.il_end_date.to_s, days_remaining: i.days_remaining(Date.today) }
      },
      ratings: ratings,
    }
  end

  def update_roster
    if SimulationService.live_mode?(@league)
      return render json: { error: "Roster edits are not allowed in live mode — lineups are taken from the actual MLB games." }
    end

    data = {}
    data[:lineup_order]  = params[:lineup_order].map(&:to_i) if params[:lineup_order]
    data[:rotation]      = params[:rotation].map(&:to_i)     if params[:rotation]
    data[:bullpen_roles] = params[:bullpen_roles].to_unsafe_h.transform_keys(&:to_sym).tap do |r|
      r[:closer_id]    = r[:closer_id].to_i.presence
      r[:setup_ids]    = Array(r[:setup_ids]).map(&:to_i)
      r[:long_ids]     = Array(r[:long_ids]).map(&:to_i)
    end if params[:bullpen_roles]
    PlayerRatingService.invalidate(@league)
    render json: SimulationService.update_roster(@league, params[:team_id], data)
  end

  def stats
    render json: SimulationService.season_stats(@league)
  end

  def injuries
    render json: SimulationService.injuries_and_transactions(@league, team_id: params[:team_id])
  end

  def team_player_stats
    render json: SimulationService.team_player_stats(@league, params[:team_id].to_i)
  end

  def player_stats
    render json: SimulationService.player_season_stats(@league, params[:player_id].to_i)
  end

  def season_insights
    refresh = params[:refresh] == "true"
    render json: SimulationSeasonInsightService.call(league: @league, refresh: refresh)
  end

  def player_insights
    refresh = params[:refresh] == "true"
    render json: SimulationPlayerInsightService.call(league: @league, player_id: params[:player_id].to_i, refresh: refresh)
  end

  def team_insights
    refresh = params[:refresh] == "true"
    render json: SimulationTeamInsightService.call(league: @league, team_id: params[:team_id].to_i, refresh: refresh)
  end

  def simulate_through
    through_date = Date.parse(params[:through_date])
    job_run = SimulationJobRun.create!(
      simulation_league: @league,
      job_type:          "simulate_through",
      sim_date:          through_date,
      status:            "pending"
    )
    SimulateThroughJob.perform_later(job_run.id)
    render json: { job_id: job_run.id, status: "pending" }
  rescue ArgumentError
    render json: { error: "Invalid date" }, status: :unprocessable_entity
  end

  def simulate_season
    job_run = SimulationJobRun.create!(
      simulation_league: @league,
      job_type:          "simulate_season",
      sim_date:          @league.current_sim_date || Date.today,
      status:            "pending"
    )
    SimulateSeasonJob.perform_later(job_run.id)
    render json: { job_id: job_run.id, status: "pending" }
  end

  def seed_playoffs
    render json: PlayoffSimulationService.seed_playoffs(@league)
  end

  def simulate_playoff_round
    round = params[:round]
    render json: PlayoffSimulationService.simulate_round(@league, round)
  end

  def playoffs
    render json: PlayoffSimulationService.bracket_state(@league)
  end

  def awards
    data = AwardService.awards_data(@league)
    render json: data ? { generated: true, awards: data } : { generated: false }
  end

  def generate_awards
    job_run = SimulationJobRun.create!(
      simulation_league: @league,
      job_type:          "generate_awards",
      sim_date:          Date.today,
      status:            "pending"
    )
    GenerateAwardsJob.perform_later(job_run.id)
    render json: { job_id: job_run.id, status: "pending" }
  end

  def news
    page = (params[:page] || 1).to_i
    per  = (params[:per]  || 14).to_i.clamp(1, 30)

    scope   = @league.simulation_news_stories.order(story_date: :desc)
    total   = scope.count
    records = scope.offset((page - 1) * per).limit(per)

    render json: {
      stories:  records.map { |s| serialize_news_story(s) },
      total:    total,
      page:     page,
      per:      per,
      has_more: (page * per) < total,
    }
  end

  def news_calendar
    season_start = @league.simulation_games.minimum(:game_date)
    season_end   = @league.simulation_games.maximum(:game_date)

    sim_dates = @league.simulation_games
                       .where.not(simulated_at: nil)
                       .group(:game_date)
                       .count
                       .transform_keys(&:to_s)

    stories = @league.simulation_news_stories
                     .order(:story_date)
                     .each_with_object({}) { |s, h| h[s.story_date.to_s] = serialize_news_story(s) }

    games_by_date = @league.simulation_games
                           .where.not(simulated_at: nil)
                           .order(:game_date)
                           .pluck(:game_date, :id, :home_team_abbr, :away_team_abbr, :home_score, :away_score)
                           .each_with_object({}) do |(date, id, ha, aa, hs, as_score), h|
                             (h[date.to_s] ||= []) << { id: id, home: ha, away: aa, home_score: hs, away_score: as_score }
                           end

    render json: {
      season_start:     season_start&.to_s,
      season_end:       season_end&.to_s,
      current_sim_date: @league.current_sim_date&.to_s,
      sim_dates:        sim_dates,
      stories:          stories,
      games_by_date:    games_by_date,
      notable:          notable_calendar_dates(@league.season, season_start),
    }
  end

  def playoff_awards
    data = PlayoffAwardService.playoff_awards_data(@league)
    render json: data ? { generated: true, awards: data } : { generated: false }
  end

  def generate_playoff_awards
    result = PlayoffAwardService.generate_playoff_awards(@league)
    if result[:error]
      render json: result, status: :unprocessable_entity
    else
      render json: { generated: true, awards: result }
    end
  end

  private

  def load_league
    @league = SimulationLeague.includes(:projection_scenario).find(params[:id])
  end

  def notable_calendar_dates(year, season_start)
    dates = [
      { date: "#{year}-07-14", type: "all_star",         label: "All-Star Break"    },
      { date: "#{year}-07-31", type: "trade_deadline",   label: "Trade Deadline"    },
      { date: "#{year}-09-01", type: "roster_expansion", label: "Roster Expansion"  },
      { date: "#{year}-12-11", type: "rule5_draft",      label: "Rule 5 Draft"      },
      { date: "#{year}-12-08", type: "winter_meetings",  label: "Winter Meetings"   },
    ]
    dates.unshift({ date: season_start.to_s, type: "opening_day", label: "Opening Day" }) if season_start
    dates
  end

  def serialize_news_story(story)
    {
      id:           story.id,
      date:         story.story_date.to_s,
      headline:     story.headline,
      stories:      story.stories,
      player_refs:  story.player_refs,
      games_count:  story.games_count,
      ai_generated: story.ai_generated,
    }
  end
end
