# frozen_string_literal: true

# Public "offer of source" page for this modified DocuSeal (AGPL section 13).
# Must stay reachable without authentication. See INTEGRA-BRANDING.md.
class SourceController < ApplicationController
  layout 'form'

  skip_before_action :maybe_redirect_to_setup
  skip_before_action :authenticate_user!
  skip_authorization_check

  def show; end
end
