// Brand-token guard for Integra Sign (see INTEGRA-BRANDING.md §3).
//
// The canonical Integra palette and typefaces come from the `integra-brand` skill. The Integra portal
// carries the same guard over its own stylesheet; the two products drifted apart once, and this test
// is what keeps them on the same ten colours. It reads the files as text: no dependencies, no build.
//
// Run: node --test test/integra-brand-tokens.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const config = read('tailwind.config.js')
const dynamicConfig = read('tailwind.dynamic.config.js')
const brandPartial = read('app/views/layouts/_integra_brand.html.erb')

/** The ten canonical colours, exactly as the brand skill names them. */
const CANONICAL = {
  Plum: '#4B3F72',
  'Plum dark': '#34285A',
  Ink: '#131B2C',
  Gold: '#C5A059',
  'Gold light': '#D4B26C',
  Grey: '#5F5A66',
  Cream: '#FBF6EE',
  Paper: '#F7F4EF',
  Hairline: '#E6E1D6',
  Lilac: '#D9D3E8'
}

/** The one derived tint allowed: the rounded-up midpoint of Paper and Hairline (daisyUI base-200). */
const DERIVED_MIDPOINT = '#EFEBE3'

/** The canonical wordmark colours (light surfaces only), allowed in the config under `wordmark-` keys. */
const WORDMARK = { navy: '#023C5D', teal: '#008F7A' }

