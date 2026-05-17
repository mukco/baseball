module Api
  class AssistantController < BaseController
    # POST /api/assistant/ask
    def ask
      render json: AssistantService.call(
        question:       params[:question].to_s,
        context:        params[:context]&.to_unsafe_h || {},
        prior_messages: Array(params[:messages]).map { |m| { role: m[:role].to_s, text: m[:text].to_s } }
      )
    end
  end
end
