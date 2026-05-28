class ObsidianService
  VALID_TYPES   = %w[reference how-to concept log scratch].freeze
  VALID_STATUSES = %w[draft active stable].freeze

  class << self
    def save_note(title:, content:, subfolder: nil, tags: nil, type: nil, status: nil, source: nil)
      vault_path = AppSettingsService.get("obsidian_vault_path").to_s.strip
      return { error: "Obsidian vault is not configured. Open Settings to set the vault path." } if vault_path.blank?
      return { error: "Vault path does not exist: #{vault_path}" } unless Dir.exist?(vault_path)

      target_dir = File.join(vault_path, subfolder.presence || "Baseball")
      FileUtils.mkdir_p(target_dir)

      safe_title = title.to_s.gsub(/[<>:"|?*\/\\]/, "-").strip
      safe_title = "Untitled" if safe_title.blank?
      filename   = "#{Date.today} #{safe_title}.md"
      filepath   = File.join(target_dir, filename)

      note_type   = VALID_TYPES.include?(type.to_s) ? type.to_s : "scratch"
      note_status = VALID_STATUSES.include?(status.to_s) ? status.to_s : "draft"

      tag_list = Array(tags).map(&:to_s).reject(&:blank?)
      tag_list = ["baseball"] if tag_list.empty?
      tag_list.unshift("baseball") unless tag_list.include?("baseball")

      frontmatter = { "tags" => tag_list, "type" => note_type, "status" => note_status, "date" => Date.today.to_s }
      frontmatter["source"] = source.to_s if source.present?

      fm_lines = frontmatter.map do |k, v|
        v.is_a?(Array) ? "#{k}: [#{v.join(", ")}]" : "#{k}: #{v}"
      end

      note = "---\n#{fm_lines.join("\n")}\n---\n\n#{content.strip}\n"

      File.write(filepath, note)
      { success: true, path: filepath, title: safe_title, subfolder: target_dir }
    rescue StandardError => e
      { error: e.message }
    end
  end
end
