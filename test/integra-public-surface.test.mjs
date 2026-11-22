// THE PUBLIC SURFACE OF THE SIGNING ENGINE, enumerated and pinned.
//
// Why this exists: plan section 16 puts a Keycloak/ALB rule in front of everything EXCEPT the pages a signatory needs, and
// says that rule comes last "once the signer-path exemptions are enumerated and tested". This is that enumeration. It reads
// the controllers, not the routes, because the app declares its own public surface with `skip_before_action
// :authenticate_user!` — a route can look private and still land on a controller that never asks who is calling.
//
// The list below is the whole of it. Anything not here requires a signed-in user. A new entry fails this test until someone
// adds it here WITH A REASON, which is the point: an unauthenticated surface is a decision, never an accident.
//
// Node only, no dependencies, in the same shape as the other guards in this repository.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

const CONTROLLERS = join(import.meta.dirname, "..", "app", "controllers");
const ROUTES = join(import.meta.dirname, "..", "config", "routes.rb");

/**
 * Every controller that answers without a signed-in user, and why it must.
 * `surface` says which kind of exemption it is, because the three kinds are defended differently:
 *   signer    - the tokenised link IS the authorisation; a client cannot be issued an account to sign one document.
 *   licence   - an AGPL section 13 obligation: the offer of source must be reachable by anyone.
 *   health    - infrastructure reads it; it must not need a session.
 *   brand     - a public page with no data in it.
 *   delivery  - magic-link style: the caller already holds the slug and the address; it sends, it does not disclose.
 */
const PUBLIC = {
  "start_form_controller": "signer - the /d/ dashboard for a signing session",
  "start_form_email_2fa_send_controller": "signer - sends the second factor to the signer's own address",
  "start_form_resubmit_controller": "signer - resubmit from a signing link",
  "submit_form_controller": "signer - the signing form itself",
  "submit_form_decline_controller": "signer - declines from a signing link",
  "submit_form_delegate_controller": "signer - delegates from a signing link",
  "submit_form_download_controller": "signer - downloads the documents they were sent",
  "submit_form_draw_signature_controller": "signer - the /p/ signature pad",
  "submit_form_email_2fas_controller": "signer - verifies the second factor",
  "submit_form_invite_controller": "signer - invites a counterpart from a signing link",
  "submit_form_metadata_controller": "signer - metadata the form needs to render",
  "submit_form_values_controller": "signer - reads and writes the values on the form",
  "submit_form_completed_download_controller": "signer - downloads the COMPLETED document, which is the deliverable",
  "submissions_preview_controller": "signer - the preview of what will be sent, reached from a signing link",
  "submissions_preview_download_controller": "signer - downloads that preview",
  "source_controller": "licence - AGPL section 13 offer of the corresponding source",
  "dashboard_controller": "brand - the landing page; it shows a product page and no account data",
  "send_submission_email_controller": "delivery - sends a completed copy to the submitter's own address (slug + address required)",
  "setup_controller": "brand - first-run setup; it must be UNREACHABLE once an account exists, which is why plan 16 puts SSO in front of it",
  "console_redirect_controller": "brand - deliberately redirects to the root; it hands nothing anywhere",
  "submissions_debug_controller": "signer - internal debugging; the ROUTE is gated to development only, asserted below"
};

/** Controllers whose route must be gated at the routing layer rather than by authentication. */
const DEV_ONLY = {
  "submissions_debug_controller": /resources :debug, only: %i\[index\], controller: 'submissions_debug' if Rails\.env\.development\?/
};

function publicControllers() {
  const found = {};
  for (const file of readdirSync(CONTROLLERS).filter((f) => f.endsWith(".rb"))) {
    const source = readFileSync(join(CONTROLLERS, file), "utf8");
    // The authenticating guard is the one that decides who may call at all.
    if (/skip_before_action\s+:authenticate_user!/.test(source)) found[file.replace(/\.rb$/, "")] = source;
  }
  return found;
}

test("every unauthenticated controller is enumerated, with a reason", () => {
  const actual = Object.keys(publicControllers()).sort();
  const declared = Object.keys(PUBLIC).sort();
  const unexpected = actual.filter((c) => !declared.includes(c));
  const stale = declared.filter((c) => !actual.includes(c));
  assert.deepEqual(
    unexpected,
    [],
    "These controllers answer without a signed-in user and are NOT in the list. Add each with a reason, or require authentication:\n" +
      unexpected.map((c) => `  ${c}`).join("\n")
  );
  assert.deepEqual(
    stale,
    [],
    "These are listed as public but no longer skip authentication. Remove them from the list:\n" + stale.map((c) => `  ${c}`).join("\n")
  );
});

test("every enumerated exemption carries a reason from the closed set of kinds", () => {
  const kinds = new Set(["signer", "licence", "health", "brand", "delivery"]);
  for (const [controller, reason] of Object.entries(PUBLIC)) {
    const kind = reason.split(" - ")[0];
    assert.ok(kinds.has(kind), `${controller}: "${reason}" must start with one of ${[...kinds].join(", ")}`);
    assert.ok(reason.split(" - ")[1]?.trim().length > 10, `${controller}: the reason must say what the surface is for`);
  }
});

test("the debugging controller is not reachable outside development", () => {
  const routes = readFileSync(ROUTES, "utf8");
  for (const [controller, pattern] of Object.entries(DEV_ONLY)) {
    assert.match(
      routes,
      pattern,
      `${controller} skips both authentication and authorisation, so its route MUST stay inside Rails.env.development?. ` +
        `If this line changed, the controller that renders any submission and generates its audit trail became public.`
    );
  }
});

test("the surface a signatory needs is present", () => {
  // If one of these loses its exemption, signing breaks for every client - a failure that looks like a 500, not a 401.
  for (const required of [
    "start_form_controller",
    "submit_form_controller",
    "submit_form_draw_signature_controller",
    "submit_form_completed_download_controller",
    "source_controller"
  ]) {
    assert.ok(PUBLIC[required], `${required} must stay public: it is the signing journey or the licence obligation`);
    assert.ok(publicControllers()[required], `${required} no longer skips authentication - signing or /source is broken`);
  }
});

test("nothing in the public list is a settings or administration controller", () => {
  // The whole point of the exemption list is that it cannot drift into "and also these". A settings controller in here would
  // mean the admin surface is open, which is the thing plan section 16 exists to prevent.
  const forbidden = /settings|admin|users?_controller|dashboard_settings|api_/;
  for (const controller of Object.keys(PUBLIC)) {
    assert.ok(!forbidden.test(controller), `${controller} looks administrative and must never skip authentication`);
  }
});
