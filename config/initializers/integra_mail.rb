# frozen_string_literal: true

# Integra Sign's mail delivery (INTEGRA-BRANDING.md §7).
#
# DocuSeal composes every e-mail it sends — signature requests, reminders, completed copies, one-time
# codes — and in Integra's deployment it had no transport, so all of them went nowhere. This file is the
# one seam that changes that: a custom ActionMailer delivery method that hands each composed message to
# the Integra CRM's `sign-mail` route (crm/app/src/functions/sign-mail.ts in the monorepo), which renders
# it in the Integra e-mail frame and sends it through Microsoft 365 as info@integrascientific.com.
#
# Nothing else in DocuSeal's mail changes: the mailers, their views, variables, triggers and conditions are
# upstream's, untouched. Only the plain-text part leaves this process (the route accepts no HTML: the shell
# is Integra's), with the subject and each recipient's address and display name.
#
# CONFIGURATION (environment, set by integra-portal/infra/esign.ts):
#   INTEGRA_MAIL_URL    the route, https://<CRM sidecar>/sign-mail — HTTPS only
#   INTEGRA_MAIL_TOKEN  the bearer the route expects (the sidecar's OPS_TOKEN)
#   SMTP_FROM           read by DocuSeal's own ActionMailerConfigsInterceptor once a delivery method is
#                       configured; any value will do (the CRM sends as its own mailbox)
#
# WHEN IT IS ON: always in production, and in any other environment that sets INTEGRA_MAIL_URL. Development
# keeps letter_opener_web and test keeps :test unless someone opts in.
#
# WHEN IT IS NOT CONFIGURED it never drops mail in silence — that was the bug:
#   - at boot, an ERROR line naming the missing variables goes to the log and to stderr;
#   - at send, IntegraMail::NotConfigured is raised, so the Sidekiq/ActiveJob job fails and retries and the
#     error is in the log. raise_delivery_errors is forced on, so even a non-bang `deliver_now` raises.
# Boot is not stopped on purpose: the signing pages must keep serving links already sent.
#
# FAILURES: a route that cannot be reached within the timeouts, or answers anything but 200 {"ok":true},
# raises IntegraMail::DeliveryFailed naming the status and the route's error code. The token never appears
# in an error or a log line.
#
# REPLY-TO: none is sent, so the route sets the sending mailbox (info@): replies come back to the Integra
# mailbox, the one place they are read. DocuSeal's own From and Reply-To are not forwarded.
#
# RECIPIENTS: the route takes one address, so a message is sent once per address in To, Cc and Bcc (a
# completed copy to several signatories becomes one e-mail each; nobody sees another's address). If a later
# one fails the job retries the whole message, and the earlier recipients may receive it twice — duplicated,
# never lost.
#
# ATTACHMENTS are not carried (the route's shape has none): a completed copy arrives with its link to the
# signed document but without the PDF and audit log. Each such message logs a WARN naming the files.

require 'json'
require 'net/http'
require 'openssl'
require 'uri'

