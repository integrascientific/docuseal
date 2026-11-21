# frozen_string_literal: true

# Integra Sign: upstream offers the DocuSeal developer newsletter here and posts the
# address to docuseal.com. This instance sends nothing to DocuSeal.
class NewslettersController < ApplicationController
  skip_authorization_check

  def show
    redirect_to root_path
  end

  def update
    redirect_to root_path
  end
end
