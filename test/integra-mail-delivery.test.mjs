// Mail-delivery guard for Integra Sign (see INTEGRA-BRANDING.md §7).
//
// DocuSeal composes its e-mails and, in Integra's deployment, had no transport, so every signature request,
// reminder and completed copy went nowhere. config/initializers/integra_mail.rb hands each message to the
// Integra CRM's `sign-mail` route. This test reads that file (and the two upstream files it relies on) as
// text — there is no Ruby on the build box and none in this job — and holds the properties that matter:
// it posts to INTEGRA_MAIL_URL over HTTPS with INTEGRA_MAIL_TOKEN as the bearer, and it raises rather than
// drops when that configuration is absent.
//
// Run: node --test test/integra-mail-delivery.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const source = read('config/initializers/integra_mail.rb')
/** The Ruby without comment lines, so a property cannot be satisfied by prose. */
const code = source.split('\n').filter((line) => !/^\s*#/.test(line)).join('\n')

/** The body of `def name` up to the `end` at its own indentation. */
const methodBody = (name) => {
  const lines = code.split('\n')
  const start = lines.findIndex((line) => new RegExp(`^\\s*def ${name.replace(/[!?]/g, '\\$&')}(?=[\\s(]|$)`).test(line))
  assert.notEqual(start, -1, `def ${name} exists`)
  const indent = lines[start].match(/^\s*/)[0]
  const end = lines.findIndex((line, i) => i > start && line === `${indent}end`)
  assert.notEqual(end, -1, `def ${name} ends`)
  return lines.slice(start + 1, end).join('\n')
}

test('a delivery method :integra_mail is registered with ActionMailer', () => {
  assert.match(code, /ActiveSupport\.on_load\(:action_mailer\) do\s+add_delivery_method :integra_mail, IntegraMail::Delivery/)
  assert.match(methodBody('deliver!'), /\S/, 'Delivery#deliver! has a body')
})

test('it is on in production and wherever INTEGRA_MAIL_URL is set — and then it is THE delivery method', () => {
  assert.match(methodBody('active?'), /Rails\.env\.production\? \|\| ENV\['INTEGRA_MAIL_URL'\]\.present\?/)
  const block = code.slice(code.indexOf('if IntegraMail.active?'))
  assert.ok(code.includes('if IntegraMail.active?'), 'switched on by active?')
  // The app-level setting is what DocuSeal's interceptor reads (see the interceptor test below).
  assert.match(block, /Rails\.application\.config\.action_mailer\.delivery_method = :integra_mail/)
  assert.match(block, /self\.delivery_method = :integra_mail/)
})

test('it reads INTEGRA_MAIL_URL and INTEGRA_MAIL_TOKEN from the environment', () => {
  assert.match(methodBody('url'), /ENV\['INTEGRA_MAIL_URL'\]/)
  assert.match(methodBody('token'), /ENV\['INTEGRA_MAIL_TOKEN'\]/)
})

test('it posts to INTEGRA_MAIL_URL, over HTTPS only, with a short timeout', () => {
  const endpoint = methodBody('endpoint!')
  assert.match(endpoint, /URI\.parse\(url\)/, 'the URL is INTEGRA_MAIL_URL')
  assert.match(endpoint, /unless uri\.is_a\?\(URI::HTTPS\)/, 'anything but https:// is refused')
  assert.match(methodBody('deliver!'), /uri = IntegraMail\.endpoint!/)

  const post = methodBody('post')
  assert.match(post, /Net::HTTP\.new\(uri\.host, uri\.port\)/)
  assert.match(post, /http\.use_ssl = true/)
  assert.match(post, /Net::HTTP::Post\.new\(uri\.request_uri\)/)
  assert.match(post, /request\['Content-Type'\] = 'application\/json'/)
  for (const kind of ['OPEN', 'READ', 'WRITE']) {
    assert.match(post, new RegExp(`http\\.${kind.toLowerCase()}_timeout = ${kind}_TIMEOUT`), `${kind.toLowerCase()} timeout set`)
    const seconds = Number(code.match(new RegExp(`${kind}_TIMEOUT = (\\d+)`))?.[1])
    assert.ok(seconds > 0 && seconds <= 20, `${kind}_TIMEOUT is short (${seconds} s; API Gateway gives up at 30)`)
  }
})

test('it sends the token as the bearer, and nowhere else', () => {
  assert.match(methodBody('post'), /request\['Authorization'\] = "Bearer #\{token\}"/)
  const uses = code.match(/#\{token\}/g) ?? []
  assert.equal(uses.length, 1, 'the token is interpolated once: into the Authorization header')
  for (const line of code.split('\n').filter((l) => /logger|raise|warn\(/.test(l))) {
    assert.ok(!/\btoken\b/.test(line), `no log line or error carries the token: ${line.trim()}`)
  }
})

test('what leaves is { to, toName?, subject, text, attachments? } — plain text, never HTML', () => {
  const payload = methodBody('payload_for')
  assert.match(payload, /payload = \{ to: address, subject: single_line\(utf8\(mail\.subject\), MAX_SUBJECT\), text: text_of\(mail\) \}/)
  assert.match(payload, /payload\[:toName\] = display if display\.present\?/)
  // Attachments are the signed document and the audit log (plan section 15, issue #578). The key is added only when there
  // ARE files, so a message with none leaves exactly as it did before - and a reader of this test can see both halves.
  assert.match(payload, /payload\[:attachments\] = files if files\.any\?/)
  const keys = new Set([...payload.matchAll(/\b(\w+):\s/g)].map((m) => m[1]).concat([...payload.matchAll(/payload\[:(\w+)\]/g)].map((m) => m[1])))
  assert.deepEqual([...keys].sort(), ['attachments', 'subject', 'text', 'to', 'toName'])
  assert.match(methodBody('text_of'), /mail\.text_part\.decoded/, 'the text part DocuSeal composed')
  assert.ok(!/html:/.test(code), 'no html key anywhere')
})

test('unconfigured, it raises at send — before any request — instead of dropping the message', () => {
  const endpoint = methodBody('endpoint!')
  assert.match(endpoint, /missing = missing_settings\s+if missing\.any\?\s+raise NotConfigured/)
  const missing = methodBody('missing_settings')
  assert.match(missing, /missing << 'INTEGRA_MAIL_URL' if url\.empty\?/)
  assert.match(missing, /missing << 'INTEGRA_MAIL_TOKEN' if token\.empty\?/)

  const deliver = methodBody('deliver!')
  const checked = deliver.indexOf('IntegraMail.endpoint!')
  const posted = deliver.indexOf('IntegraMail.post(')
  assert.ok(checked !== -1 && posted !== -1 && checked < posted, 'configuration is checked before anything is posted')
  assert.ok(!/\brescue\b/.test(deliver), 'deliver! rescues nothing: a failure reaches the job')
  assert.match(deliver, /raise DeliveryFailed, .*no recipient/, 'a message with no recipient raises too')
})

test('a route that refuses or cannot be reached raises; no rescue swallows a failure', () => {
  const post = methodBody('post')
  assert.match(post, /unless response\.code\.to_i == 200 && answer\['ok'\] == true\s+detail = .*\s+raise DeliveryFailed/)
  // Every rescue in the file either re-raises or only replaces an unparseable answer (which then fails the check above).
  const rescues = [...code.matchAll(/rescue\b[^\n]*\n([\s\S]*?)(?=\n\s*(?:end|rescue)\b)/g)]
  assert.ok(rescues.length >= 3, 'the rescues were found')
  for (const [whole, body] of rescues) {
    const ok = /\braise\b/.test(body) || (/JSON::ParserError/.test(whole) && body.trim() === '{}')
    assert.ok(ok, `rescue does not swallow: ${whole.split('\n')[0].trim()}`)
  }
})

test('delivery errors are raised even by a non-bang deliver_now (production sets raise_delivery_errors = false)', () => {
  const block = code.slice(code.indexOf('if IntegraMail.active?'))
  assert.match(block, /Rails\.application\.config\.action_mailer\.raise_delivery_errors = true/)
  assert.match(block, /self\.raise_delivery_errors = true/)
  assert.match(read('config/environments/production.rb'), /config\.action_mailer\.raise_delivery_errors = false/, 'what this overrides')
})

test('a missing setting is shouted at boot (log and stderr), not only at the first send', () => {
  const block = code.slice(code.indexOf('Rails.application.config.after_initialize'))
  assert.match(block, /missing = IntegraMail\.missing_settings/)
  assert.match(block, /missing << 'SMTP_FROM' if ENV\['SMTP_FROM'\]\.blank\?/)
  assert.match(block, /Rails\.logger\.error\(message\)/)
  assert.match(block, /warn\(message\)/)
})

test('DocuSeal\'s interceptor still keeps a configured delivery method (else it swaps in :test and mail is lost)', () => {
  const interceptor = read('lib/action_mailer_configs_interceptor.rb')
  const configured = interceptor.indexOf('if Rails.env.production? && Rails.application.config.action_mailer.delivery_method')
  const fallback = interceptor.indexOf('message.delivery_method(:test)', interceptor.indexOf('unless Docuseal.multitenant?'))
  assert.ok(configured !== -1, 'the configured-delivery-method branch exists')
  assert.ok(fallback !== -1 && configured < fallback, 'and it is reached before the :test fallback')
  assert.match(interceptor.slice(configured, fallback), /return message/, 'and it returns the message with its delivery method intact')
  assert.match(interceptor.slice(configured, fallback), /ENV\.fetch\('SMTP_FROM'\)/, 'it needs SMTP_FROM — which is why the boot check names it')
})

test('development and test keep their own transports', () => {
  assert.match(read('config/environments/development.rb'), /config\.action_mailer\.delivery_method = :letter_opener_web/)
  assert.match(read('config/environments/test.rb'), /config\.action_mailer\.delivery_method = :test/)
})
