require "securerandom"

module OpenAi
  class Client
    DEFAULT_MODEL = "gpt-4.1".freeze
    DEFAULT_BASE_URL = "https://api.openai.com".freeze

    def initialize(api_key: ENV["OPENAI_API_KEY"], model: ENV["OPENAI_MODEL"], base_url: ENV["OPENAI_BASE_URL"])
      @api_key = api_key
      @model = model.presence || DEFAULT_MODEL
      @base_url = base_url.presence || DEFAULT_BASE_URL
      @project = ENV["OPENAI_PROJECT"].presence
      raise "OPENAI_API_KEY is not configured" if @api_key.blank?
    end

    def json_completion(system_prompt:, user_payload:, interaction_type:, metadata: {}, temperature: 0.2)
      request_id = SecureRandom.uuid
      started_at = Process.clock_gettime(Process::CLOCK_MONOTONIC)
      response_json = nil

      body = {
        model: @model,
        response_format: { type: "json_object" },
        temperature: temperature,
        messages: [
          { role: "system", content: system_prompt },
          { role: "user", content: JSON.generate(user_payload) }
        ]
      }

      response = connection.post("/v1/chat/completions") do |req|
        req.headers["Authorization"] = "Bearer #{@api_key}"
        req.headers["Content-Type"] = "application/json"
        req.headers["OpenAI-Project"] = @project if @project
        req.body = JSON.generate(body)
      end

      response_json = JSON.parse(response.body)
      content = response_json.dig("choices", 0, "message", "content").to_s
      parsed_content = JSON.parse(content)

      usage = response_json["usage"] || {}
      log_request(
        request_id: request_id,
        interaction_type: interaction_type,
        metadata: metadata,
        started_at: started_at,
        status: "success",
        prompt_preview: redact_preview(body[:messages].last[:content]),
        response_preview: redact_preview(content),
        usage: usage
      )

      {
        request_id: request_id,
        model: response_json["model"] || @model,
        output: parsed_content,
        usage: {
          input_tokens: usage["prompt_tokens"],
          output_tokens: usage["completion_tokens"],
          total_tokens: usage["total_tokens"]
        }
      }
    rescue JSON::ParserError => e
      log_request(
        request_id: request_id,
        interaction_type: interaction_type,
        metadata: metadata,
        started_at: started_at,
        status: "error",
        prompt_preview: redact_preview(body.dig(:messages, -1, :content)),
        response_preview: redact_preview(response_json.to_s),
        usage: response_json&.dig("usage") || {},
        error: e
      )
      raise "OpenAI returned non-JSON content"
    rescue Faraday::Error => e
      details = extract_faraday_error(e)
      wrapped_error = StandardError.new(details[:message])

      log_request(
        request_id: request_id,
        interaction_type: interaction_type,
        metadata: metadata.merge(openai_request_id: details[:request_id]),
        started_at: started_at,
        status: "error",
        prompt_preview: redact_preview(body&.dig(:messages, -1, :content)),
        response_preview: redact_preview(details[:raw_body]),
        usage: response_json&.dig("usage") || {},
        error: wrapped_error
      )

      raise wrapped_error
    rescue StandardError => e
      log_request(
        request_id: request_id,
        interaction_type: interaction_type,
        metadata: metadata,
        started_at: started_at,
        status: "error",
        prompt_preview: redact_preview(body&.dig(:messages, -1, :content)),
        response_preview: redact_preview(response_json.to_s),
        usage: response_json&.dig("usage") || {},
        error: e
      )
      raise
    end

    private

    def connection
      @connection ||= Faraday.new(url: @base_url) do |f|
        f.request :retry, max: 2, interval: 0.5
        f.response :raise_error
        f.options.timeout = 25
        f.options.open_timeout = 8
      end
    end

    def redact_preview(text)
      text.to_s
        .gsub(/sk-[A-Za-z0-9_-]+/, "[REDACTED_API_KEY]")
        .gsub(/\s+/, " ")
        .strip[0, 700]
    end

    def log_request(request_id:, interaction_type:, metadata:, started_at:, status:, prompt_preview:, response_preview:, usage:, error: nil)
      latency_ms = ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - started_at) * 1000).round
      usage_hash = usage.is_a?(Hash) ? usage : {}

      OpenAi::RequestTracker.log(
        {
          request_id: request_id,
          timestamp: Time.current.iso8601,
          interaction_type: interaction_type,
          model: @model,
          endpoint: "/v1/chat/completions",
          status: status,
          latency_ms: latency_ms,
          input_tokens: usage_hash["prompt_tokens"],
          output_tokens: usage_hash["completion_tokens"],
          total_tokens: usage_hash["total_tokens"],
          cache_hit: false,
          metadata: metadata,
          prompt_preview: prompt_preview,
          response_preview: response_preview,
          error_class: error&.class&.name,
          error_message: error&.message
        }
      )
    end

    def extract_faraday_error(error)
      response = error.response || {}
      headers = response[:headers] || {}
      body = response[:body].to_s
      parsed = JSON.parse(body)
      api_error = parsed["error"] || {}
      message = api_error["message"].presence || error.message
      code = api_error["code"].presence

      {
        message: ["OpenAI API error", code, message].compact.join(": "),
        request_id: headers["x-request-id"],
        raw_body: body
      }
    rescue JSON::ParserError
      {
        message: error.message,
        request_id: headers["x-request-id"],
        raw_body: body
      }
    end
  end
end
