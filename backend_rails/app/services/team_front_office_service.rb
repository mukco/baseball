require "nokogiri"

class TeamFrontOfficeService
  BASE_URL = "https://www.mlb.com".freeze
  CACHE_TTL = 24 * 3600
  TEAM_SLUGS = {
    108 => "angels",
    109 => "dbacks",
    110 => "orioles",
    111 => "redsox",
    112 => "cubs",
    113 => "reds",
    114 => "guardians",
    115 => "rockies",
    116 => "tigers",
    117 => "astros",
    118 => "royals",
    119 => "dodgers",
    120 => "nationals",
    121 => "mets",
    133 => "athletics",
    134 => "pirates",
    135 => "padres",
    136 => "mariners",
    137 => "giants",
    138 => "cardinals",
    139 => "rays",
    140 => "rangers",
    141 => "bluejays",
    142 => "twins",
    143 => "phillies",
    144 => "braves",
    145 => "whitesox",
    146 => "marlins",
    147 => "yankees",
    158 => "brewers"
  }.freeze

  @@cache = {}
  @@cache_timestamps = {}

  class << self
    def fetch(team_id:)
      key = team_id.to_s
      return @@cache[key] if cache_fresh?(key)

      slug = TEAM_SLUGS[team_id.to_i]
      return { error: "Unsupported team id: #{team_id}" } unless slug

      result = {
        manager: parse_manager(fetch_page("/#{slug}/roster/coaches")),
        frontOffice: parse_front_office(fetch_page("/#{slug}/team/front-office")),
        source: "MLB.com",
        sourceUrl: "#{BASE_URL}/#{slug}/team/front-office",
        fetchedAt: Time.current.iso8601
      }

      cache_set(key, result) unless result[:error]
      result
    rescue => e
      { error: e.message }
    end

    private

    def parse_manager(html)
      doc = Nokogiri::HTML(html)
      row = doc.css("div.coaches table.roster__table tbody tr").find do |tr|
        tr.css("td")[2]&.text&.squish == "Manager"
      end
      row&.css("td")&.[](1)&.children&.find { |child| child.text.squish.present? && child.name == "text" }&.text&.squish
    end

    def parse_front_office(html)
      doc = Nokogiri::HTML(html)
      roles = extract_roles(doc)

      {
        presidentBaseballOps: roles["President - Baseball Operations and General Manager"] || roles["President of Baseball Operations"],
        generalManager: roles["President - Baseball Operations and General Manager"] || roles["General Manager"],
        presidentBusiness: roles["President - Business Operations"] || roles["Business President"]
      }.compact
    end

    def extract_roles(doc)
      doc.css("main p").each_with_object({}) do |paragraph, roles|
        strongs = paragraph.css("strong")
        next if strongs.empty?

        strongs.each do |strong|
          title = strong.text.squish
          next if title.blank?

          name = next_named_value(strong)
          roles[title] = name if name.present?
        end
      end
    end

    def next_named_value(strong)
      node = strong.next_sibling
      while node
        value = node.text.to_s.squish
        return value if value.present?
        node = node.next_sibling
      end
      nil
    end

    def fetch_page(path)
      connection.get("#{BASE_URL}#{path}").body
    end

    def connection
      @connection ||= Faraday.new do |f|
        f.request :retry, max: 2, interval: 1.0
        f.response :raise_error
        f.options.timeout = 30
        f.options.open_timeout = 10
        f.headers["User-Agent"] = "Statline/1.0"
      end
    end

    def cache_fresh?(key)
      @@cache.key?(key) && @@cache_timestamps[key].to_i > Time.now.to_i - CACHE_TTL
    end

    def cache_set(key, value)
      @@cache[key] = value
      @@cache_timestamps[key] = Time.now.to_i
    end
  end
end
