class AppSettingsService
  SETTINGS_PATH = Rails.root.join("config/app_settings.json")

  class << self
    def all
      return {} unless File.exist?(SETTINGS_PATH)
      JSON.parse(File.read(SETTINGS_PATH))
    rescue StandardError
      {}
    end

    def get(key)
      all[key.to_s]
    end

    def update(attrs)
      current = all
      current.merge!(attrs.stringify_keys)
      File.write(SETTINGS_PATH, JSON.pretty_generate(current))
      current
    rescue StandardError => e
      raise "Could not save settings: #{e.message}"
    end
  end
end
