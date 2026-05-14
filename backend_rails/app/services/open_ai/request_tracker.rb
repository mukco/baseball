require "json"
require "fileutils"

module OpenAi
  class RequestTracker
    LOG_PATH = Rails.root.join("log", "openai_requests.jsonl")

    class << self
      def log(payload)
        FileUtils.mkdir_p(LOG_PATH.dirname)

        File.open(LOG_PATH, "a") do |file|
          file.flock(File::LOCK_EX)
          file.puts(JSON.generate(payload))
          file.flock(File::LOCK_UN)
        end
      rescue StandardError => e
        Rails.logger.error("OpenAI request tracking failed: #{e.class} #{e.message}")
      end
    end
  end
end
