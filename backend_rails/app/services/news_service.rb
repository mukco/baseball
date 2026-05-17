require "digest"
require "cgi"
require "time"
require "csv"

class NewsService
  TEAM_NAME_BY_ABBR = {
    "LAA" => "Los Angeles Angels",
    "ARI" => "Arizona Diamondbacks",
    "BAL" => "Baltimore Orioles",
    "BOS" => "Boston Red Sox",
    "CHC" => "Chicago Cubs",
    "CIN" => "Cincinnati Reds",
    "CLE" => "Cleveland Guardians",
    "COL" => "Colorado Rockies",
    "DET" => "Detroit Tigers",
    "HOU" => "Houston Astros",
    "KC" => "Kansas City Royals",
    "LAD" => "Los Angeles Dodgers",
    "WSH" => "Washington Nationals",
    "NYM" => "New York Mets",
    "OAK" => "Athletics",
    "PIT" => "Pittsburgh Pirates",
    "SD" => "San Diego Padres",
    "SEA" => "Seattle Mariners",
    "SF" => "San Francisco Giants",
    "STL" => "St. Louis Cardinals",
    "TB" => "Tampa Bay Rays",
    "TEX" => "Texas Rangers",
    "TOR" => "Toronto Blue Jays",
    "MIN" => "Minnesota Twins",
    "PHI" => "Philadelphia Phillies",
    "ATL" => "Atlanta Braves",
    "CWS" => "Chicago White Sox",
    "MIA" => "Miami Marlins",
    "NYY" => "New York Yankees",
    "MIL" => "Milwaukee Brewers"
  }.freeze

  SOURCE_CONFIG = {
    "mlb" => { name: "MLB", kind: :rss, url: "https://www.mlb.com/feeds/news/rss.xml" },
    "fangraphs" => { name: "FanGraphs", kind: :rss, url: "https://blogs.fangraphs.com/feed/" },
    "mlbtr" => { name: "MLB Trade Rumors", kind: :rss, url: "https://www.mlbtraderumors.com/feed" },
    "reddit" => { name: "r/baseball", kind: :reddit, url: "https://www.reddit.com/r/baseball/new.json?limit=35" }
  }.freeze

  class << self
    def fetch(topic: "all", limit: 50)
      selected_keys = selected_sources(topic)
      errors = []

      items = selected_keys.flat_map do |key|
        cfg = SOURCE_CONFIG[key]
        begin
          fetch_source(cfg, key)
        rescue StandardError => e
          Rails.logger.warn("News fetch failed for #{key}: #{e.class} #{e.message}")
          errors << { source: cfg[:name], error: e.message }
          []
        end
      end

      deduped = dedupe(items)
      sorted = deduped.sort_by { |item| item[:publishedAt] || "" }.reverse
      bounded_limit = [[limit.to_i, 5].max, 100].min

      {
        topic: topic,
        sources: selected_keys,
        count: sorted.first(bounded_limit).size,
        items: sorted.first(bounded_limit),
        errors: errors
      }
    end

    def resolve_players(names)
      return [] if names.blank?
      extract_player_mentions(Array(names).join(" "))
    end

    private

    def connection
      @connection ||= Faraday.new do |f|
        f.request :retry, max: 2, interval: 0.4
        f.response :raise_error
        f.options.timeout = 12
        f.options.open_timeout = 6
        f.headers["User-Agent"] = "StatlineNewsBot/1.0 (+https://statline.local)"
      end
    end

    def selected_sources(topic)
      key = topic.to_s.downcase
      return SOURCE_CONFIG.keys if key.empty? || key == "all"
      SOURCE_CONFIG.key?(key) ? [key] : SOURCE_CONFIG.keys
    end

    def fetch_source(cfg, source_key)
      body = connection.get(cfg[:url]).body

      items = case cfg[:kind]
      when :rss
        parse_rss_items(body, source_name: cfg[:name], source_key: source_key)
      when :reddit
        parse_reddit_items(body, source_name: cfg[:name], source_key: source_key)
      else
        []
      end

      items.filter_map { |item| normalize_item(item, source_name: cfg[:name], source_key: source_key) }
    end

    def parse_rss_items(xml, source_name:, source_key:)
      blocks = xml.scan(/<item\b[^>]*>(.*?)<\/item>/mi).flatten
      blocks = xml.scan(/<entry\b[^>]*>(.*?)<\/entry>/mi).flatten if blocks.empty?

      blocks.map do |block|
        title = decode_xml(extract_tag(block, "title"))
        link = decode_xml(extract_tag(block, "link"))
        link = extract_link_href(block) if link.to_s.strip.empty?
        description_html = decode_xml(extract_tag(block, "description") || extract_tag(block, "content:encoded") || extract_tag(block, "summary"))

        {
          source: source_name,
          sourceKey: source_key,
          title: title,
          url: link,
          author: decode_xml(extract_tag(block, "dc:creator")) || decode_xml(extract_tag(block, "author")),
          publishedAt: parse_time(extract_tag(block, "pubDate") || extract_tag(block, "updated") || extract_tag(block, "published")),
          summary: sanitize_html(description_html),
          imageUrl: extract_image_from_rss(block, description_html),
          tags: []
        }
      end
    end

    def parse_reddit_items(json_str, source_name:, source_key:)
      data = JSON.parse(json_str)
      children = data.dig("data", "children") || []

      children.map do |child|
        post = child["data"] || {}
        preview_image = post.dig("preview", "images", 0, "source", "url")
        thumb = post["thumbnail"]
        image_url = preview_image || (thumb.to_s.start_with?("http") ? thumb : nil)

        {
          source: source_name,
          sourceKey: source_key,
          title: post["title"],
          url: post["url_overridden_by_dest"] || "https://www.reddit.com#{post["permalink"]}",
          author: post["author"],
          publishedAt: Time.at(post["created_utc"].to_i).utc.iso8601,
          summary: post["selftext"].to_s[0, 280],
          imageUrl: decode_xml(image_url),
          tags: ["reddit"]
        }
      end
    end

    def normalize_item(item, source_name:, source_key:)
      title = item[:title].to_s.strip
      url = item[:url].to_s.strip
      return nil if title.empty? || url.empty?

      {
        id: Digest::SHA1.hexdigest("#{source_key}:#{url}:#{title}"),
        source: source_name,
        sourceKey: source_key,
        title: title,
        url: url,
        author: item[:author].to_s.strip.presence,
        publishedAt: item[:publishedAt],
        summary: item[:summary].to_s.strip.presence,
        imageUrl: item[:imageUrl].to_s.strip.presence,
        mentions: extract_player_mentions("#{title} #{item[:summary]}"),
        teamMentions: extract_team_mentions("#{title} #{item[:summary]}"),
        tags: item[:tags] || []
      }
    end

    def dedupe(items)
      seen = {}
      items.each_with_object([]) do |item, out|
        key = item[:url].to_s.downcase.strip
        next if key.empty? || seen[key]
        seen[key] = true
        out << item
      end
    end

    def extract_tag(xml_block, tag_name)
      return nil if xml_block.nil?
      pattern = /<#{Regexp.escape(tag_name)}\b[^>]*>(.*?)<\/#{Regexp.escape(tag_name)}>/mi
      m = xml_block.match(pattern)
      m && m[1]
    end

    def extract_link_href(xml_block)
      alternate = xml_block.match(/<link\b[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["'][^>]*\/?>/i)
      return alternate[1] if alternate

      generic = xml_block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?>/i)
      generic && generic[1]
    end

    def decode_xml(text)
      return nil if text.nil?

      cleaned = text.to_s.gsub(/<!\[CDATA\[(.*?)\]\]>/m, "\\1").strip
      cleaned = cleaned.encode("UTF-8", invalid: :replace, undef: :replace, replace: "")
      decoded = cleaned

      3.times do
        next_decoded = CGI.unescapeHTML(decoded)
        break if next_decoded == decoded
        decoded = next_decoded
      end

      decoded
    end

    def sanitize_html(text)
      return nil if text.nil?
      cleaned = text.gsub(/<[^>]+>/, " ")
      cleaned = cleaned.gsub(/([[:lower:]])([[:upper:]])/, "\\1 \\2")
      cleaned.gsub(/\s+/, " ").strip[0, 320]
    end

    def parse_time(value)
      return nil if value.nil?
      Time.parse(value.to_s).utc.iso8601
    rescue ArgumentError
      nil
    end

    def extract_image_from_rss(block, description_html)
      media_url = block.to_s[/<media:content\b[^>]*url=["']([^"']+)["']/i, 1] ||
                  block.to_s[/<media:thumbnail\b[^>]*url=["']([^"']+)["']/i, 1] ||
                  block.to_s[/<enclosure\b[^>]*url=["']([^"']+)["'][^>]*type=["']image\//i, 1]
      return decode_xml(media_url) if media_url.present?

      from_html = description_html.to_s[/<img\b[^>]*src=["']([^"']+)["']/i, 1]
      decode_xml(from_html)
    end

    def extract_player_mentions(text)
      return [] if text.to_s.strip.empty?

      down_text = text.to_s.downcase
      tokens = down_text.scan(/[a-z][a-z'\-]+/).uniq
      candidates = tokens.flat_map { |t| players_by_last_name[t] }.compact.uniq { |p| p[:id] }

      mentions = candidates.filter_map do |player|
        full_match = down_text.match(player[:regex])
        if full_match
          next { id: player[:id], name: player[:name], team: player[:team], team_id: player[:team_id], pos: full_match.begin(0), confidence: 2 }
        end

        next unless player[:unique_last_name]

        last_name_match = down_text.match(/(?<![a-z0-9])#{Regexp.escape(player[:last_name])}(?![a-z0-9])/i)
        next unless last_name_match

        { id: player[:id], name: player[:name], team: player[:team], team_id: player[:team_id], pos: last_name_match.begin(0), confidence: 1 }
      end

      mentions.sort_by { |m| [-m[:confidence], m[:pos]] }
              .map do |m|
                {
                  id: m[:id],
                  name: m[:name],
                  team: m[:team],
                  teamId: m[:team_id],
                  headshotUrl: "https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_60,q_auto:best/v1/people/#{m[:id]}/headshot/67/current"
                }
              end
              .uniq { |m| m[:id] }
              .first(6)
    end

    def extract_team_mentions(text)
      return [] if text.to_s.strip.empty?

      down_text = text.to_s.downcase
      hits = team_aliases.filter_map do |alias_row|
        match = down_text.match(alias_row[:regex])
        next unless match
        {
          id: alias_row[:id],
          name: alias_row[:name],
          abbreviation: alias_row[:abbreviation],
          logoUrl: "https://www.mlbstatic.com/team-logos/#{alias_row[:id]}.svg",
          pos: match.begin(0)
        }
      end

      hits.sort_by { |h| h[:pos] }
          .map { |h| h.except(:pos) }
          .uniq { |h| h[:id] }
          .first(4)
    end

    def players_by_last_name
      @players_by_last_name ||= begin
        csv_path = Rails.root.join("tmp", "sandbox", "players.csv")
        index = Hash.new { |h, k| h[k] = [] }
        return index unless csv_path.exist?

        unique_players = {}
        player_teams = {}
        CSV.foreach(csv_path, headers: true) do |row|
          player_id = row["player_id"].to_i
          name = row["name"].to_s.strip
          next if player_id <= 0 || name.blank?
          unique_players[player_id] ||= name
          player_teams[player_id] ||= row["team"].to_s.strip
        end

        unique_players.each do |player_id, name|
          last_name = name.downcase.split(/\s+/).last.to_s.gsub(/[^a-z'\-]/, "")
          next if last_name.blank?

          team = player_teams[player_id].to_s.strip
          team_id = team_id_by_abbreviation[team]

          index[last_name] << {
            id: player_id,
            name: name,
            last_name: last_name,
            team: team.presence,
            team_id: team_id,
            unique_last_name: false,
            regex: player_name_regex(name)
          }
        end

        index.each_value do |list|
          next unless list.size == 1
          list[0][:unique_last_name] = true
        end

        index
      end
    end

    def team_id_by_abbreviation
      @team_id_by_abbreviation ||= MlbApiService::TEAM_META.each_with_object({}) do |(id, meta), memo|
        abbr = meta[:abbr].to_s
        memo[abbr] = id if abbr.present?
      end
    end

    def team_aliases
      @team_aliases ||= MlbApiService::TEAM_META.map do |id, meta|
        abbr = meta[:abbr].to_s
        name = TEAM_NAME_BY_ABBR[abbr] || abbr
        words = name.downcase.split(/\s+/)
        nickname = words.last

        aliases = [name.downcase, abbr.downcase]
        aliases << nickname if nickname.present? && nickname.length >= 4

        aliases.uniq.map do |ali|
          {
            id: id,
            name: name,
            abbreviation: abbr,
            regex: /(?<![a-z0-9])#{Regexp.escape(ali)}(?![a-z0-9])/i
          }
        end
      end.flatten
    end

    def player_name_regex(name)
      words = name.downcase.split(/\s+/)
                  .map { |w| w.gsub(/[^a-z0-9'\-]/, "") }
                  .reject(&:blank?)
      joined = words.map { |w| Regexp.escape(w) }.join("\\s+")
      /(?<![a-z0-9])#{joined}(?![a-z0-9])/i
    end
  end
end
