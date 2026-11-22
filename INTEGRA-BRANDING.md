# Integra Sign — branding of this DocuSeal fork

This repository is **DocuSeal, modified by Integra Scientific Ltd** (November 2026) so that the
product presented to signatories is **Integra Sign**. It is still DocuSeal's code under DocuSeal's
licence: AGPLv3 (`LICENSE`) plus one additional term (`LICENSE_ADDITIONAL_TERMS`). Both files are
byte-identical to upstream and must stay that way.

| | |
|---|---|
| Upstream version pinned | tag **`3.3.8`** (`a628dd3`) |
| Fork | https://github.com/integrascientific/docuseal |
| Branding branch | `integra-branding` (branched from `3.3.8`) |
| Scope | presentation only, plus one new route (`GET /source`). No gem, schema, API or signing-logic change. |

## 1. The attribution line (licence obligation — do not remove)

`LICENSE_ADDITIONAL_TERMS` (AGPL §7(b)): *"a covered work must retain the original DocuSeal
attribution in interactive user interfaces."* One visible line stays, everywhere a user interface is
shown:

> Signing engine based on [DocuSeal](https://www.docuseal.com) - open source documents software · [Source code](/source)

- **Single definition:** `app/views/shared/_attribution_line.html.erb`
  (constants `Docuseal::UPSTREAM_NAME` / `UPSTREAM_URL` in `lib/docuseal.rb`).
- **Second copy for the client-side signing form:** `app/javascript/submission_form/completed.vue`
  (the "completed" screen is rendered in the browser).
- **Wording:** locale keys `signing_engine_based_on` + upstream's own `open_source_documents_software`
  + `source_code`, in `config/locales/i18n.yml` and `app/javascript/submission_form/i18n.js`
  (14 languages). Only upstream's "Powered by" was reworded; the name, the link and the descriptor
  are upstream's.
- **Where it renders:**
  - every signing page — via `shared/_attribution` → `shared/_powered_by` (form, start, completed,
    declined, expired, archived, awaiting, delegated, e-mail-sent, submission preview "completed");
  - footer of every signed-in page and the sign-in / landing pages — `layouts/application.html.erb`;
  - the document view / shared preview — bottom of `submissions/show.html.erb`;
  - every e-mail — `shared/_email_attribution.html.erb`;
  - the printable QR sheet — `templates_share_link_qr/_branding.html.erb`;
  - the `/source` page.

It must stay visible: no `hidden`, no zero opacity, no CSS that removes it. The template builder
(full-screen editor, signed-in staff only) is the one screen without it; its users see it on every
other page.

## 2. `/source` (AGPL §13)

- Route `get 'source' => 'source#show'` (`config/routes.rb`), `SourceController`, view
  `app/views/source/show.html.erb`. No authentication, reachable before setup.
- Copy: Integra Sign is a modified version of DocuSeal, based on DocuSeal 3.3.8, AGPLv3 with
  DocuSeal's additional terms; the complete corresponding source of the running version, including
  Integra's modifications, is available to everyone at no charge — links to the repository, **the
  ref of this build**, the pinned upstream tag `3.3.8`, and both licence files.
- The "ref of this build" is `Docuseal::SOURCE_REF` = env `SOURCE_REF`, default `integra-branding`.
  The Dockerfile takes it as a build arg.

**Release rule — the page is only true if you follow it:**

1. Push the exact commit you deploy to `github.com/integrascientific/docuseal` (keep the repo public).
2. Tag it (suggested: `integra-sign-3.3.8-N`) and build with `--build-arg SOURCE_REF=<that tag>`.
3. Never deploy a commit that is not pushed. Tag `3.3.8` alone is *not* the corresponding source of
   a branded build — it lacks these modifications.

## 3. Brand choices (exact values)

Source of truth: the `integra-brand` skill (`~/.dsh/skills/integra-brand/SKILL.md`) and the artwork in
`integra-scientific/brand-design/Integra Scientific | Branding/`. The fallback accent `#1a5f4a` was
**not** used, because a canonical brand definition exists.

| daisyUI token (`tailwind.config.js`) | Value | Brand token |
|---|---|---|
| `neutral` (main buttons) | `#4B3F72` | Plum |
| `base-content` (text) | `#131B2C` | Ink |
| `base-100` (page) | `#F7F4EF` | Paper |
| `base-200` | `#EFEBE3` | derived, not a brand colour: midpoint of Paper and Hairline (rounded up) |
| `base-300` | `#E6E1D6` | Hairline |
| `primary` (light buttons) | `#D9D3E8` | Lilac |
| `secondary` | `#D4B26C` | Gold light |
| `accent` | `#C5A059` | Gold |

The three canonical colours daisyUI has no slot for are Tailwind colours in the same file
(`theme.extend.colors.integra`), so a view can use them as utilities:

| Tailwind colour | Utility example | Value | Brand token |
|---|---|---|---|
| `integra-plum-dark` | `bg-integra-plum-dark` | `#34285A` | Plum dark |
| `integra-grey` | `text-integra-grey` | `#5F5A66` | Grey |
| `integra-cream` | `bg-integra-cream` | `#FBF6EE` | Cream |

**Guard:** `test/integra-brand-tokens.test.mjs` (`node --test test/integra-brand-tokens.test.mjs`, no
dependencies; run on every push by `.github/workflows/integra-brand.yml`). It asserts that all ten
canonical colours are in `tailwind.config.js`, that no other colour is except the documented
midpoint (recomputed from Paper and Hairline), that `tailwind.dynamic.config.js` repeats only
colours the main theme holds, and the font families and weights below. The Integra portal carries
the same guard over its own stylesheet, so the two products cannot drift apart unnoticed.

Also: `tailwind.dynamic.config.js`, `theme-color` meta, PWA manifest, static error pages
(`app/views/errors/*.html`), the QR sheet (`#4B3F72` / hover `#34285A`). The theme key is still
`docuseal` (`data-theme="docuseal"`): it is an internal id, not shown to anyone.

- **Typography:** Manrope for `h1`–`h3`, Inter for body, self-hosted variable `latin` subsets in
  `public/fonts/` (SIL OFL 1.1, licence texts alongside). Weights are explicit: body 400, `b`/`strong`
  600, and a heading scale `h1` 800 / `h2` 700 / `h3` 600, plus `.integra-heading` 700. A `font-*`
  utility a view sets on a heading still wins (the partial explains the specificity). Declared in
  `app/views/layouts/_integra_brand.html.erb` (rendered from `layouts/_head_tags`). No third-party
  font request. Other scripts fall back to system fonts.
- **Logo:** the Integra Scientific mark from `logo_icononly_trimmed.svg`, paths and colours unchanged
  (`#023C5D`, `#50C2CC`, `#05A8B6`), in `app/views/shared/_logo.html.erb`, next to the product name
  **Integra Sign** set as live text. The "INTEGRA SCIENTIFIC" wordmark is not re-typeset.
- **Generated from the same mark:** `public/logo.svg`, `favicon.svg`, `favicon.ico`,
  `favicon-{16,32,96}.png`, `apple-*.png`, `preview.png`, and `lib/pdf_icons/logo.png` (audit-trail
  header). `lib/pdf_icons/stamp-logo.png` (watermark inside "stamp" fields) now reads "Integra Sign".
- **Shape** (pill buttons, radii) is upstream's; not changed.
- **Product name:** `Docuseal::PRODUCT_NAME = 'Integra Sign'`; `PRODUCT_URL` =
  `https://www.integrascientific.com`; `SUPPORT_EMAIL` = `info@integrascientific.com`. Side effects
  of the name, all intended: page titles, e-mails and default sender name, PWA name, 2FA issuer
  label, PDF `Creator` metadata, audit-trail header, and the subject of the self-signed certificate
  generated at *first setup* (existing installations keep their certificate).

## 4. What was removed

- "Powered by DocuSeal" (replaced by the line in §1), the signed-documents counter, the DocuSeal
  landing page (now a plain Integra Sign page with a sign-in button).
- Upgrade / Pro: navbar "Upgrade", settings "Plans · Pro", "Console", "Embedding", every
  "Unlock with DocuSeal Pro" panel (SMS, SSO, reminders, logo, bulk send, API/embedding, user roles,
  trusted-signature row, send-SMS button), the "Upload list" tab, locked field tiles and
  "Available in Pro" banners in the builder, the embedding code samples (the embed script in this
  edition is a stub), the "Upgrade to Pro" embed stub text, the Pro-edition API error text.
  Nav entries for SMS and SSO are gone because those pages held only an upsell.
- DocuSeal links: GitHub star, Discord, AI assistant, mobile-app banner, docuseal.com sign-up,
  support e-mail, releases badge (now links to `/source`), API reference (now the docs in this
  repo at the build ref), guide and pricing links, Twitter meta tags.
- Outbound calls to DocuSeal: the newsletter sign-up (posted the admin's e-mail to docuseal.com)
  and the `/upgrade`, `/manage`, `/console_redirect` hand-off (sent a signed user token to the
  DocuSeal console). Both now redirect home.
- The e-signature disclosure sentence (`withDisclosure`, off by default) is forced off in
  `app/javascript/form.js`: it links to DocuSeal's own disclosure, which does not cover this service.
  To use it, publish Integra's disclosure, change the `href` in `signature_step.vue`, restore the line.

Upsell partials were emptied rather than deleted, so a rebase conflict in them is always resolved
"keep ours".

## 5. Deliberately not changed

- `LICENSE`, `LICENSE_ADDITIONAL_TERMS`, all copyright headers.
- `Gemfile`, `Gemfile.lock`, `package.json`, `yarn.lock`, `db/`, `app/controllers/api/`, `Procfile`.
- Integration identifiers: `X-Docuseal-Signature`, webhook User-Agent `DocuSeal.com Webhook`,
  `<docuseal-form>` / `<docuseal-builder>`, MCP server name, `docuseal.env`, the `docuseal` OS user.
- The PDF signature reason `Signed with DocuSeal.com` (`lib/submissions/generate_result_attachments.rb`,
  `generate_audit_trail.rb`) — inside the signing flow, left for an explicit decision.
- `EsignSettingsController::DEFAULT_CERT_NAME` (`DocuSeal Self-Host Autogenerated`, staff-only label,
  matched against stored data).
- Locale strings no view renders any more (Pro, console, mobile app).

Assumes a self-hosted single-tenant deployment (`MULTITENANT` and `DEMO` unset). A few upstream
branches that only run in those modes still contain upsell wording.

## 6. Rebase rule

- The upstream version is **pinned**. Never track upstream `master`.
- **Rebase monthly** onto the newest upstream release tag; update `UPSTREAM_VERSION` in
  `lib/docuseal.rb`, the table above, and the `/source` request spec expectation if needed.
- **Security releases: within one week** of upstream publishing them.
- **If two rebases in a row each take more than two days, stop patching and buy DocuSeal's
  commercial licence** — at that point the fork costs more than the licence.

After every rebase:

```sh
git diff --exit-code <new-tag> -- LICENSE LICENSE_ADDITIONAL_TERMS     # must print nothing
grep -rIn "docuseal\.com\|docusealco" app/views app/javascript --include='*.erb' --include='*.vue' --include='*.js' \
  | grep -v i18n.js                                                      # expect: the attribution link(s) only (+ the disabled disclosure href)
grep -rn "attribution_line" app/views                                    # the line is still rendered everywhere listed in §1
bundle exec rspec spec/requests/source_spec.rb spec/system/signing_form_spec.rb spec/system/newsletters_spec.rb spec/system/setup_spec.rb
```
