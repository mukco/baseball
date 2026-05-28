require "rails_helper"

RSpec.describe "Api::Settings", type: :request do
  describe "GET /api/settings" do
    it "returns current settings" do
      allow(AppSettingsService).to receive(:all).and_return({ "obsidian_vault_path" => "/vault" })
      get "/api/settings"
      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)["obsidian_vault_path"]).to eq("/vault")
    end

    it "returns empty object when no settings saved" do
      allow(AppSettingsService).to receive(:all).and_return({})
      get "/api/settings"
      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)).to eq({})
    end
  end

  describe "PATCH /api/settings" do
    it "updates and returns settings" do
      allow(AppSettingsService).to receive(:update).with({ "obsidian_vault_path" => "/my/vault" })
        .and_return({ "obsidian_vault_path" => "/my/vault" })

      patch "/api/settings", params: { settings: { obsidian_vault_path: "/my/vault" } }, as: :json
      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)["obsidian_vault_path"]).to eq("/my/vault")
    end

    it "ignores unpermitted parameters" do
      allow(AppSettingsService).to receive(:update).with({}).and_return({})
      patch "/api/settings", params: { settings: { unknown_key: "value" } }, as: :json
      expect(response).to have_http_status(:ok)
    end
  end
end
