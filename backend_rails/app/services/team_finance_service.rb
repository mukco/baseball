require "nokogiri"

class TeamFinanceService
  BASE_URL = "https://www.fangraphs.com/roster-resource/payroll".freeze
  CACHE_TTL = 6 * 3600
  CBT_THRESHOLDS = {
    2022 => 230_000_000,
    2023 => 233_000_000,
    2024 => 237_000_000,
    2025 => 241_000_000,
    2026 => 244_000_000
  }.freeze
  TEAM_SLUGS = {
    108 => "angels",
    109 => "diamondbacks",
    110 => "orioles",
    111 => "red-sox",
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
    141 => "blue-jays",
    142 => "twins",
    143 => "phillies",
    144 => "braves",
    145 => "white-sox",
    146 => "marlins",
    147 => "yankees",
    158 => "brewers"
  }.freeze

  @@cache = {}
  @@cache_timestamps = {}

  class << self
    def fetch(team_id:, season: Date.today.year)
      key = "#{team_id}-#{season}"
      return @@cache[key] if cache_fresh?(key)

      slug = TEAM_SLUGS[team_id.to_i]
      return { error: "Unsupported team id: #{team_id}" } unless slug

      result = parse_finance_page(fetch_page(slug), team_id: team_id.to_i, season: season.to_i, slug: slug)
      cache_set(key, result) unless result[:error]
      result
    rescue => e
      { error: e.message }
    end

    private

    def fetch_page(slug)
      connection.get("#{BASE_URL}/#{slug}").body
    end

    def parse_finance_page(html, team_id:, season:, slug:)
      text = Nokogiri::HTML(html).text.gsub("\u00A0", " ").gsub(/[[:space:]]+/, " ").strip
      exact_estimated_payroll = text.scan(/Estimated Payroll\s*(\$[\d,]+)/).flatten.last
      exact_cbt_payroll = text.scan(/Estimated Luxury Tax Payroll\s*(\$[\d,]+)/).flatten.first
      rounded_estimated_payroll = text[/Estimated #{season} Payroll:\s*(\$[\d.,]+[MK]?)/, 1]
      prior_season_final_payroll = text[/Estimated Final #{season - 1} Payroll:\s*(\$[\d.,]+[MK]?)/, 1]
      cbt_threshold = CBT_THRESHOLDS[season]

      estimated_payroll = parse_money(exact_estimated_payroll || rounded_estimated_payroll)
      cbt_payroll = parse_money(exact_cbt_payroll)

      {
        teamId: team_id,
        season: season,
        estimatedPayroll: estimated_payroll,
        estimatedPayrollRounded: rounded_estimated_payroll,
        priorSeasonFinalPayroll: parse_money(prior_season_final_payroll),
        priorSeasonFinalPayrollRounded: prior_season_final_payroll,
        cbtPayroll: cbt_payroll,
        cbtThreshold: cbt_threshold,
        cbtSpaceRemaining: (cbt_threshold && cbt_payroll) ? cbt_threshold - cbt_payroll : nil,
        source: "FanGraphs RosterResource",
        sourceUrl: "#{BASE_URL}/#{slug}",
        fetchedAt: Time.current.iso8601,
        terminologyNote: "MLB uses a competitive balance tax threshold rather than a hard salary cap."
      }
    end

    def parse_money(value)
      return nil if value.blank?

      cleaned = value.to_s.delete("$,").strip
      multiplier = cleaned.end_with?("M") ? 1_000_000 : cleaned.end_with?("K") ? 1_000 : 1
      numeric = cleaned.delete_suffix("M").delete_suffix("K")
      (numeric.to_f * multiplier).round
    end

    def cache_fresh?(key)
      @@cache.key?(key) && @@cache_timestamps[key].to_i > Time.now.to_i - CACHE_TTL
    end

    def cache_set(key, value)
      @@cache[key] = value
      @@cache_timestamps[key] = Time.now.to_i
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
  end
end
