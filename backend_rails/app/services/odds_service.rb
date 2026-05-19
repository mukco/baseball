class OddsService
  SCOREBOARD_URL = 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard'.freeze
  ODDS_BASE      = 'https://sports.core.api.espn.com/v2/sports/baseball/leagues/mlb'.freeze

  CACHE_TTL = 5.minutes

  class << self
    def today(date: nil)
      date_str = date.presence || Date.current.iso8601
      cache_key = "espn_odds_#{date_str}"

      Rails.cache.fetch(cache_key, expires_in: CACHE_TTL) do
        fetch_today(date_str)
      end
    rescue => e
      { error: e.message }
    end

    private

    def fetch_today(date_str)
      scoreboard_url = "#{SCOREBOARD_URL}?dates=#{date_str.delete('-')}"
      scoreboard_conn = Faraday.new do |f|
        f.request  :retry, max: 2, interval: 1.0
        f.response :raise_error
        f.options.timeout      = 15
        f.options.open_timeout = 10
      end
      scoreboard_resp = scoreboard_conn.get(scoreboard_url)
      scoreboard = JSON.parse(scoreboard_resp.body)
      events = Array(scoreboard['events'])

      games = events.map { |event| parse_scoreboard_event(event) }

      # Fetch odds only for games that are not final (Preview or Live)
      non_final = games.select { |g| g[:status] != 'Final' }
      odds_results = parallel_odds(non_final)
      odds_by_id = odds_results.each_with_object({}) do |result, map|
        map[result[:competition_id]] = result if result
      end

      games_with_odds = games.map do |game|
        odds = odds_by_id[game[:competition_id]]
        game.merge(odds_data: odds)
      end

      {
        fetched_at: Time.current.iso8601,
        games: games_with_odds
      }
    end

    def parse_scoreboard_event(event)
      competition = Array(event['competitions']).first || {}
      competitors = Array(competition['competitors'])
      away = competitors.find { |c| c['homeAway'] == 'away' } || {}
      home = competitors.find { |c| c['homeAway'] == 'home' } || {}
      status = competition.dig('status', 'type', 'name') || ''

      abstract = case status
                 when 'STATUS_SCHEDULED', 'STATUS_PRE_GAME' then 'Preview'
                 when 'STATUS_IN_PROGRESS', 'STATUS_HALFTIME' then 'Live'
                 else 'Final'
                 end

      {
        competition_id: competition['id'].to_s,
        event_id: event['id'].to_s,
        home_team: home.dig('team', 'displayName') || home.dig('team', 'name'),
        away_team: away.dig('team', 'displayName') || away.dig('team', 'name'),
        home_abbrev: home.dig('team', 'abbreviation'),
        away_abbrev: away.dig('team', 'abbreviation'),
        status: abstract,
        score: abstract != 'Preview' ? {
          home: home.dig('score')&.to_i,
          away: away.dig('score')&.to_i
        } : nil
      }
    end

    def parallel_odds(games)
      return [] if games.empty?

      conn = Faraday.new do |f|
        f.request  :retry, max: 2, interval: 1.0
        f.response :raise_error
        f.options.timeout      = 10
        f.options.open_timeout = 5
      end

    games.map do |game|
      cid = game[:competition_id]
      eid = game[:event_id]
      url = "#{ODDS_BASE}/events/#{eid}/competitions/#{cid}/odds"

      resp = conn.get(url)
      data = JSON.parse(resp.body)
      odds = parse_odds_response(data, game)
      odds ? odds.merge(competition_id: cid) : nil
      rescue => e
        Rails.logger.warn("OddsService: failed for #{game[:away_team]} @ #{game[:home_team]}: #{e.message}")
        nil
      end
    end

    def parse_odds_response(data, game)
      items = Array(data['items'])
      return nil if items.empty?

      entry = items.first
      provider = entry.dig('provider', 'name')

      home_ml = entry.dig('homeTeamOdds', 'current', 'moneyLine', 'american')
      away_ml = entry.dig('awayTeamOdds', 'current', 'moneyLine', 'american')
      spread = entry['spread']
      over_under = entry['overUnder']
      over_odds = entry['overOdds']
      under_odds = entry['underOdds']

      # details is a string like "PIT -180"
      ml_details = entry['details']

      {
        provider: provider,
        moneyline: ml_details,
        home_moneyline: home_ml,
        away_moneyline: away_ml,
        spread: spread,
        over_under: over_under,
        over_odds: over_odds,
        under_odds: under_odds
      }
    end
  end
end
