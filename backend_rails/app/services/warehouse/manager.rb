module Warehouse
  class Manager
    WAREHOUSE_DIR = Rails.root.join("tmp", "warehouse").freeze
    DUCKDB_PATH   = WAREHOUSE_DIR.join("baseball.duckdb").freeze

    class << self
      def duckdb_path
        DUCKDB_PATH.to_s
      end

      def exists?
        File.exist?(DUCKDB_PATH)
      end
    end
  end
end
