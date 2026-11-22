// Brand-token guard for Integra Sign (see INTEGRA-BRANDING.md §3).
//
// The canonical Integra palette and typefaces come from the `integra-brand` skill. The Integra portal
// carries the same guard over its own stylesheet; the two products drifted apart once, and this test
// is what keeps them on the same ten colours. It reads the files as text: no dependencies, no build.
//
// Run: node --test test/integra-brand-tokens.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

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

const hexesIn = (text) => new Set((text.match(/#[0-9a-fA-F]{6}\b/g) || []).map((hex) => hex.toUpperCase()))

test('every canonical brand colour is in tailwind.config.js', () => {
  const shipped = hexesIn(config)
  const missing = Object.entries(CANONICAL).filter(([, hex]) => !shipped.has(hex))
  assert.deepEqual(missing, [], `missing from tailwind.config.js: ${missing.map(([n, h]) => `${n} ${h}`).join(', ')}`)
})

test('tailwind.config.js holds no colour outside the brand except the documented midpoint', () => {
  const allowed = new Set([...Object.values(CANONICAL), DERIVED_MIDPOINT])
  const strays = [...hexesIn(config)].filter((hex) => !allowed.has(hex))
  assert.deepEqual(strays, [], `not a brand colour: ${strays.join(', ')}`)
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
