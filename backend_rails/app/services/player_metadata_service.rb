require "nokogiri"

class PlayerMetadataService
  CACHE_TTL      = 12 * 3600
  PAGE_CACHE_TTL =  6 * 3600

  @@cache            = {}
  @@cache_timestamps = {}
  @@page_cache            = {}
  @@page_cache_timestamps = {}

  class << self
    def fetch(player_id:, team_id:, player_name:, season: Date.today.year)
      key = "#{player_id}-#{season}"
      return @@cache[key] if cache_fresh?(key)

      result = {
        awards: fetch_awards(player_id),
        contract: fetch_contract(team_id: team_id, player_name: player_name, season: season)
      }

      cache_set(key, result) unless result[:error]
      result
    rescue => e
      { error: e.message }
    end

    private

    def fetch_awards(player_id)
      data = mlb_service.send(:get, "people/#{player_id}/awards", { sportId: 1 })

      Array(data["awards"])
        .map do |award|
          {
            id: award["id"],
            name: award["name"],
            season: award["season"],
            date: award["date"],
            notes: award["notes"],
            league: award.dig("league", "name"),
            team: award.dig("team", "name")
          }.compact
        end
        .uniq { |award| [award[:id], award[:season], award[:date], award[:name]] }
        .sort_by { |award| [award[:season].to_i, award[:date].to_s] }
        .reverse
    rescue
      []
    end

    def fetch_contract(team_id:, player_name:, season:)
      return nil if team_id.blank? || player_name.blank?

      slug = TeamFinanceService::TEAM_SLUGS[team_id.to_i]
      return nil unless slug

      html = fetch_payroll_page(slug)
      doc = Nokogiri::HTML(html)
      row = doc.css("table tbody tr").find { |tr| tr.css("td")[0]&.text&.squish == player_name.to_s.squish }
      return nil unless row

      cells = row.css("td").map { |td| td.text.squish.presence }
      current_year = season.to_i
      future_years = (current_year..(current_year + 6)).to_a
      salary_cells = cells[6, future_years.length] || []

      {
        summary: cells[3],
        averageAnnualValue: parse_money(cells[5]),
        currentSeasonSalary: parse_money(cells[6]),
        salariesBySeason: future_years.zip(salary_cells).filter_map do |year, value|
          amount = parse_money(value)
          next if amount.nil? && value.blank?
          { season: year, value: amount, label: value }
        end,
        source: "FanGraphs RosterResource",
        sourceUrl: "https://www.fangraphs.com/roster-resource/payroll/#{slug}"
      }
    rescue
      nil
    end

    def parse_money(value)
      return nil if value.blank? || value == "FREE AGENT" || value == "TBD"

      cleaned = value.to_s.delete("$,").strip
      multiplier = cleaned.end_with?("M") ? 1_000_000 : cleaned.end_with?("K") ? 1_000 : 1
      numeric = cleaned.delete_suffix("M").delete_suffix("K")
      (numeric.to_f * multiplier).round
    end

    def mlb_service
      @mlb_service ||= MlbApiService.new
    end

    def fetch_payroll_page(slug)
      if @@page_cache.key?(slug) && @@page_cache_timestamps[slug].to_i > Time.now.to_i - PAGE_CACHE_TTL
        return @@page_cache[slug]
      end
      html = finance_connection.get("https://www.fangraphs.com/roster-resource/payroll/#{slug}").body
      @@page_cache[slug]            = html
      @@page_cache_timestamps[slug] = Time.now.to_i
      html
    end

    def finance_connection
      @finance_connection ||= Faraday.new do |f|
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
