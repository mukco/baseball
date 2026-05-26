class Api::SettingsController < Api::BaseController
  def show
    render json: AppSettingsService.all
  end

  def update
    allowed = params.require(:settings).permit(:obsidian_vault_path).to_h
    result  = AppSettingsService.update(allowed)
    render json: result
  end
end
