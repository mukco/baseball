module Api
  class YahooFantasyController < Api::BaseController
    def status
      render json: { authenticated: YahooFantasyService.authenticated? }
    end

    def auth_url
      render json: { url: YahooFantasyService.auth_url }
    end

    def callback
      code = params[:code]
      return redirect_to 'http://localhost:5173/fantasy?error=missing_code', allow_other_host: true unless code

      result = YahooFantasyService.exchange_code(code)
      if result[:error]
        redirect_to "http://localhost:5173/fantasy?error=#{CGI.escape(result[:error])}", allow_other_host: true
      else
        redirect_to 'http://localhost:5173/fantasy?connected=1', allow_other_host: true
      end
    end

    def roster
      render json: YahooFantasyService.roster
    end

    def dashboard
      refresh = ActiveModel::Type::Boolean.new.cast(params[:refresh])
      render json: YahooFantasyDashboardService.call(refresh: refresh)
    end

    def insights
      refresh = ActiveModel::Type::Boolean.new.cast(params[:refresh])
      render json: YahooFantasyInsightsService.call(refresh: refresh)
    end

    def free_agents
      refresh = ActiveModel::Type::Boolean.new.cast(params[:refresh])
      render json: YahooFantasyFreeAgentsService.call(refresh: refresh)
    end
  end
end
