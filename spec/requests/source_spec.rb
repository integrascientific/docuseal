# frozen_string_literal: true

# AGPL section 13 offer of source and the AGPL 7(b) DocuSeal attribution (see INTEGRA-BRANDING.md).
describe 'Source page' do
  it 'is reachable without authentication and offers the corresponding source' do
    get '/source'

    expect(response).to have_http_status(:ok)
    expect(response.body).to include('modified version of DocuSeal')
    expect(response.body).to include('https://github.com/integrascientific/docuseal')
    expect(response.body).to include("https://github.com/integrascientific/docuseal/tree/#{Docuseal::UPSTREAM_VERSION}")
    expect(response.body).to include('at no charge')
  end

  it 'carries the DocuSeal attribution line with a link to the source page' do
    get '/source'

    expect(response.body).to include('Signing engine based on')
    expect(response.body).to include('href="https://www.docuseal.com"')
    expect(response.body).to include('href="/source"')
  end
end
