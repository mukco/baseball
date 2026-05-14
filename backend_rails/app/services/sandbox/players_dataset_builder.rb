require "csv"
require "json"
require "fileutils"
require "time"

module Sandbox
  class PlayersDatasetBuilder
    class << self
      def refresh_if_needed!
        return if csv_path.exist? && metadata_path.exist? && !stale?
        refresh!
      end

      def refresh!
        FileUtils.mkdir_p(base_dir)

        seasons = ((Date.today.year - 6)..Date.today.year).to_a
        rows = seasons.flat_map { |season| season_rows(season) }
        raw_metric_keys = rows.flat_map { |r| r[:raw_metrics].keys }.uniq
        metric_key_map = build_metric_key_map(raw_metric_keys)
        metric_headers = metric_key_map.values
        rows.each do |row|
          row[:metrics] = metric_key_map.each_with_object({}) do |(raw, normalized), memo|
            memo[normalized] = normalize_metric_value(row.dig(:raw_metrics, raw))
          end
        end

        player_ids = rows.filter_map { |r| integer_or_nil(r[:player_id]) }.uniq
        positions = fetch_positions(player_ids)

        CSV.open(csv_path, "wb") do |csv|
          csv << base_headers + metric_headers
          rows.each do |r|
            pos = positions[r[:player_id]] || {}
            team_abbr = (pos[:team] || r[:team]).to_s
            csv << [
              r[:player_id],
              r[:name],
              team_abbr,
              league_for_team(team_abbr),
              pos[:position],
              r[:season],
              r[:g],
              r[:pa],
              r[:ab],
              r[:h],
              r[:hr],
              r[:rbi],
              r[:sb],
              r[:bb],
              r[:k],
              r[:avg],
              r[:obp],
              r[:slg],
              r[:ops],
            ] + metric_headers.map { |h| r[:metrics][h] }
          end
        end

        File.write(metadata_path, JSON.pretty_generate({
          last_refreshed_at: Time.now.utc.iso8601,
          seasons: seasons,
          row_count: rows.size,
          metric_columns: metric_headers.size
        }))
      end

      def metadata
        return {} unless metadata_path.exist?
        JSON.parse(File.read(metadata_path), symbolize_names: true)
      rescue JSON::ParserError
        {}
      end

      def csv_path
        base_dir.join("players.csv")
      end

      private

      def base_headers
        %w[player_id name team league position season g pa ab h hr rbi sb bb k avg obp slg ops]
      end

      def base_dir
        Rails.root.join("tmp", "sandbox")
      end

      def metadata_path
        base_dir.join("players.metadata.json")
      end

      def stale?
        refreshed_at = metadata[:last_refreshed_at]
        return true if refreshed_at.blank?
        Time.parse(refreshed_at) < 6.hours.ago
      rescue ArgumentError
        true
      end

      def season_rows(season)
        rows = StatcastService.batting_leaderboard(season, min_pa: 0)

        rows.filter_map do |row|
          player_id = integer_or_nil(row["xMLBAMID"] || row["MLBID"])
          next if player_id.nil?

          {
            player_id: player_id,
            name: row["Name"],
            team: row["Team"],
            season: season,
            g: integer_or_nil(row["G"]),
            pa: integer_or_nil(row["PA"]),
            ab: integer_or_nil(row["AB"]),
            h: integer_or_nil(row["H"]),
            hr: integer_or_nil(row["HR"]),
            rbi: integer_or_nil(row["RBI"]),
            sb: integer_or_nil(row["SB"]),
            bb: integer_or_nil(row["BB"]),
            k: integer_or_nil(row["SO"]),
            avg: float_or_nil(row["AVG"]),
            obp: float_or_nil(row["OBP"]),
            slg: float_or_nil(row["SLG"]),
            ops: float_or_nil(row["OPS"]),
            raw_metrics: row.transform_keys(&:to_s),
            metrics: {}
          }
        end
      end

      def build_metric_key_map(raw_keys)
        used = {}
        raw_keys.sort.each_with_object({}) do |raw, memo|
          normalized = normalize_metric_key(raw)
          if used[normalized]
            used[normalized] += 1
            normalized = "#{normalized}_#{used[normalized]}"
          else
            used[normalized] = 1
          end
          memo[raw] = normalized
        end
      end

      def normalize_metric_key(key)
        normalized = key.to_s
          .gsub("%", " pct ")
          .gsub("+", " plus ")
          .gsub("/", " per ")
          .gsub("-", " minus ")
          .gsub(/[^a-zA-Z0-9]+/, "_")
          .downcase
          .gsub(/_+/, "_")
          .gsub(/\A_|_\z/, "")
        normalized.presence || "metric"
      end

      def league_for_team(team_abbr)
        return nil if team_abbr.blank?
        nl = %w[ARI ATL CHC CIN COL LAD MIA MIL NYM PHI PIT SD SF STL WSH]
        al = %w[BAL BOS CWS CLE DET HOU KC LAA MIN NYY OAK SEA TB TEX TOR]
        return "NL" if nl.include?(team_abbr)
        return "AL" if al.include?(team_abbr)
        nil
      end

      def normalize_metric_value(value)
        return nil if value.nil?
        str = value.to_s.strip
        return nil if str.empty?
        return str if str.match?(/[a-zA-Z]/)

        Float(str)
      rescue ArgumentError
        str
      end

      def fetch_positions(player_ids)
        return {} if player_ids.empty?

        conn = Faraday.new(url: "https://statsapi.mlb.com/api/v1") do |f|
          f.request :retry, max: 2, interval: 0.5
          f.response :raise_error
          f.options.timeout = 20
          f.options.open_timeout = 8
        end

        player_ids.each_slice(75).each_with_object({}) do |slice, memo|
          resp = conn.get("people", { personIds: slice.join(",") })
          data = JSON.parse(resp.body)

          (data["people"] || []).each do |p|
            memo[p["id"].to_i] = {
              position: p.dig("primaryPosition", "abbreviation"),
              team: p.dig("currentTeam", "abbreviation")
            }
          end
        end
      rescue Faraday::Error => e
        Rails.logger.warn("Failed fetching player positions: #{e.message}")
        {}
      end

      def integer_or_nil(value)
        return nil if value.nil?
        str = value.to_s.strip
        return nil if str.empty?
        Float(str).round
      rescue ArgumentError, TypeError
        nil
      end

      def float_or_nil(value)
        return nil if value.nil?
        Float(value.to_s)
      rescue ArgumentError, TypeError
        nil
      end
    end
  end
end
