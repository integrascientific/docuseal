# frozen_string_literal: true

# Integra Sign: upstream redirects /upgrade, /manage and /console_redirect to the DocuSeal
# console (plans, licence management) with a signed user token. This instance has no
# DocuSeal console account and never upsells, so every such request goes home instead.
class ConsoleRedirectController < ApplicationController
  skip_before_action :authenticate_user!
  skip_authorization_check

  def index
    redirect_to root_path
  end
end
