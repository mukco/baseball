require "json"
require "open3"

module Sandbox
  class QueryService
    MAX_LIMIT = 500

    class << self
      def run(sql:, limit: 500)
        cleaned_sql = validate_sql!(sql.to_s)

        request = {
          sql: cleaned_sql,
          limit: [[limit.to_i, 1].max, MAX_LIMIT].min,
          tables: DatasetRegistry.tables_for_query
        }

        started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
        stdout, stderr, status = Open3.capture3("python", script_path.to_s, stdin_data: JSON.generate(request))
        runtime_ms = ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - started) * 1000).round

        raise "Sandbox query process failed: #{stderr}" unless status.success?

        parsed = JSON.parse(stdout)
        raise parsed["error"] if parsed["error"].present?

        {
          columns: parsed["columns"] || [],
          rows: parsed["rows"] || [],
          rowCount: parsed["row_count"] || 0,
          truncated: parsed["truncated"] || false,
          runtimeMs: runtime_ms,
          datasets: DatasetRegistry.datasets
        }
      end

      private

      def script_path
        Rails.root.join("script", "sandbox_duckdb_query.py")
      end

      def validate_sql!(sql)
        raise "SQL query is required" if sql.blank?

        stripped = sql.gsub(/--.*$/, "").strip
        stripped = stripped.chomp(";").strip

        unless stripped.match?(/\A(with\b[\s\S]+?select\b|select\b)/i)
          raise "Only read-only SELECT queries are allowed"
        end

        if stripped.match?(/\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|attach|copy|call)\b/i)
          raise "Only read-only SELECT queries are allowed"
        end

        raise "Only one SQL statement is allowed" if stripped.include?(";")

        stripped
      end
    end
  end
end