module IntegraMail
  class NotConfigured < StandardError; end
  class DeliveryFailed < StandardError; end

  OPEN_TIMEOUT = 5
  WRITE_TIMEOUT = 10
  # The route fetches a Graph token, creates the message and sends it; API Gateway itself gives up at 30 s.
  READ_TIMEOUT = 20

  MAX_SUBJECT = 300
  MAX_NAME = 200

  module_function

  def url
    ENV['INTEGRA_MAIL_URL'].to_s.strip
  end

  def token
    ENV['INTEGRA_MAIL_TOKEN'].to_s.strip
  end

  def active?
    Rails.env.production? || ENV['INTEGRA_MAIL_URL'].present?
  end

  # The variables a send needs and does not have, by name.
  def missing_settings
    missing = []
    missing << 'INTEGRA_MAIL_URL' if url.empty?
    missing << 'INTEGRA_MAIL_TOKEN' if token.empty?
    missing
  end

  def endpoint!
    missing = missing_settings
    if missing.any?
      raise NotConfigured,
            "Integra Sign cannot send e-mail: #{missing.join(' and ')} not set. The message was NOT sent."
    end

    uri = URI.parse(url)
    unless uri.is_a?(URI::HTTPS) && uri.host.present?
      raise NotConfigured, 'Integra Sign cannot send e-mail: INTEGRA_MAIL_URL must be an https:// URL. ' \
                           'The message was NOT sent.'
    end

    uri
  rescue URI::InvalidURIError
    raise NotConfigured, 'Integra Sign cannot send e-mail: INTEGRA_MAIL_URL is not a URL. The message was NOT sent.'
  end

  def single_line(value, max)
    value.to_s.gsub(/\s*[\r\n]+\s*/, ' ').strip[0, max]
  end

  def utf8(value)
    text = value.to_s.dup
    text.force_encoding(Encoding::UTF_8) if text.encoding == Encoding::ASCII_8BIT
    text.encode(Encoding::UTF_8, invalid: :replace, undef: :replace).scrub
  end

  # DocuSeal's plain-text part: HtmlToPlainTextInterceptor adds one to every HTML message before delivery.
  def text_of(mail)
    if mail.multipart?
      return utf8(mail.text_part.decoded) if mail.text_part
      return utf8(HtmlToPlainText.call(mail.html_part.decoded)) if mail.html_part
    elsif mail.mime_type.to_s.start_with?('text/html')
      return utf8(HtmlToPlainText.call(mail.body.decoded))
    end

    utf8(mail.body.decoded)
  end

  # [[address, display name or nil], ...] across To, Cc and Bcc, each address once.
  def recipients(mail)
    list = %i[to cc bcc].flat_map do |key|
      field = mail[key]
      next [] if field.nil?

      if field.respond_to?(:addrs)
        field.addrs.map { |addr| [addr.address.to_s, addr.display_name.presence] }
      else
        Array(mail.public_send(key)).map { |address| [address.to_s, nil] }
      end
    end

    list.reject { |address, _| address.blank? }.uniq { |address, _| address.downcase }
  end

  def payload_for(mail, address, name)
    payload = { to: address, subject: single_line(utf8(mail.subject), MAX_SUBJECT), text: text_of(mail) }
    display = single_line(utf8(name), MAX_NAME) if name
    payload[:toName] = display if display.present?
    payload
  end

  def post(uri, payload)
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = true
    http.open_timeout = OPEN_TIMEOUT
    http.write_timeout = WRITE_TIMEOUT
    http.read_timeout = READ_TIMEOUT

    request = Net::HTTP::Post.new(uri.request_uri)
    request['Content-Type'] = 'application/json'
    request['Authorization'] = "Bearer #{token}"
    request.body = JSON.generate(payload)

    response = http.request(request)
    answer = begin
      JSON.parse(response.body.to_s)
    rescue JSON::ParserError
      {}
    end
    answer = {} unless answer.is_a?(Hash)

    unless response.code.to_i == 200 && answer['ok'] == true
      detail = [answer['error'], answer['field'], answer['detail']].compact.join(' ')
      raise DeliveryFailed,
            "Integra Sign could not send e-mail: #{uri.host}#{uri.path} answered #{response.code} " \
            "#{detail.presence || response.body.to_s[0, 200]}. The message was NOT sent."
    end

    answer
  rescue Net::OpenTimeout, Net::ReadTimeout, Net::WriteTimeout, Timeout::Error, SocketError, SystemCallError,
         IOError, OpenSSL::SSL::SSLError => e
    raise DeliveryFailed,
          "Integra Sign could not reach #{uri.host}#{uri.path} (#{e.class}: #{e.message}). The message was NOT sent."
  end

  # The ActionMailer delivery method (registered below as :integra_mail).
  class Delivery
    attr_accessor :settings

    def initialize(settings = {})
      @settings = settings
    end

    def deliver!(mail)
      uri = IntegraMail.endpoint!
      recipients = IntegraMail.recipients(mail)
      raise DeliveryFailed, 'Integra Sign could not send e-mail: the message has no recipient.' if recipients.empty?

      if mail.attachments.any?
        Rails.logger.warn(
          "[integra_mail] #{mail.attachments.size} attachment(s) not carried (the route takes text only): " \
          "#{mail.attachments.map(&:filename).join(', ')}"
        )
      end

      recipients.each do |address, name|
        answer = IntegraMail.post(uri, IntegraMail.payload_for(mail, address, name))
        Rails.logger.info(
          "[integra_mail] sent messageId=#{answer['messageId']} internetMessageId=#{answer['internetMessageId']} " \
          "replyTo=#{answer['replyTo']}"
        )
      end

      mail
    end
  end
end

ActiveSupport.on_load(:action_mailer) do
  add_delivery_method :integra_mail, IntegraMail::Delivery
end

if IntegraMail.active?
  # The application-level setting is what DocuSeal's ActionMailerConfigsInterceptor reads: when it is set, the
  # interceptor keeps the message's delivery method; when it is not, it swaps in :test (or an SMTP config
  # stored in the database) — a second way to lose mail. Both the config and the class are set, so the result
  # is the same whether ActionMailer::Base has been loaded yet or not.
  Rails.application.config.action_mailer.delivery_method = :integra_mail
  Rails.application.config.action_mailer.raise_delivery_errors = true

  ActiveSupport.on_load(:action_mailer) do
    self.delivery_method = :integra_mail
    self.raise_delivery_errors = true
  end

  Rails.application.config.after_initialize do
    missing = IntegraMail.missing_settings
    missing << 'SMTP_FROM' if ENV['SMTP_FROM'].blank?

    if missing.any?
      message = "[integra_mail] NOT CONFIGURED: #{missing.join(', ')} unset. " \
                'Every e-mail Integra Sign sends will FAIL (and retry) until it is set; none is dropped silently.'
      Rails.logger.error(message)
      warn(message)
    end
  end
end
