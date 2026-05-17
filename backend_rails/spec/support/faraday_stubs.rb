module FaradayStubs
  def stub_faraday_get(url, body:, status: 200)
    stub_request(:get, url).to_return(
      status: status,
      body: body.is_a?(String) ? body : body.to_json,
      headers: { "Content-Type" => "application/json" }
    )
  end

  def stub_faraday_post(url, body:, status: 200)
    stub_request(:post, url).to_return(
      status: status,
      body: body.is_a?(String) ? body : body.to_json,
      headers: { "Content-Type" => "application/json" }
    )
  end
end

RSpec.configure do |config|
  config.include FaradayStubs
end
