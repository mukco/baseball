class MlService
  BASE_URL = "http://localhost:8002".freeze

  class << self
    def health
      get("/health")
    end

    def columns(table:)
      duckdb = Warehouse::Manager.duckdb_path
      get("/columns/#{table}", duckdb_path: duckdb)
    end

    def train(config)
      payload = config.merge(duckdb_path: Warehouse::Manager.duckdb_path)
      post("/train", payload)
    end

    private

    def get(path, params = {})
      conn.get(path, params).then { |r| JSON.parse(r.body, symbolize_names: true) }
    rescue Faraday::Error => e
      { error: "ML service unavailable: #{e.message}" }
    end

    def post(path, body)
      resp = conn.post(path) do |req|
        req.headers["Content-Type"] = "application/json"
        req.body = JSON.generate(body)
      end
      JSON.parse(resp.body, symbolize_names: true)
    rescue Faraday::Error => e
      { error: faraday_error_detail(e) }
    end

    def faraday_error_detail(err)
      raw = err.response.is_a?(Hash) ? err.response[:body] : nil
      detail = JSON.parse(raw.to_s, symbolize_names: true)[:detail]
      detail.is_a?(String) ? detail : "ML service unavailable: #{err.message}"
    rescue
      "ML service unavailable: #{err.message}"
    end

    def conn
      @conn ||= Faraday.new(url: BASE_URL) do |f|
        f.options.timeout      = 180
        f.options.open_timeout = 5
        f.response :raise_error
      end
    end
  end
end
