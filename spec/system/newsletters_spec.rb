# frozen_string_literal: true

# Integra Sign: the upstream DocuSeal newsletter sign-up is disabled; nothing is sent to docuseal.com.
RSpec.describe 'Newsletter' do
  let(:user) { create(:user, account: create(:account)) }

  before do
    sign_in(user)
    stub_request(:post, Docuseal::NEWSLETTER_URL).to_return(status: 200)
  end

  it 'redirects to the dashboard instead of offering the newsletter' do
    visit newsletter_path

    expect(page).to have_current_path(root_path, ignore_query: true)
    expect(page).to have_no_content('Developer Newsletters')
    expect(a_request(:post, Docuseal::NEWSLETTER_URL)).not_to have_been_made
  end
end
