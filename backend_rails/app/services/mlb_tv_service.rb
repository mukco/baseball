require "json"
require "net/http"
require "uri"

class MlbTvService
  EPG_HOST = "https://mastapi.mobile.mlbinfra.com".freeze

  class << self
    def call(game_pk:)
      game_pk = game_pk.to_i
      result  = fetch_result(game_pk)

      feeds                  = Array(result["videoFeeds"]).map { |feed| normalize_feed(feed) }
      default_feed           = feeds.find { |feed| feed[:type] == "HOME" } || feeds.first
      provider_auth_required = feeds.any? { |feed| feed[:providerAuthRequired] }
      blacked_out            = result["blackedOutVideo"] == true || (feeds.present? && feeds.all? { |feed| feed[:blackedOut] })
      abstract_state         = result.dig("gameData", "abstractGameState")
      detailed_state         = result.dig("gameData", "detailedState")
      has_video              = feeds.any?

      {
        gamePk:               game_pk,
        abstractState:        abstract_state,
        detailedState:        detailed_state,
        hasVideo:             has_video,
        isBlackedOut:         blacked_out,
        providerAuthRequired: provider_auth_required,
        feeds:                feeds,
        defaultFeed:          default_feed,
        defaultFeedLabel:     feed_label(default_feed),
        watchUrl:             "https://www.mlb.com/tv/g#{game_pk}",
        unavailableReason:    unavailable_reason(
          abstract_state:        abstract_state,
          has_video:             has_video,
          blacked_out:           blacked_out,
          provider_auth_required: provider_auth_required,
          feeds:                 feeds
        )
      }
    end

    private

    def fetch_result(game_pk)
      uri = URI.parse("#{EPG_HOST}/api/epg/v3/search?gamePk=#{game_pk}&useLatestGames=true")
      response = Net::HTTP.start(uri.host, uri.port, use_ssl: true, open_timeout: 8, read_timeout: 15) do |http|
        http.get(uri)
      end

      raise "MLB TV metadata unavailable (#{response.code})" unless response.code.to_i == 200

      payload = JSON.parse(response.body)
      payload.fetch("results", []).first || {}
    rescue JSON::ParserError => error
      raise "MLB TV metadata parse failed: #{error.message}"
    end

    def normalize_feed(feed)
      {
        contentId:            feed["contentId"],
        mediaId:              feed["mediaId"],
        type:                 feed["mediaFeedType"].presence || feed["type"].presence || "HOME",
        callLetters:          feed["callLetters"],
        mediaState:           feed["mediaState"],
        entitled:             feed["entitled"] == true,
        blackedOut:           feed["blackedOut"] == true,
        providerAuthRequired: auth_required?(feed)
      }
    end

    def auth_required?(feed)
      %w[foxAuthRequired tbsAuthRequired espnAuthRequired fs1AuthRequired mlbnAuthRequired espn2AuthRequired abcAuthRequired].any? do |key|
        feed[key] == true
      end
    end

    def feed_label(feed)
      return nil unless feed

      base = feed[:type] == "AWAY" ? "Away TV" : "Home TV"
      feed[:callLetters].present? ? "#{base} · #{feed[:callLetters]}" : base
    end

    def unavailable_reason(abstract_state:, has_video:, blacked_out:, provider_auth_required:, feeds:)
      return "MLB.TV embeds are only shown for live and pregame matchups." unless %w[Live Preview].include?(abstract_state)
      return "No MLB.TV video feed is listed for this matchup yet." unless has_video
      return "This matchup is currently subject to blackout restrictions." if blacked_out
      return "This matchup requires a participating TV provider instead of standard MLB.TV access." if provider_auth_required
      return "No active video feed is listed for this matchup." unless feeds.any? { |feed| feed[:mediaState] == "MEDIA_ON" }

      nil
    end
  end
end
