class YahooFantasyService
  BASE_URL   = 'https://fantasysports.yahooapis.com/fantasy/v2'.freeze
  AUTH_URL   = 'https://api.login.yahoo.com/oauth2/request_auth'.freeze
  TOKEN_URL  = 'https://api.login.yahoo.com/oauth2/get_token'.freeze
  TOKEN_FILE = Rails.root.join('tmp', 'yahoo_tokens.json').freeze
  GAME_CODE    = 'mlb'.freeze
  class << self
    def auth_url
      query = URI.encode_www_form(
        client_id:     ENV.fetch('YAHOO_CLIENT_ID'),
        redirect_uri:  redirect_uri,
        response_type: 'code',
        language:      'en-us'
      )
      "#{AUTH_URL}?#{query}"
    end

    def exchange_code(code)
      resp = token_conn.post(TOKEN_URL) do |req|
        req.body = URI.encode_www_form(token_params(
          grant_type:   'authorization_code',
          code:         code.strip,
          redirect_uri: redirect_uri,
        ))
      end
      save_tokens(JSON.parse(resp.body))
      { success: true }
    rescue => e
      { error: e.message }
    end

    def authenticated?
      tokens = load_tokens
      tokens&.key?('refresh_token') && !tokens['refresh_token'].to_s.empty?
    end

    def roster
      context = team_context
      return context if context[:error]

      team_key = context[:team_key]
      return { error: 'Could not find your team in this league. Check YAHOO_LEAGUE_ID.' } unless team_key

      players = fetch_roster(context[:access_token], team_key)
      { team_key: team_key, roster: players }
    rescue => e
      { error: e.message }
    end

    def current_matchup
      context = team_context
      return context if context[:error]

      resp = api_conn(context[:access_token]).get(
        "#{BASE_URL}/team/#{context[:team_key]}/matchups;weeks=current",
        format: 'json'
      )

      parse_current_matchup(JSON.parse(resp.body), context[:team_key])
    rescue => e
      { error: e.message }
    end

    def scoring_settings
      context = team_context
      return context if context[:error]

      resp = api_conn(context[:access_token]).get(
        "#{BASE_URL}/league/#{context[:league_key]}/settings",
        format: 'json'
      )

      parse_scoring_settings(JSON.parse(resp.body))
    rescue => e
      { error: e.message }
    end

    def daily_player_scores(player_keys:, date: nil)
      keys = Array(player_keys).compact_blank
      return { date: date, scores: {} } if keys.empty?

      settings = scoring_settings
      return settings if settings[:error]

      score_date = (date || settings[:current_date]).to_s
      context = team_context
      return context if context[:error]

      resp = api_conn(context[:access_token]).get(
        "#{BASE_URL}/players;player_keys=#{keys.join(',')}/stats;type=date;date=#{score_date}",
        format: 'json'
      )

      {
        date: score_date,
        scores: parse_daily_player_scores(JSON.parse(resp.body), settings)
      }
    rescue => e
      { error: e.message }
    end

    def weekly_player_scores(player_keys:, week_start:, week_end:, through_date: nil)
      keys = Array(player_keys).compact_blank
      return { scores: {}, week_start: week_start, week_end: week_end, scoring_through: through_date } if keys.empty?

      settings = scoring_settings
      return settings if settings[:error]

      context = team_context
      return context if context[:error]

      start_date = Date.parse(week_start.to_s)
      raw_end_date = Date.parse(week_end.to_s)
      scoring_through = Date.parse((through_date || settings[:current_date]).to_s)

      dates = (start_date..raw_end_date).to_a
      fetch_dates = dates.select { |d| d <= scoring_through }

      scores = keys.index_with do
        {
          week_points_breakdown: dates.map { |date| { date: date.iso8601, points: 0.0 } },
          week_total: 0.0
        }
      end

      fetch_dates.each do |date|
        batch_daily_scores(context[:access_token], settings, keys, date.iso8601).each do |player_key, score_data|
          next unless scores[player_key]

          scores[player_key][:week_points_breakdown].find { |entry| entry[:date] == date.iso8601 }[:points] = score_data[:daily_points]
          scores[player_key][:week_total] = (scores[player_key][:week_total] + score_data[:daily_points].to_f).round(2)
        end
      end

      {
        week_start: start_date.iso8601,
        week_end: raw_end_date.iso8601,
        scoring_through: scoring_through.iso8601,
        scores: scores
      }
    rescue => e
      { error: e.message }
    end

    def free_agents(limit: 12)
      context = team_context
      return context if context[:error]

      resp = api_conn(context[:access_token]).get(
        "#{BASE_URL}/league/#{context[:league_key]}/players;status=FA;sort=AR;sdir=1;count=#{limit.to_i};start=0;out=stats,ownership",
        format: 'json'
      )

      { players: parse_free_agents(JSON.parse(resp.body)) }
    rescue => e
      { error: e.message }
    end

    def search_player(name:, team_abbr: nil)
      context = team_context
      return context if context[:error]

      resp = api_conn(context[:access_token]).get(
        "#{BASE_URL}/league/#{context[:league_key]}/players;search=#{CGI.escape(name)}",
        format: "json"
      )

      players = parse_free_agents(JSON.parse(resp.body))
      return nil if players.empty?

      name_lower = name.downcase.strip
      team_lower = team_abbr&.downcase&.strip

      matched = players.find { |p| p[:name]&.downcase == name_lower && (team_lower.nil? || p[:team_abbr]&.downcase == team_lower) }
      matched ||= players.find { |p| p[:name]&.downcase.include?(name_lower) || name_lower.include?(p[:name]&.downcase.to_s) }
      matched ||= players.first
      matched
    rescue => e
      { error: e.message }
    end

    def player_fantasy_data(name:, team_abbr:)
      search = search_player(name: name, team_abbr: team_abbr)
      return search if search[:error]
      return { found: false } unless search

      player_key = search[:player_key]

      settings = scoring_settings
      return settings if settings[:error]

      current_date = settings[:current_date].to_s
      week_start = Date.parse(current_date).beginning_of_week(:sunday).iso8601
      week_end   = Date.parse(current_date).end_of_week(:sunday).iso8601

      daily   = daily_player_scores(player_keys: [player_key])
      return daily if daily[:error]

      weekly  = weekly_player_scores(player_keys: [player_key], week_start: week_start, week_end: week_end)

      player_scores  = daily[:scores][player_key] || {}
      weekly_scores  = weekly[:scores][player_key] || {}

      {
        found: true,
        playerKey: player_key,
        name: search[:name],
        position: search[:position],
        team: search[:team],
        teamAbbr: search[:team_abbr],
        seasonPoints: search[:season_points],
        dailyPoints:  player_scores[:daily_points],
        dailyStats:   player_scores[:daily_stats],
        weeklyPoints: weekly_scores[:week_total],
        weekPointsBreakdown: weekly_scores[:week_points_breakdown],
        scoringDate: daily[:date],
        weekStart: weekly[:week_start],
        weekEnd: weekly[:week_end]
      }
    end

    private

    def team_context
      league_id = ENV['YAHOO_LEAGUE_ID']
      return { error: 'YAHOO_LEAGUE_ID not configured in .env' } unless league_id

      token_result = current_access_token
      return token_result if token_result[:error]

      access_token = token_result[:access_token]
      league_key = "#{GAME_CODE}.l.#{league_id}"
      team_key = fetch_team_key(access_token, league_key, league_id)

      {
        access_token: access_token,
        league_id: league_id,
        league_key: league_key,
        team_key: team_key
      }
    end

    def fetch_team_key(access_token, league_key, league_id)
      resp = api_conn(access_token).get(
        "#{BASE_URL}/users;use_login=1/games;game_codes=#{GAME_CODE}/leagues;league_keys=#{league_key}/teams",
        format: 'json'
      )
      extract_team_key(JSON.parse(resp.body), league_id)
    end

    def fetch_roster(access_token, team_key)
      resp = api_conn(access_token).get(
        "#{BASE_URL}/team/#{team_key}/roster;out=players",
        format: 'json'
      )
      parse_roster(JSON.parse(resp.body))
    end

    def extract_team_key(data, target_league_id)
      user = yahoo_dig(data, 'fantasy_content', 'users', 0, 'user')
      return nil unless user.is_a?(Array)

      games = yahoo_dig(user, 1, 'games')
      return nil unless games.is_a?(Hash)

      games.each_value do |game_entry|
        next unless game_entry.is_a?(Hash)

        game = game_entry['game']
        next unless game.is_a?(Array)

        leagues = yahoo_dig(game, 1, 'leagues')
        next unless leagues.is_a?(Hash)

        leagues.each_value do |league_entry|
          next unless league_entry.is_a?(Hash)

          league = league_entry['league']
          next unless league.is_a?(Array)
          next unless yahoo_dig(league, 0, 'league_id').to_s == target_league_id.to_s

          teams = yahoo_dig(league, 1, 'teams')
          next unless teams.is_a?(Hash)

          count = teams['count'].to_i
          (0...count).each do |i|
            team_attrs = yahoo_dig(teams, i, 'team', 0)
            next unless team_attrs.is_a?(Array)

            team_key = team_attrs.find { |item| item.is_a?(Hash) && item['team_key'] }&.dig('team_key')
            return team_key if team_key
          end
        end
      end

      nil
    end

    def parse_roster(data)
      team = yahoo_dig(data, 'fantasy_content', 'team')
      return [] unless team.is_a?(Array)

      players_hash = yahoo_dig(team, 1, 'roster', 0, 'players')
      return [] unless players_hash.is_a?(Hash)

      count = players_hash['count'].to_i
      (0...count).filter_map do |i|
        player_wrap = yahoo_dig(players_hash, i, 'player')
        next unless player_wrap.is_a?(Array)

        attrs_arr  = player_wrap[0]
        status_obj = player_wrap[1]
        next unless attrs_arr.is_a?(Array)

        attrs = attrs_arr.each_with_object({}) do |item, h|
          h.merge!(item) if item.is_a?(Hash)
        end

        selected_position = yahoo_dig(status_obj, 'selected_position', 1, 'position')

        {
          player_key:         attrs['player_key'],
          player_id:          attrs['player_id'],
          name:               extract_name(attrs['name']),
          team:               attrs['editorial_team_full_name'],
          team_abbr:          attrs['editorial_team_abbr'],
          position:           attrs['display_position'],
          eligible_positions: extract_eligible_positions(attrs['eligible_positions']),
          selected_position:  selected_position,
          status:             attrs['status'].presence,
          status_full:        attrs['status_full'].presence,
          image_url:          attrs['image_url'],
        }.compact
      end
    end

    def parse_current_matchup(data, team_key)
      matchup = yahoo_dig(data, 'fantasy_content', 'team', 1, 'matchups', 0, 'matchup')
      return { error: 'No current matchup found.' } unless matchup.is_a?(Hash)

      teams = yahoo_dig(matchup, 0, 'teams')
      return { error: 'Current matchup teams unavailable.' } unless teams.is_a?(Hash)

      parsed_teams = teams.each_with_object([]) do |(key, value), arr|
        next if key.to_s == 'count'

        team = parse_matchup_team(yahoo_dig(value, 'team'))
        arr << team if team
      end

      my_team = parsed_teams.find { |team| team[:team_key] == team_key }
      opponent = parsed_teams.find { |team| team[:team_key] != team_key }

      {
        week: matchup['week'].to_i,
        week_start: matchup['week_start'],
        week_end: matchup['week_end'],
        status: matchup['status'],
        is_tied: matchup['is_tied'] == 1 || matchup['is_tied'] == '1',
        winner_team_key: matchup['winner_team_key'],
        my_team: my_team,
        opponent: opponent
      }
    end

    def parse_scoring_settings(data)
      settings = yahoo_dig(data, 'fantasy_content', 'league', 1, 'settings', 0)
      return { error: 'League settings unavailable.' } unless settings.is_a?(Hash)

      categories = Array(yahoo_dig(settings, 'stat_categories', 'stats')).filter_map do |entry|
        stat = entry['stat'] || entry[:stat]
        next unless stat.is_a?(Hash)

        [stat['stat_id'].to_s, {
          name: stat['name'],
          display_name: stat['display_name'],
          abbr: stat['abbr'],
          position_type: stat['position_type'],
          display_only: stat['is_only_display_stat'] == '1'
        }]
      end.to_h

      modifiers = Array(yahoo_dig(settings, 'stat_modifiers', 'stats')).filter_map do |entry|
        stat = entry['stat'] || entry[:stat]
        next unless stat.is_a?(Hash)

        value = numeric_value(stat['value'])
        next if value.nil?

        [stat['stat_id'].to_s, value]
      end.to_h

      {
        current_date: yahoo_dig(data, 'fantasy_content', 'league', 0, 'current_date'),
        scoring_type: settings['scoring_type'],
        stat_categories: categories,
        stat_modifiers: modifiers
      }
    end

    def parse_daily_player_scores(data, settings)
      players = yahoo_dig(data, 'fantasy_content', 'players')
      return {} unless players.is_a?(Hash)

      players.each_with_object({}) do |(key, value), scores|
        next if key.to_s == 'count'

        player = yahoo_dig(value, 'player')
        next unless player.is_a?(Array)

        attrs = Array(player[0]).each_with_object({}) do |item, hash|
          hash.merge!(item) if item.is_a?(Hash)
        end
        stat_rows = Array(yahoo_dig(player, 1, 'player_stats', 'stats'))

        scores[attrs['player_key']] = {
          daily_points: calculate_daily_points(stat_rows, settings[:stat_modifiers]),
          daily_stats: extract_daily_stats(stat_rows, settings[:stat_categories], settings[:stat_modifiers])
        }
      end
    end

    def batch_daily_scores(access_token, settings, player_keys, date)
      Array(player_keys).each_slice(12).each_with_object({}) do |slice, result|
        resp = api_conn(access_token).get(
          "#{BASE_URL}/players;player_keys=#{slice.join(',')}/stats;type=date;date=#{date}",
          format: 'json'
        )

        result.merge!(parse_daily_player_scores(JSON.parse(resp.body), settings))
      end
    end

    def parse_free_agents(data)
      players = yahoo_dig(data, 'fantasy_content', 'league', 1, 'players')
      return [] unless players.is_a?(Hash)

      players.each_with_object([]) do |(key, value), result|
        next if key.to_s == 'count'

        player = yahoo_dig(value, 'player')
        parsed = parse_free_agent_player(player)
        result << parsed if parsed
      end
    end

    def parse_free_agent_player(player)
      return nil unless player.is_a?(Array)

      attrs = Array(player[0]).each_with_object({}) do |item, hash|
        hash.merge!(item) if item.is_a?(Hash)
      end
      extra = player[1].is_a?(Hash) ? player[1] : {}
      season_stats = player[2].is_a?(Hash) ? player[2] : {}
      ownership = player[3].is_a?(Hash) ? player[3] : {}

      {
        player_key: attrs['player_key'],
        player_id: attrs['player_id'],
        name: extract_name(attrs['name']),
        team: attrs['editorial_team_full_name'],
        team_abbr: attrs['editorial_team_abbr'],
        position: attrs['display_position'],
        primary_position: attrs['primary_position'],
        eligible_positions: extract_eligible_positions(attrs['eligible_positions']),
        image_url: attrs['image_url'],
        season_points: yahoo_dig(season_stats, 'player_points', 'total'),
        season_stats: extract_season_stats(yahoo_dig(season_stats, 'player_stats', 'stats')),
        ownership_type: yahoo_dig(ownership, 'ownership', 'ownership_type'),
        is_starting_today: yahoo_dig(extra, 'starting_status', 1, 'is_starting') == 1,
        batting_order: yahoo_dig(extra, 'batting_order', 0, 'order_num')
      }.compact
    end

    def extract_season_stats(stat_rows)
      Array(stat_rows).filter_map do |entry|
        stat = entry['stat'] || entry[:stat] || {}
        stat_id = stat['stat_id'].to_s

        case stat_id
        when '7', '9', '10', '11', '12', '13', '16', '18', '20', '28', '32', '33', '34', '37', '39', '41', '42'
          { stat_id: stat_id, value: stat['value'] }
        end
      end
    end

    def calculate_daily_points(stat_rows, modifiers)
      total = stat_rows.sum do |entry|
        stat = entry['stat'] || entry[:stat] || {}
        modifier = modifiers[stat['stat_id'].to_s]
        next 0 unless modifier

        value = numeric_value(stat['value'])
        next 0 if value.nil?

        modifier * value
      end

      total.round(2)
    end

    def extract_daily_stats(stat_rows, categories, modifiers)
      stat_rows.filter_map do |entry|
        stat = entry['stat'] || entry[:stat] || {}
        stat_id = stat['stat_id'].to_s
        category = categories[stat_id]
        value = numeric_value(stat['value'])
        next unless category && modifiers.key?(stat_id) && !value.nil? && value != 0

        {
          stat_id: stat_id,
          label: category[:display_name] || category[:abbr] || category[:name],
          value: value,
          points: (modifiers[stat_id] * value).round(2)
        }
      end
    end

    def numeric_value(value)
      return nil if value.nil? || value == false

      str = value.to_s.strip
      return nil if str.empty? || str == '-'

      Float(str)
    rescue ArgumentError, TypeError
      nil
    end

    def parse_matchup_team(team)
      return nil unless team.is_a?(Array)

      meta = Array(team[0])
      details = team[1].is_a?(Hash) ? team[1] : {}
      attrs = meta.each_with_object({}) { |item, hash| hash.merge!(item) if item.is_a?(Hash) }

      {
        team_key: attrs['team_key'],
        team_id: attrs['team_id'],
        name: attrs['name'],
        logo_url: yahoo_dig(attrs['team_logos'], 0, 'team_logo', 'url'),
        manager_nickname: yahoo_dig(attrs['managers'], 0, 'manager', 'nickname'),
        points: yahoo_dig(details, 'team_points', 'total'),
        projected_points: yahoo_dig(details, 'team_projected_points', 'total'),
        live_projected_points: yahoo_dig(details, 'team_live_projected_points', 'total'),
        remaining_games: yahoo_dig(details, 'team_remaining_games', 'total', 'remaining_games'),
        live_games: yahoo_dig(details, 'team_remaining_games', 'total', 'live_games'),
        completed_games: yahoo_dig(details, 'team_remaining_games', 'total', 'completed_games')
      }.compact
    end

    def yahoo_dig(container, *keys)
      keys.reduce(container) do |value, key|
        case value
        when Array
          index = key.is_a?(Integer) ? key : Integer(key, exception: false)
          index.nil? ? nil : value[index]
        when Hash
          value[key] || value[key.to_s]
        else
          nil
        end
      end
    end

    def extract_name(name)
      return name['full'] if name.is_a?(Hash)
      return nil unless name.is_a?(Array)

      name.find { |item| item.is_a?(Hash) && item['full'] }&.dig('full')
    end

    def extract_eligible_positions(eligible_positions)
      positions = case eligible_positions
                  when Array
                    eligible_positions
                  when Hash
                    eligible_positions.values
                  else
                    []
                  end

      positions.filter_map { |position| position['position'] if position.is_a?(Hash) }.join(', ')
    end

    def current_access_token
      tokens = load_tokens
      return { error: 'Not authenticated. Use the auth flow to connect Yahoo Fantasy.' } unless tokens&.key?('refresh_token')

      if tokens['expires_at'].to_i <= Time.now.to_i + 60
        do_refresh(tokens['refresh_token'])
      else
        { access_token: tokens['access_token'] }
      end
    end

    def do_refresh(refresh_token)
      resp = token_conn.post(TOKEN_URL) do |req|
        req.body = URI.encode_www_form(token_params(
          grant_type:    'refresh_token',
          refresh_token: refresh_token,
        ))
      end
      data = JSON.parse(resp.body)
      # Yahoo doesn't always issue a new refresh_token — preserve the existing one if absent
      data['refresh_token'] ||= refresh_token
      save_tokens(data)
      { access_token: data['access_token'] }
    rescue => e
      { error: "Token refresh failed: #{e.message}" }
    end

    def redirect_uri
      ENV.fetch('YAHOO_REDIRECT_URI')
    end

    def token_params(extra)
      params = { client_id: ENV.fetch('YAHOO_CLIENT_ID') }.merge(extra)
      secret = ENV['YAHOO_CLIENT_SECRET']
      params[:client_secret] = secret if secret && !secret.empty?
      params
    end

    def token_conn
      Faraday.new do |f|
        f.request :retry, max: 2, interval: 1.0
        f.response :raise_error
        f.options.timeout      = 15
        f.options.open_timeout = 10
        f.headers['Content-Type'] = 'application/x-www-form-urlencoded'
      end
    end

    def api_conn(access_token)
      Faraday.new do |f|
        f.request :retry, max: 2, interval: 1.0
        f.response :raise_error
        f.options.timeout      = 15
        f.options.open_timeout = 10
        f.headers['Authorization'] = "Bearer #{access_token}"
      end
    end

    def load_tokens
      return nil unless File.exist?(TOKEN_FILE)
      JSON.parse(File.read(TOKEN_FILE))
    rescue JSON::ParserError
      nil
    end

    def save_tokens(data)
      existing = load_tokens || {}
      tokens = {
        'access_token'  => data['access_token'],
        'refresh_token' => data['refresh_token'] || existing['refresh_token'],
        'expires_at'    => Time.now.to_i + data['expires_in'].to_i,
      }
      File.write(TOKEN_FILE, JSON.generate(tokens))
    end
  end
end