const hexesIn = (text) => new Set((text.match(/#[0-9a-fA-F]{6}\b/g) || []).map((hex) => hex.toUpperCase()))

test('every canonical brand colour is in tailwind.config.js', () => {
  const shipped = hexesIn(config)
  const missing = Object.entries(CANONICAL).filter(([, hex]) => !shipped.has(hex))
  assert.deepEqual(missing, [], `missing from tailwind.config.js: ${missing.map(([n, h]) => `${n} ${h}`).join(', ')}`)
})

test('tailwind.config.js holds no colour outside the brand except the documented midpoint', () => {
  const allowed = new Set([...Object.values(CANONICAL), DERIVED_MIDPOINT, ...Object.values(WORDMARK)])
  const strays = [...hexesIn(config)].filter((hex) => !allowed.has(hex))
  assert.deepEqual(strays, [], `not a brand colour: ${strays.join(', ')}`)
  // The wordmark colours are only for the lockup: they may appear on a `wordmark-` key and nowhere else.
  for (const hex of Object.values(WORDMARK)) {
    for (const line of config.split('\n').filter((l) => l.toUpperCase().includes(hex))) {
      assert.match(line, /'wordmark-(navy|teal)'/, `${line.trim()} — ${hex} is a wordmark colour, not an interface colour`)
    }
  }
})

test('the midpoint says what it is derived from', () => {
  // Recompute it, so a change to Paper or Hairline cannot leave a stale tint behind.
  const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  const paper = channels(CANONICAL.Paper)
  const hairline = channels(CANONICAL.Hairline)
  const midpoint = '#' + paper.map((p, i) => Math.ceil((p + hairline[i]) / 2).toString(16).padStart(2, '0')).join('').toUpperCase()
  assert.equal(midpoint, DERIVED_MIDPOINT)

  for (const line of config.split('\n').filter((l) => l.toUpperCase().includes(DERIVED_MIDPOINT))) {
    assert.match(line, /derived/i, `${line.trim()} — say it is derived`)
    assert.match(line, /Paper/, `${line.trim()} — name Paper as a source`)
    assert.match(line, /Hairline/, `${line.trim()} — name Hairline as a source`)
  }
})

test('the template builder config repeats only colours the main theme holds', () => {
  const main = hexesIn(config)
  const strays = [...hexesIn(dynamicConfig)].filter((hex) => !main.has(hex))
  assert.deepEqual(strays, [], `tailwind.dynamic.config.js drifted from tailwind.config.js: ${strays.join(', ')}`)
})

test('the type is Manrope for headings and Inter for body, at the canonical weights', () => {
  assert.match(brandPartial, /font-family:\s*'Inter'/)
  assert.match(brandPartial, /font-family:\s*'Manrope'/)

  /** The declarations of the first rule whose selector list contains `selector`. */
  const rule = (selector) => {
    const css = brandPartial.replace(/\/\*[\s\S]*?\*\//g, '') // comments may quote rules, braces and all
    for (const match of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      // Split the selector list on commas outside parentheses, so `:is(b, strong)` stays one selector.
      const selectors = match[1].split(/,(?![^(]*\))/).map((s) => s.trim())
      if (selectors.includes(selector)) return match[2]
    }
    assert.fail(`no rule for ${selector} in _integra_brand.html.erb`)
  }
  const weight = (selector) => (/font-weight:\s*(\d+)/.exec(rule(selector)) || [])[1]

  assert.equal(weight('html[data-theme]'), '400', 'body text: Inter 400')
  assert.equal(weight('html:where([data-theme]) :is(b, strong)'), '600', 'body emphasis: Inter 600')
  assert.equal(weight('html:where([data-theme]) h1'), '800')
  assert.equal(weight('html:where([data-theme]) h2'), '700')
  assert.equal(weight('html:where([data-theme]) h3'), '600')
  assert.equal(weight('html:where([data-theme]) .integra-heading'), '700')
})

// ── The wordmark lockup ──────────────────────────────────────────────────────────────────────────
// Reference: the company website's nav bar (integra-web/components/NavBar.tsx) — the symbol alone,
// INTEGRA in Montserrat Black, tracking-tighter, mr-1; SCIENTIFIC in Inter Light, tracking-tight,
// opacity-90. Files are read inside the tests so a missing one fails these, not the whole file.
const readIf = (path) => (existsSync(new URL(`../${path}`, import.meta.url)) ? read(path) : '')
const WORDMARK_PARTIAL = 'app/views/shared/_wordmark.html.erb'

/** The class attribute of the <span> whose text is `word` (case-insensitive; the partial uses `uppercase`). */
const wordClasses = (word) => {
  const partial = readIf(WORDMARK_PARTIAL)
  assert.ok(partial, `${WORDMARK_PARTIAL} is missing`)
  const match = new RegExp(`<span class="([^"]*)">\\s*${word}\\s*</span>`, 'i').exec(partial)
  assert.ok(match, `no <span class="...">${word}</span> in the wordmark partial`)
  return match[1].replace(/<%=[\s\S]*?%>/g, ' ').split(/\s+/).filter(Boolean)
}

/** The first family of a `fontFamily` token in tailwind.config.js. */
const familyToken = (name) => {
  const match = new RegExp(`fontFamily:\\s*\\{[\\s\\S]*?\\b${name}:\\s*\\[\\s*'([^']+)'`).exec(config)
  assert.ok(match, `no fontFamily.${name} token in tailwind.config.js`)
  return match[1]
}

test('wordmark: INTEGRA is Montserrat Black with tighter tracking and mr-1, as on the website', () => {
  const classes = wordClasses('integra')
  assert.ok(classes.includes('font-montserrat'), 'INTEGRA must be font-montserrat')
  assert.equal(familyToken('montserrat'), 'Montserrat')
  assert.ok(classes.includes('font-black'), 'INTEGRA must be weight 900 (font-black)')
  assert.ok(classes.includes('tracking-tighter'), 'INTEGRA must be tracking-tighter')
  assert.ok(classes.includes('mr-1'), 'INTEGRA must carry mr-1 before SCIENTIFIC')
})

test('wordmark: SCIENTIFIC is Inter Light, tracking-tight, opacity-90, as on the website', () => {
  const classes = wordClasses('scientific')
  assert.ok(classes.includes('font-inter'), 'SCIENTIFIC must be font-inter')
  assert.equal(familyToken('inter'), 'Inter')
  assert.ok(classes.includes('font-light'), 'SCIENTIFIC must be weight 300 (font-light)')
  assert.ok(classes.includes('tracking-tight'), 'SCIENTIFIC must be tracking-tight')
  assert.ok(classes.includes('opacity-90'), 'SCIENTIFIC must be opacity-90')
})

test('wordmark: the dark tone uses the white symbol, the light tone the teal one, and no white words on light', () => {
  const partial = readIf(WORDMARK_PARTIAL)
  assert.ok(partial, `${WORDMARK_PARTIAL} is missing`)
  const symbol = /<img src="<%= dark \? '([^']+)' : '([^']+)' %>"/.exec(partial)
  assert.ok(symbol, 'the partial must choose its symbol by tone')
  const [, dark, light] = symbol
  assert.equal(dark, '/logo_no_text_white.png')
  assert.equal(light, '/logo_no_text.png')
  assert.notEqual(dark, light)
  for (const file of [dark, light]) assert.ok(existsSync(new URL(`../public${file}`, import.meta.url)), `public${file} is missing`)
  for (const word of ['integra', 'scientific']) {
    const light = new RegExp(`dark \\? 'text-white' : '(text-integra-wordmark-(?:navy|teal))' %>">\\s*${word}`, 'i').exec(partial)
    assert.ok(light, `${word}: white only on the dark tone, a wordmark colour on the light one`)
  }
  assert.match(config, new RegExp(`'wordmark-navy':\\s*'${WORDMARK.navy}'`, 'i'))
  assert.match(config, new RegExp(`'wordmark-teal':\\s*'${WORDMARK.teal}'`, 'i'))
})

test('wordmark: Montserrat is shipped, declared with a face that covers 900, and in both stylesheets', () => {
  const file = 'public/fonts/montserrat-latin-wght.woff2'
  assert.ok(existsSync(new URL(`../${file}`, import.meta.url)), `${file} is missing`)
  assert.ok(existsSync(new URL('../public/fonts/OFL-Montserrat.txt', import.meta.url)), 'the Montserrat OFL text is missing')
  const face = /@font-face\s*\{[^}]*font-family:\s*'Montserrat';[^}]*\}/.exec(brandPartial)
  assert.ok(face, "no @font-face for 'Montserrat' in _integra_brand.html.erb")
  assert.match(face[0], /url\('\/fonts\/montserrat-latin-wght\.woff2'\)/)
  const weight = /font-weight:\s*(\d+)(?:\s+(\d+))?;/.exec(face[0])
  assert.ok(weight && Number(weight[1]) <= 900 && Number(weight[2] ?? weight[1]) >= 900, 'the Montserrat face must cover weight 900')
  // The signing pages build their own stylesheet from a short content list; without the partial on it,
  // every lockup utility above is silently missing there.
  assert.match(read('tailwind.form.config.js'), /'\.\/app\/views\/shared\/_wordmark\.html\.erb'/)
  assert.match(read('tailwind.application.config.js'), /'\.\/app\/views\/\*\*\/\*\.erb'/)
})

test('wordmark: the lockup is where the product brands itself, with the product name outside it', () => {
  const markup = readIf(WORDMARK_PARTIAL).replace(/<%#[\s\S]*?%>/g, '') // its comments may name the product
  assert.ok(markup, `${WORDMARK_PARTIAL} is missing`)
  assert.doesNotMatch(markup, /product_name|Integra Sign/, 'the product name is not part of the wordmark')
  for (const view of ['app/views/shared/_title.html.erb', 'app/views/submit_form/_docuseal_logo.html.erb',
    'app/views/start_form/_docuseal_logo.html.erb', 'app/views/pages/landing.html.erb']) {
    const source = read(view)
    assert.match(source, /render 'shared\/wordmark', tone: :light/, `${view} must render the lockup`)
    assert.match(source, /Docuseal\.product_name/, `${view} must still name the product, as a separate label`)
  }
})
