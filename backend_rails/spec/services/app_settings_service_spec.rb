require "rails_helper"
require "tempfile"

RSpec.describe AppSettingsService do
  let(:tmp_path) { Tempfile.new(["app_settings", ".json"]).path }

  before do
    stub_const("AppSettingsService::SETTINGS_PATH", Pathname.new(tmp_path))
    File.delete(tmp_path) if File.exist?(tmp_path)
  end

  after { File.delete(tmp_path) if File.exist?(tmp_path) }

  describe ".all" do
    it "returns empty hash when file does not exist" do
      expect(described_class.all).to eq({})
    end

    it "returns parsed JSON when file exists" do
      File.write(tmp_path, JSON.generate({ "obsidian_vault_path" => "/vault" }))
      expect(described_class.all).to eq({ "obsidian_vault_path" => "/vault" })
    end

    it "returns empty hash when file is malformed" do
      File.write(tmp_path, "not json")
      expect(described_class.all).to eq({})
    end
  end

  describe ".get" do
    it "returns the value for a given key" do
      File.write(tmp_path, JSON.generate({ "obsidian_vault_path" => "/my/vault" }))
      expect(described_class.get("obsidian_vault_path")).to eq("/my/vault")
    end

    it "returns nil for a missing key" do
      expect(described_class.get("missing_key")).to be_nil
    end
  end

  describe ".update" do
    it "writes new settings to disk" do
      described_class.update(obsidian_vault_path: "/new/path")
      expect(File.read(tmp_path)).to include("obsidian_vault_path")
      expect(described_class.get("obsidian_vault_path")).to eq("/new/path")
    end

    it "merges with existing settings" do
      File.write(tmp_path, JSON.generate({ "other_key" => "value" }))
      described_class.update(obsidian_vault_path: "/vault")
      result = described_class.all
      expect(result["other_key"]).to eq("value")
      expect(result["obsidian_vault_path"]).to eq("/vault")
    end

    it "returns the merged settings hash" do
      result = described_class.update(obsidian_vault_path: "/vault")
      expect(result).to be_a(Hash)
      expect(result["obsidian_vault_path"]).to eq("/vault")
    end
  end
end
