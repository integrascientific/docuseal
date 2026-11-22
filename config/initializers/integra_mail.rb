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
# upstream's, untouched. The plain-text part leaves this process (the route accepts no HTML: the shell is
# Integra's), with the subject, each recipient's address and display name, and the message's attachments.
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
# ATTACHMENTS are DocuSeal's own, passed through unchanged: every part of `mail.attachments` goes as
# { name, contentType, contentBase64 } — the file name DocuSeal gave it, its MIME type, and its bytes in strict
# base64. Nothing here opens, re-renders or renames a file: the signed PDF and the audit log are DocuSeal's
# artefacts, and a second generator would be a second author. The completed copy therefore arrives with the
# signed document and the audit log it promises.
#
# LIMITS are the route's (crm/app/src/functions/sign-mail.ts: MAX_SIGN_MAIL_ATTACHMENTS, _ATTACHMENT_BYTES,
# _TOTAL_BYTES), checked here before the first post so a message too big for the route fails with its reason
# instead of an anonymous gateway error, and before anyone receives it. Over a limit, IntegraMail::AttachmentsRefused
# is raised naming the code, the number and the limit: the job fails and retries, the message is NOT sent to
# anyone, and the document must be delivered another way. A file is never dropped to make the rest fit.
#
# DOCUSEAL'S OWN TRIM. SubmitterMailer stops adding files once they pass its MAX_ATTACHMENTS_SIZE (10 MB) and sends
# the rest as if complete — the file left out can be the signed document. While this delivery method is active,
# IntegraMail::NoSilentTrim makes that a raise instead (the route could never carry such a set anyway).

require 'json'
require 'net/http'
require 'openssl'
require 'uri'

module IntegraMail
  class NotConfigured < StandardError; end
  class DeliveryFailed < StandardError; end
  class AttachmentsRefused < DeliveryFailed; end

  OPEN_TIMEOUT = 5
  WRITE_TIMEOUT = 10
  # The route fetches a Graph token, creates the message and sends it; API Gateway itself gives up at 30 s.
  READ_TIMEOUT = 20

  MAX_SUBJECT = 300
  MAX_NAME = 200

  # The route's limits (sign-mail.ts). Decoded bytes; base64 adds a third on the wire.
  MAX_ATTACHMENTS = 10
  MAX_ATTACHMENT_BYTES = 2_800_000
  MAX_ATTACHMENTS_TOTAL_BYTES = 2_800_000

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

  # Every attachment part of the message, as DocuSeal made it: [[{ name:, contentType:, contentBase64: }, bytes], ...].
  # contentType is the part's MIME type without the parameters the Mail gem appends (`; filename=...`).
  # pack('m0') is strict base64 (no line breaks), which is what the route accepts.
  def attachments_of(mail)
    mail.attachments.map do |part|
      bytes = part.body.decoded
      [{ name: utf8(part.filename), contentType: part.mime_type.to_s, contentBase64: [bytes].pack('m0') }, bytes.bytesize]
    end
  end

  def refused(code, reason)
    "Integra Sign could not send e-mail: #{code}: #{reason}. The message was NOT sent to anyone; " \
      'deliver the document another way (the completed copy\'s review link, or by hand).'
  end

  # The route's three limits, before anything is posted. Raises; never trims.
  def check_attachments!(attachments)
    if attachments.size > MAX_ATTACHMENTS
      raise AttachmentsRefused,
            refused('too_many_attachments', "#{attachments.size} attachments; at most #{MAX_ATTACHMENTS} can be sent")
    end

    total = 0
    attachments.each do |file, bytes|
      if bytes > MAX_ATTACHMENT_BYTES
        raise AttachmentsRefused,
              refused('attachment_too_large',
                      "#{file[:name]} is #{bytes} bytes; one file can be at most #{MAX_ATTACHMENT_BYTES} bytes")
      end

      total += bytes
    end

    return if total <= MAX_ATTACHMENTS_TOTAL_BYTES

    raise AttachmentsRefused,
          refused('attachments_total_too_large',
                  "the attachments total #{total} bytes; one message can carry at most #{MAX_ATTACHMENTS_TOTAL_BYTES} bytes")
  end

  def payload_for(mail, address, name, files = [])
    payload = { to: address, subject: single_line(utf8(mail.subject), MAX_SUBJECT), text: text_of(mail) }
    display = single_line(utf8(name), MAX_NAME) if name
    payload[:toName] = display if display.present?
    payload[:attachments] = files if files.any?
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

      attachments = IntegraMail.attachments_of(mail)
      IntegraMail.check_attachments!(attachments)
      files = attachments.map(&:first)

      recipients.each do |address, name|
        answer = IntegraMail.post(uri, IntegraMail.payload_for(mail, address, name, files))
        delivered = Array(answer['attachments']).map { |a| "#{a['name']} (#{a['bytes']} bytes)" if a.is_a?(Hash) }
        Rails.logger.info(
          "[integra_mail] sent messageId=#{answer['messageId']} internetMessageId=#{answer['internetMessageId']} " \
          "replyTo=#{answer['replyTo']} attachments=[#{delivered.compact.join(', ')}]"
        )
      end

      mail
    end
  end

  # Prepended to SubmitterMailer (below): where upstream would stop attaching and send the rest as complete, raise.
  # Upstream's rule, mirrored exactly: it breaks off once the running total reaches MAX_ATTACHMENTS_SIZE, which
  # happens if and only if everything it was given reaches it.
  module NoSilentTrim
    private

    def add_attachments_with_size_limit(submitter, storage_attachments, current_size, filename_format = nil)
      total = current_size + storage_attachments.to_a.sum(&:byte_size)
      if total >= SubmitterMailer::MAX_ATTACHMENTS_SIZE
        raise AttachmentsRefused,
              IntegraMail.refused('attachments_total_too_large',
                                  "the completed copy's files total #{total} bytes; DocuSeal would have sent only " \
                                  "those under #{SubmitterMailer::MAX_ATTACHMENTS_SIZE} bytes and dropped the rest")
      end

      super
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

  # DocuSeal's silent attachment trim becomes a loud failure (see NoSilentTrim). to_prepare: SubmitterMailer is
  # autoloaded, and in development it is reloaded, so the prepend is made each time it is (re)defined.
  Rails.application.config.to_prepare do
    SubmitterMailer.prepend(IntegraMail::NoSilentTrim) unless SubmitterMailer <= IntegraMail::NoSilentTrim
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
