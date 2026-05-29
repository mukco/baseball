require "csv"
require "nokogiri"

class OttoneuService
  LEAGUE_BASE = "https://ottoneu.fangraphs.com".freeze

  ROSTERS_TTL    = 60 * 60
  STANDINGS_TTL  = 60 * 60
  AUCTIONS_TTL   =  5 * 60
  WAIVERS_TTL    =  5 * 60
  CAP_TTL        = 60 * 60
  PRODUCTION_TTL = 60 * 60
  MATCHUPS_TTL   =  5 * 60
  IL_STATUS_TTL  = 15 * 60
  LOANS_TTL      = 60 * 60

  FG_TO_MLB_TEAM_ID = {
    "LAA" => 108, "ARI" => 109, "BAL" => 110, "BOS" => 111,
    "CHC" => 112, "CIN" => 113, "CLE" => 114, "COL" => 115,
    "DET" => 116, "HOU" => 117, "KCR" => 118, "LAD" => 119,
    "WSN" => 120, "NYM" => 121, "ATH" => 133, "PIT" => 134,
    "SDP" => 135, "SEA" => 136, "SFG" => 137, "STL" => 138,
    "TBR" => 139, "TEX" => 140, "TOR" => 141, "MIN" => 142,
    "PHI" => 143, "ATL" => 144, "CHW" => 145, "MIA" => 146,
    "NYY" => 147, "MIL" => 158
  }.freeze

  MLB_IL_CODES = %w[D15 D60 ILF].freeze

  @@cache            = {}
  @@cache_timestamps = {}
  @@cache_ttls       = {}

  class << self
    def all_rosters
      return @@cache[:all_rosters] if cache_fresh?(:all_rosters)
      result = fetch_rosters
      cache_set(:all_rosters, result, ROSTERS_TTL)
      result
    rescue => e
      { error: e.message }
    end

    def my_roster
      rosters = all_rosters
      return rosters if rosters.is_a?(Hash) && rosters[:error]
      team = Array(rosters).find { |t| t[:team_id].to_s == team_id.to_s }
      team || { error: "Team #{team_id} not found in roster export" }
    rescue => e
      { error: e.message }
    end

    def standings
      return @@cache[:standings] if cache_fresh?(:standings)
      result = fetch_standings
      cache_set(:standings, result, STANDINGS_TTL) unless result[:error]
      result
    rescue => e
      { error: e.message }
    end

    def auctions
      return @@cache[:auctions] if cache_fresh?(:auctions)
      result = fetch_auctions
      cache_set(:auctions, result, AUCTIONS_TTL) unless result[:error]
      result
    rescue => e
      { error: e.message }
    end

    def waivers
      return @@cache[:waivers] if cache_fresh?(:waivers)
      result = fetch_waivers
      cache_set(:waivers, result, WAIVERS_TTL) unless result[:error]
      result
    rescue => e
      { error: e.message }
    end

    def cap_overview
      return @@cache[:cap_overview] if cache_fresh?(:cap_overview)
      result = fetch_cap_overview
      cache_set(:cap_overview, result, CAP_TTL) unless result.is_a?(Hash) && result[:error]
      result
    rescue => e
      { error: e.message }
    end

    def my_production
      return @@cache[:my_production] if cache_fresh?(:my_production)
      result = fetch_my_production
      cache_set(:my_production, result, PRODUCTION_TTL) unless result.is_a?(Hash) && result[:error]
      result
    rescue => e
      { error: e.message }
    end

    def current_matchups
      return @@cache[:current_matchups] if cache_fresh?(:current_matchups)
      result = fetch_current_matchups
      cache_set(:current_matchups, result, MATCHUPS_TTL) unless result[:error]
      result
    rescue => e
      { error: e.message }
    end

    def my_il_status
      return @@cache[:my_il_status] if cache_fresh?(:my_il_status)
      result = fetch_il_status
      cache_set(:my_il_status, result, IL_STATUS_TTL)
      result
    rescue => e
      Rails.logger.warn("OttoneuService#my_il_status: #{e.message}")
      {}
    end

    def loans
      return @@cache[:loans] if cache_fresh?(:loans)
      result = fetch_loans
      cache_set(:loans, result, LOANS_TTL) unless result.is_a?(Hash) && result[:error]
      result
    rescue => e
      { error: e.message }
    end

    def team_id
      ENV.fetch("OTTONEU_TEAM_ID", "6054")
    end

    def my_enriched_roster
      data = my_roster
      return data if data.is_a?(Hash) && data[:error]

      production = my_production
      il_status  = my_il_status
      prod_ok    = production.is_a?(Hash) && !production[:error]

      enriched = Array(data[:players]).map do |player|
        prod = prod_ok ? production[player[:name].to_s.downcase.strip] : nil
        il   = il_status[player[:name]] || {}
        player
          .merge(prod ? { season_points: prod[:season_points], pts_per_game: prod[:pts_per_game] } : {})
          .merge(mlb_il: il[:mlb_il] || false, mlb_il_desc: il[:mlb_il_desc])
      end

      data.merge(players: enriched)
    end

    def player_status(fg_id)
      rosters = all_rosters
      return rosters if rosters.is_a?(Hash) && rosters[:error]

      Array(rosters).each do |team|
        player = team[:players].find { |p| p[:fg_id].to_s == fg_id.to_s }
        return { rostered: true, team_name: team[:team_name], salary: player[:salary] } if player
      end

      { rostered: false }
    rescue => e
      { error: e.message }
    end

    private

    def league_id
      ENV.fetch("OTTONEU_LEAGUE_ID", "845")
    end

    def league_url(path)
      "#{LEAGUE_BASE}/#{league_id}/#{path}"
    end

    # ── CSV roster export ────────────────────────────────────────────────────

    def fetch_rosters
      body = conn.get(league_url("rosterexport?csv=1")).body.force_encoding("UTF-8")
      return [] if body.strip.empty? || body.strip.start_with?("<")

      rows = CSV.parse(body, headers: true, liberal_parsing: true)
      teams = {}

      rows.each do |row|
        normalized = row.to_h.transform_keys do |k|
          k.to_s.delete_prefix("﻿").delete_prefix('"').delete_suffix('"').strip
        end

        tid = normalized["TeamID"].to_s.strip
        next if tid.blank?

        teams[tid] ||= {
          team_id:   tid.to_i,
          team_name: normalized["Team Name"].to_s.strip,
          players:   []
        }

        teams[tid][:players] << {
          name:         normalized["Name"].to_s.strip,
          ottoneu_id:   normalized["ottoneu ID"].to_s.strip,
          fg_id:        normalized["FG MajorLeagueID"].to_s.strip.presence,
          fg_minor_id:  normalized["FG MinorLeagueID"].to_s.strip.presence,
          mlb_team:     normalized["MLB Team"].to_s.strip,
          positions:    normalized["Position(s)"].to_s.strip,
          salary:       normalized["Salary"].to_s.delete("$").to_i
        }
      end

      teams.values
    end

    # ── Standings ────────────────────────────────────────────────────────────

    def fetch_standings
      doc = nokogiri_get(league_url("standings"))
      divisions = []

      doc.css("h2, h3, h4, .division-header, [class*='division']").each do |header|
        header_text = header.text.squish
        next unless header_text.match?(/division|lansdowne|yawkey/i)

        table = header.xpath("following-sibling::table[1]").first
        next unless table

        teams = parse_standings_table(table)
        divisions << { name: header_text, teams: teams } unless teams.empty?
      end

      # Fallback: parse any table with record-like columns
      if divisions.empty?
        doc.css("table").each do |table|
          headers = table.css("th").map { |th| th.text.squish.downcase }
          next unless headers.any? { |h| h.include?("record") || h.match?(/pts|points/i) }

          teams = parse_standings_table(table)
          divisions << { name: "League", teams: teams } unless teams.empty?
        end
      end

      { divisions: divisions }
    end

    def parse_standings_table(table)
      table.css("tbody tr").filter_map do |row|
        cells = row.css("td").map { |td| td.text.squish }
        next if cells.empty? || cells[0].blank?

        {
          name:            cells[0],
          record:          cells[1],
          points:          cells[2].to_f,
          avg_pts:         cells[3].to_f,
          avg_pts_against: cells[4].to_f
        }
      end
    end

    # ── Auctions ─────────────────────────────────────────────────────────────

    def fetch_auctions
      doc = nokogiri_get(league_url("auctions"))

      # Prefer tables identified by section headers; fall back to first/second
      active_table    = table_after_header(doc, /active/i)
      completed_table = table_after_header(doc, /complete/i)
      all_tables      = doc.css("table")
      active_table    ||= all_tables[0]
      completed_table ||= all_tables[1]

      { active: parse_auction_table(active_table), completed: parse_auction_table(completed_table) }
    end

    def parse_auction_table(table)
      return [] unless table

      data_rows(table).filter_map do |row|
        cells       = row.css("td").map { |td| td.text.squish }
        next if cells.empty? || cells[0].blank?

        player_link = row.css("a").first
        name        = player_link&.text&.squish || cells[0]
        meta_text   = cells[0].sub(name, "").squish
        parts       = meta_text.split(/\s+/)

        {
          name:     name,
          mlb_team: parts[0].presence,
          position: parts[1].presence,
          end_time: find_time_cell(cells),
          bid:      find_dollar_cell(cells)
        }.compact
      end
    end

    # ── Waivers ──────────────────────────────────────────────────────────────

    def fetch_waivers
      doc = nokogiri_get(league_url("waiverclaim"))

      active_table    = table_after_header(doc, /active|current/i)
      completed_table = table_after_header(doc, /complete/i)
      all_tables      = doc.css("table")
      active_table    ||= all_tables[0]
      completed_table ||= all_tables[1]

      { active: parse_waiver_table(active_table), completed: parse_waiver_table(completed_table) }
    end

    def parse_waiver_table(table)
      return [] unless table

      data_rows(table).filter_map do |row|
        cells       = row.css("td").map { |td| td.text.squish }
        next if cells.empty? || cells[0].blank?

        player_link = row.css("a").first
        name        = player_link&.text&.squish || cells[0]

        {
          name:     name,
          cut_by:   cells[1].presence,
          deadline: cells[2].presence,
          salary:   find_dollar_cell(cells)
        }.compact
      end
    end

    # ── Cap overview (tools page) ─────────────────────────────────────────────

    def fetch_cap_overview
      doc = nokogiri_get(league_url("tools"))

      cap_table = doc.css("table").find do |t|
        headers = t.css("th").map { |th| th.text.squish.downcase }
        headers.any? { |h| h.include?("cap") || h.include?("penalt") || h.include?("salary") }
      end

      return [] unless cap_table

      data_rows(cap_table).filter_map do |row|
        cells = row.css("td").map { |td| td.text.squish }
        next if cells.empty? || cells[0].blank?

        # Tools page columns: Team(0) Players(1) Spots(2) Base Salaries(3)
        # Cap Penalties(4) Incoming Loans(5) Outgoing Loans(6) Available Cap Space(7)
        {
          team_name:      cells[0],
          player_count:   cells[1].to_i,
          base_salary:    parse_dollar(cells[3]),
          penalties:      parse_dollar(cells[4]),
          loans_in:       parse_dollar(cells[5]),
          loans_out:      parse_dollar(cells[6]),
          cap_space:      parse_dollar(cells[7])
        }
      end
    end

    # ── Team production ───────────────────────────────────────────────────────

    def fetch_my_production
      doc          = nokogiri_get(league_url("teamproduction"))
      my_roster_data = my_roster
      return {} if my_roster_data[:error] || my_roster_data[:players].blank?

      player_names = my_roster_data[:players].map { |p| p[:name].downcase.strip }.to_set
      production   = {}

      doc.css("table").each do |tbl|
        data_rows(tbl).each do |row|
          cells = row.css("td").map { |td| td.text.squish }
          next if cells.size < 3

          name_cell = cells[0].downcase.strip
          next unless player_names.include?(name_cell)

          float_cells = cells.filter_map { |c| Float(c, exception: false) }.last(3)

          production[name_cell] = {
            season_points: float_cells[-1] || 0.0,
            pts_per_game:  float_cells[-2] || 0.0
          }
        end
      end

      production
    end

    # ── Current matchups (schedule) ───────────────────────────────────────────

    def fetch_current_matchups
      doc          = nokogiri_get(league_url("schedule"))
      my_team_name = my_roster[:team_name] || "Dingers and Dugouts"
      matchups     = []

      doc.css("table").flat_map { |tbl| data_rows(tbl) }.each do |row|
        row_html = row.to_html
        row_text = row.text

        # Only consider rows marked "Live" that involve our team
        next unless row_text.include?("Live") || row_html.downcase.include?("live")
        next unless row_text.include?(my_team_name)

        team_links = row.css("a").map { |a| a.text.squish }.reject(&:blank?).uniq
        opponent   = team_links.find { |t| t != my_team_name }

        # Score cells: numeric-only floats
        cells      = row.css("td").map { |td| td.text.squish }
        score_vals = cells.filter_map { |c| Float(c, exception: false) }

        matchups << {
          opponent_name:   opponent,
          my_points:       score_vals[0],
          opponent_points: score_vals[1],
          status:          "live"
        }.compact
      end

      { matchups: matchups }
    end

    # ── MLB IL status lookup ──────────────────────────────────────────────────

    def fetch_il_status
      roster = my_roster
      return {} if roster.is_a?(Hash) && roster[:error]

      players  = Array(roster[:players])
      mlb_id_map = fetch_mlb_ids_for_players(players)
      mlb      = MlbApiService.new

      players.group_by { |p| p[:mlb_team] }.each_with_object({}) do |(abbr, team_players), result|
        team_id = FG_TO_MLB_TEAM_ID[abbr]
        next unless team_id

        statuses = mlb.team_roster_statuses(team_id)
        by_id    = statuses[:by_id]
        by_name  = statuses[:by_name]

        team_players.each do |player|
          # Prefer match by MLB player_id (from warehouse), fall back to name
          mlb_pid = mlb_id_map[player[:fg_id].to_s]
          entry   = (mlb_pid && by_id[mlb_pid]) || by_name[player[:name].to_s.downcase.strip]
          next unless entry

          result[player[:name]] = {
            mlb_il:      MLB_IL_CODES.include?(entry[:code]),
            mlb_il_desc: entry[:desc].presence
          }
        end
      end
    end

    def fetch_mlb_ids_for_players(players)
      fg_ids = players.map { |p| p[:fg_id].to_s }.compact.reject(&:blank?)
      return {} if fg_ids.empty? || !Warehouse::Manager.exists?

      quoted  = fg_ids.map { |id| "'#{id.gsub("'", "''")}'" }.join(", ")
      season  = Date.today.year
      sql     = <<~SQL
        SELECT CAST(fg_id AS VARCHAR) AS fg_id, player_id FROM batters
        WHERE season = #{season} AND CAST(fg_id AS VARCHAR) IN (#{quoted})
        UNION ALL
        SELECT CAST(fg_id AS VARCHAR) AS fg_id, player_id FROM pitchers
        WHERE season = #{season} AND CAST(fg_id AS VARCHAR) IN (#{quoted})
      SQL

      result = Sandbox::QueryService.run(sql: sql, limit: 200)
      cols   = result[:columns] || []
      Array(result[:rows]).each_with_object({}) do |row, map|
        h      = cols.zip(row).to_h.transform_keys(&:to_sym)
        fg_id  = h[:fg_id].to_s
        pid    = h[:player_id].to_i
        map[fg_id] = pid if pid > 0
      end
    rescue => e
      Rails.logger.warn("OttoneuService#fetch_mlb_ids_for_players: #{e.message}")
      {}
    end

    # ── Loans ─────────────────────────────────────────────────────────────────

    def fetch_loans
      doc = nokogiri_get(league_url("loans"))

      loan_table = doc.css("table").find do |t|
        headers = t.css("th").map { |th| th.text.squish.downcase }
        headers.any? { |h| h.include?("loan") || h.include?("from") || h.include?("to") || h.include?("amount") }
      end

      return [] unless loan_table

      headers = loan_table.css("th").map { |th| th.text.squish.downcase }

      data_rows(loan_table).filter_map do |row|
        cells = row.css("td").map { |td| td.text.squish }
        next if cells.empty?

        row_hash = headers.zip(cells).to_h

        from_team = row_hash["from"] || row_hash["lender"] || row_hash["lending team"] || cells[0]
        to_team   = row_hash["to"]   || row_hash["borrower"] || row_hash["receiving team"] || cells[1]
        next if from_team.blank? && to_team.blank?

        {
          from_team: from_team,
          to_team:   to_team,
          amount:    parse_dollar(row_hash["amount"] || row_hash["loan amount"] || cells[2].to_s),
          season:    (row_hash["season"] || row_hash["year"] || cells[3].to_s).to_s.strip,
          status:    row_hash["status"] || row_hash["paid"] || "",
        }
      end
    rescue => e
      Rails.logger.warn("OttoneuService#fetch_loans: #{e.message}")
      []
    end

    # ── HTTP / Nokogiri helpers ───────────────────────────────────────────────

    def nokogiri_get(url)
      Nokogiri::HTML(conn.get(url).body)
    end

    def conn
      @conn ||= Faraday.new do |f|
        f.request :retry, max: 2, interval: 1.0
        f.response :raise_error
        f.options.timeout      = 30
        f.options.open_timeout = 10
        f.headers["User-Agent"] = "Statline/1.0"
      end
    end

    # ── Cache ─────────────────────────────────────────────────────────────────

    def cache_fresh?(key)
      @@cache.key?(key) &&
        @@cache_timestamps[key].to_i > Time.now.to_i - @@cache_ttls.fetch(key, 1800)
    end

    def cache_set(key, value, ttl)
      @@cache[key]            = value
      @@cache_timestamps[key] = Time.now.to_i
      @@cache_ttls[key]       = ttl
    end

    # ── Parsers ───────────────────────────────────────────────────────────────

    def parse_dollar(str)
      str.to_s.delete("$,").strip.to_i
    end

    def find_dollar_cell(cells)
      cells.filter_map { |c| c.delete("$").to_i if c.start_with?("$") }.first
    end

    def find_time_cell(cells)
      cells.find { |c| c.match?(/\b(AM|PM|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i) }
    end

    # Returns data rows from a table, handling both explicit and implicit tbody.
    # Skips header rows (rows that contain only <th> elements).
    def data_rows(table)
      return [] unless table
      rows = table.css("tbody tr")
      rows = table.css("tr") if rows.empty?
      rows.select { |tr| tr.css("td").any? }
    end

    # Returns the first <table> that follows a header element matching pattern.
    def table_after_header(doc, pattern)
      doc.css("h2, h3, h4, th, .section-header, [class*='header']").each do |el|
        next unless el.text.match?(pattern)
        table = el.xpath("ancestor::table[1]").first || el.xpath("following::table[1]").first
        next if table.nil?
        return table unless table.css("th").map(&:text).join.match?(pattern)
      end
      nil
    end
  end
end
