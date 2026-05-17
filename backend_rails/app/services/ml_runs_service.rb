require "json"
require "securerandom"

class MlRunsService
  RUNS_PATH  = Rails.root.join("tmp", "ml_runs.json").freeze
  MAX_STORED = 50

  class << self
    def all
      load_runs
    end

    def save(config:, result:)
      runs = load_runs
      run  = {
        id:         SecureRandom.hex(8),
        created_at: Time.now.utc.iso8601,
        config:     config,
        result:     result
      }
      runs.unshift(run)
      runs = runs.first(MAX_STORED)
      write_runs(runs)
      run
    end

    def delete(id)
      runs = load_runs
      before = runs.length
      runs.reject! { |r| r[:id] == id }
      write_runs(runs) if runs.length != before
      runs.length != before
    end

    private

    def load_runs
      return [] unless File.exist?(RUNS_PATH)
      data = JSON.parse(File.read(RUNS_PATH), symbolize_names: true)
      data.is_a?(Array) ? data : []
    rescue JSON::ParserError
      []
    end

    def write_runs(runs)
      FileUtils.mkdir_p(RUNS_PATH.dirname)
      File.write(RUNS_PATH, JSON.generate(runs))
    end
  end
end
