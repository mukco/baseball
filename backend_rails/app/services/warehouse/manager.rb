require "json"
require "fileutils"
require "open3"
require "time"
require "digest"

module Warehouse
  class Manager
    CACHE_TTL = 6 * 3600

    class << self
      def refresh_if_needed!
        return if fresh?
        refresh!
      end

      def refresh!
        Rails.logger.info("Warehouse::Manager: starting full refresh")
        started = Time.now

        batter_count  = Warehouse::BatterIngester.ingest!
        pitcher_count = Warehouse::PitcherIngester.ingest!
        proj_counts   = Warehouse::FgProjectionIngester.ingest!
        team_counts   = Warehouse::TeamIngester.ingest!
        sim_counts    = Warehouse::SimulationIngester.ingest!

        build_duckdb!
        LeagueConstantsService.refresh!

        meta = {
          last_refreshed_at:    Time.now.utc.iso8601,
          batter_rows:          batter_count,
          pitcher_rows:         pitcher_count,
          fg_proj_batting:      proj_counts[:batting],
          fg_proj_pitching:     proj_counts[:pitching],
          team_batting_rows:    team_counts[:batting],
          team_pitching_rows:   team_counts[:pitching],
          sim_player_stat_rows: sim_counts[:player_stats],
          sim_standing_rows:    sim_counts[:team_standings],
          sim_season_rows:      sim_counts[:season_log],
          duration_s:           (Time.now - started).round(1),
          schema_fingerprint:   schema_fingerprint,
        }
        File.write(metadata_path, JSON.pretty_generate(meta))
        Rails.logger.info("Warehouse::Manager: complete in #{meta[:duration_s]}s")
        meta
      end

      def metadata
        return {} unless metadata_path.exist?
        JSON.parse(File.read(metadata_path), symbolize_names: true)
      rescue JSON::ParserError
        {}
      end

      def duckdb_path
        base_dir.join("baseball.duckdb").to_s
      end

      def exists?
        File.exist?(duckdb_path)
      end

      SIM_PLAYER_STATS_COLUMNS = %w[
        player_id player_name player_type team_id
        league_id league_name season franchise_id
        g ab h hr r rbi bb k doubles triples hbp sf
        avg obp slg ops
        g_pitched gs outs_pitched ip
        h_allowed er bb_allowed k_pitched bf hr_allowed w l sv
        era whip
      ].freeze

      SIM_TEAM_STANDINGS_COLUMNS = %w[
        league_id league_name season franchise_id
        team_id team_abbr team_name division
        w l pct gb rs ra run_diff
      ].freeze

      SIM_SEASON_LOG_COLUMNS = %w[
        league_id league_name season franchise_id franchise_name
        games_total games_played pct_complete complete
        champion_abbr batter_pitcher_blend created_at
      ].freeze

      def schema_fingerprint
        parts = [
          Warehouse::BatterIngester::NAMED_COLUMNS,
          Warehouse::PitcherIngester::NAMED_COLUMNS,
          Warehouse::FgProjectionIngester::BATTING_COLUMNS,
          Warehouse::FgProjectionIngester::PITCHING_COLUMNS,
          Warehouse::TeamIngester::BATTING_COLUMNS,
          Warehouse::TeamIngester::PITCHING_COLUMNS,
          SIM_PLAYER_STATS_COLUMNS,
          SIM_TEAM_STANDINGS_COLUMNS,
          SIM_SEASON_LOG_COLUMNS,
        ].map { |cols| cols.join(",") }.join("|")
        Digest::MD5.hexdigest(parts)[0, 8]
      end

      def fresh?
        return false unless metadata_path.exist? && File.exist?(duckdb_path)
        meta = metadata
        ts = meta[:last_refreshed_at]
        return false if ts.blank?
        return false unless Time.parse(ts) > Time.now - CACHE_TTL
        stored = meta[:schema_fingerprint]
        return false if stored.present? && stored != schema_fingerprint
        true
      rescue ArgumentError
        false
      end

      def stale?
        !fresh?
      end

      private

      def base_dir
        Rails.root.join("tmp", "warehouse")
      end

      def metadata_path
        base_dir.join("warehouse.metadata.json")
      end

      def build_duckdb!
        FileUtils.mkdir_p(base_dir)
        script = Rails.root.join("script", "warehouse_build.py")
        input  = JSON.generate({
          duckdb_path: duckdb_path,
          tables: {
            batters:                 Warehouse::BatterIngester.csv_path.to_s,
            pitchers:                Warehouse::PitcherIngester.csv_path.to_s,
            fg_projections_batting:  Warehouse::FgProjectionIngester.batting_csv_path.to_s,
            fg_projections_pitching: Warehouse::FgProjectionIngester.pitching_csv_path.to_s,
            teams_batting:           Warehouse::TeamIngester.batting_csv_path.to_s,
            teams_pitching:          Warehouse::TeamIngester.pitching_csv_path.to_s,
            sim_player_stats:        Warehouse::SimulationIngester.player_stats_csv_path.to_s,
            sim_team_standings:      Warehouse::SimulationIngester.team_standings_csv_path.to_s,
            sim_season_log:          Warehouse::SimulationIngester.season_log_csv_path.to_s,
          }
        })

        _out, err, status = Open3.capture3("python", script.to_s, stdin_data: input)
        raise "Warehouse DuckDB build failed: #{err.presence || '(no details)'}" unless status.success?
      end
    end
  end
end
