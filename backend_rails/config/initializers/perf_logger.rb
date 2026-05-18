module PerfLogger
  LOG_PATH = Rails.root.join("log/perf.jsonl")
  MIN_MS   = (ENV["PERF_LOG_MIN_MS"] || 0).to_i

  def self.write(entry)
    File.open(LOG_PATH, "a") { |f| f.puts(entry.to_json) }
  rescue => e
    Rails.logger.error("[PerfLogger] write failed: #{e.message}")
  end

  # Faraday middleware — measures each outbound HTTP call
  class FaradayMiddleware < Faraday::Middleware
    def call(env)
      start = Process.clock_gettime(Process::CLOCK_MONOTONIC)
      @app.call(env).on_complete do |res_env|
        ms = ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - start) * 1_000).round
        next if ms < MIN_MS

        PerfLogger.write(
          ts:          Time.now.utc.iso8601(3),
          type:        "http",
          duration_ms: ms,
          method:      res_env[:method].to_s.upcase,
          url:         res_env[:url].to_s,
          status:      res_env[:status]
        )
      end
    rescue => e
      PerfLogger.write(ts: Time.now.utc.iso8601(3), type: "http",
                       error: e.class.name, url: env[:url].to_s)
      raise
    end
  end
end

# Inject into every Faraday connection at construction time (before builder locks)
Faraday::Connection.prepend(Module.new do
  def initialize(url = nil, options = {}, &block)
    super
    builder.use PerfLogger::FaradayMiddleware unless builder.locked?
  rescue => e
    Rails.logger.error("[PerfLogger] Faraday inject failed: #{e.message}")
  end
end)

# ActiveRecord SQL query timing
ActiveSupport::Notifications.subscribe("sql.active_record") do |*, payload|
  ms = (payload[:duration] || 0).round
  next if ms < PerfLogger::MIN_MS
  next if payload[:sql] =~ /\A\s*(SCHEMA|PRAGMA|sqlite_master|BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)/i

  PerfLogger.write(
    ts:          Time.now.utc.iso8601(3),
    type:        "query",
    duration_ms: ms,
    sql:         payload[:sql]&.squish,
    name:        payload[:name]
  )
end

# Rails controller request timing (whole action, all service time included)
ActiveSupport::Notifications.subscribe("process_action.action_controller") do |_name, start, finish, _id, payload|
  ms = ((finish - start) * 1_000).round
  next if ms < PerfLogger::MIN_MS

  PerfLogger.write(
    ts:          Time.now.utc.iso8601(3),
    type:        "request",
    duration_ms: ms,
    method:      payload[:method],
    path:        payload[:path],
    status:      payload[:status],
    controller:  payload[:controller],
    action:      payload[:action]
  )
end
