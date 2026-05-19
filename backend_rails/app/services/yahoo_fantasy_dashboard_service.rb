class YahooFantasyDashboardService
  LIVE_CACHE_TTL    = 3.minutes
  DEFAULT_CACHE_TTL = 15.minutes

  class << self
    def call(date: Date.current, refresh: false)
      cache_key = "yahoo_dashboard_#{date}"
      Rails.cache.delete(cache_key) if refresh

      cached = Rails.cache.read(cache_key)
      return cached.merge(cached: true) if cached

      result = fetch_dashboard(date: date)
      Rails.cache.write(cache_key, result, expires_in: cache_ttl) unless result[:error]
      result
    end

    private

    def cache_ttl
      hour = Time.current.in_time_zone("Eastern Time (US & Canada)").hour
      hour.between?(11, 23) ? LIVE_CACHE_TTL : DEFAULT_CACHE_TTL
    end

    def fetch_dashboard(date:)
      roster_result = YahooFantasyService.roster
      return roster_result if roster_result[:error]

      matchup_result = YahooFantasyService.current_matchup
      scores_result = YahooFantasyService.daily_player_scores(
        player_keys: Array(roster_result[:roster]).map { |player| player[:player_key] }
      )
      weekly_scores_result = if matchup_result[:error]
        { scores: {} }
      else
        YahooFantasyService.weekly_player_scores(
          player_keys: Array(roster_result[:roster]).map { |player| player[:player_key] },
          week_start: matchup_result[:week_start],
          week_end: matchup_result[:week_end],
          through_date: scores_result[:date]
        )
      end

      mlb = MlbApiService.new
      schedule = mlb.schedule(date.to_s)
      games = Array(schedule[:games])
      games_by_team = index_games_by_team(games)
      scores_by_player = scores_result[:error] ? {} : scores_result[:scores]
      weekly_scores_by_player = weekly_scores_result[:error] ? {} : weekly_scores_result[:scores]
      mlb_player_ids = resolve_mlb_ids(roster_result[:roster], mlb)

      roster = Array(roster_result[:roster]).map do |player|
        score_payload = scores_by_player[player[:player_key]] || { daily_points: 0.0, daily_stats: [] }
        weekly_payload = weekly_scores_by_player[player[:player_key]] || { week_points_breakdown: [], week_total: 0.0 }
        player.merge(matchup_payload(player[:team_abbr], games_by_team[player[:team_abbr]])).merge(score_payload).merge(weekly_payload).merge(
          mlbPlayerId: mlb_player_ids[player[:player_key]]
        )
      end

      game_pks = roster.filter_map { |player| player.dig(:matchup, :game_pk) }.uniq
      live_game_pks = roster.filter_map do |player|
        matchup = player[:matchup]
        matchup[:game_pk] if matchup && live_status?(matchup[:status])
      end.uniq

      {
        team_key: roster_result[:team_key],
        games_today: roster.count { |player| player[:game_today] },
        live_games: live_game_pks.size,
        total_games: game_pks.size,
        scoring_date: scores_result[:date],
        scoring_week_start: weekly_scores_result[:week_start],
        scoring_week_end: weekly_scores_result[:week_end],
        current_matchup: matchup_result[:error] ? nil : matchup_result,
        roster: roster
      }
    rescue => e
      { error: e.message }
    end

    def index_games_by_team(games)
      games.each_with_object(Hash.new { |hash, key| hash[key] = [] }) do |game, index|
        away_abbr = game.dig(:away, :abbreviation)
        home_abbr = game.dig(:home, :abbreviation)

        index[away_abbr] << game if away_abbr.present?
        index[home_abbr] << game if home_abbr.present?
      end
    end

    def matchup_payload(team_abbr, games)
      game = pick_game(team_abbr, games)
      return { game_today: false, matchup: nil } unless game

      away = game[:away] || {}
      home = game[:home] || {}
      is_home = home[:abbreviation] == team_abbr
      team_side = is_home ? home : away
      opponent_side = is_home ? away : home
      probable = is_home ? :homeProbable : :awayProbable
      opponent_probable = is_home ? :awayProbable : :homeProbable

      {
        game_today: true,
        matchup: {
          game_pk: game[:gamePk],
          status: game[:status],
          abstract_state: game[:abstractState],
          game_date: game[:gameDate],
          is_home: is_home,
          opponent: {
            id: opponent_side[:id],
            name: opponent_side[:name],
            abbreviation: opponent_side[:abbreviation],
            color: opponent_side[:color]
          },
          score: {
            team: team_side[:score],
            opponent: opponent_side[:score]
          },
          probable_pitchers: {
            team: game.dig(probable, :name),
            opponent: game.dig(opponent_probable, :name)
          }
        }
      }
    end

    def pick_game(team_abbr, games)
      return nil if team_abbr.blank? || games.blank?

      games.min_by do |game|
        [game_priority(game[:status]), game[:gameDate].to_s]
      end
    end

    def game_priority(status)
      return 0 if live_status?(status)
      return 1 if status.to_s.include?('Pre-Game')
      return 2 if status.to_s.match?(/Scheduled|Preview/)
      return 3 if status.to_s.match?(/Final|Game Over|Completed/)

      4
    end

    def live_status?(status)
      status.to_s.match?(/Progress|Warmup|Review/)
    end

    def resolve_mlb_ids(roster, mlb)
      roster.each_with_object({}) do |player, map|
        next unless player[:name].present?

        results = mlb.search_players(player[:name])
        next if results.empty?

        name = player[:name].to_s.downcase.strip
        team_abbr = player[:team_abbr].to_s.downcase.strip
        team_name = player[:team].to_s.downcase.strip

        exact = results.select { |r| r[:name].to_s.downcase.strip == name }
        team_match = exact.find { |r| r[:team].to_s.downcase.strip == team_name || r[:team].to_s.downcase.strip.include?(team_abbr) }

        match = team_match || exact.first || results.first
        map[player[:player_key]] = match[:id] if match
      end
    rescue StandardError
      {}
    end
  end
end
