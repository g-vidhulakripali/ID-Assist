# Testing

Three layers, cheapest first:

1. **Unit tests** (`npm test`): detection, labels, sensitivity, state machine,
   registry, indicator, DOM watcher. jsdom, no browser. 60 tests.
2. **Browser harness** (`npm run build:harness && npm run serve`, then open a
   fixture with `?harness`): the real content bundle running in any Chromium
   browser with a fake `chrome` runtime. Fast inner loop for UI work.
3. **Real Edge**: `npm run edge:smoke` launches headless Edge with the unpacked
   extension and checks each fixture; `npm run edge:dev` opens a visible Edge
   window (throwaway profile) with the extension loaded on the test pages for
   the manual checklist below. Loading from `edge://extensions` into your own
   profile works the same way.

   Note for anyone extending the smoke script: Edge runs internal extensions
   with service workers of their own. Select ours by script name
   (`/background.js`), not by "first extension target".

A feature is not "working" until it has passed layer 3.

## Controlled test pages

`tests/browser/fixtures/`, served by `npm run serve` at
<http://localhost:8123/tests/browser/>.

| Page | Covers |
| --- | --- |
| `contact.html` | Basic form: text, email, select, textarea |
| `registration.html` | Credential fields inside a legitimate form, date, tel, checkbox |
| `job-application.html` | Fieldsets with legends, radios, number, file upload, range, ARIA combobox, two textareas |
| `multistep.html` | One form revealed in three steps on one page (`hidden` toggling + `history.replaceState`) |
| `multipage-1.html` → `multipage-2.html` | Two-page form with real navigation |
| `multiple-forms.html` | Search form, single-field newsletter, real enquiry form |
| `login.html` | Sign-in form (must be ignored) |
| `payment.html` | Address fields plus card number, expiry, CVC, one-time code, Indian PIN code |
| `dynamic.html` | Form injected 2 s after load; remove/re-add buttons |
| `no-form.html` | Prose plus a search box |

## Phase 1 acceptance criteria and results

Recorded 2026-11-15 against Edge 157.0.4341.46 (Windows 11). "Harness" = layer
2 in the Claude desktop browser pane; "Edge" = layer 3 headless smoke run.

| # | Criterion | How verified | Result |
| --- | --- | --- | --- |
| 1 | Extension loads in Edge | `edge-smoke.mjs` finds the extension's service-worker target; manifest validated by Edge at load | Pass (Edge) |
| 2 | Detects ordinary HTML forms | contact, registration, job application, enquiry pages all produce a prompt | Pass (unit, harness, Edge) |
| 3 | Displays the consent prompt with the required wording | Indicator test asserts exact text; screenshot | Pass (unit, harness, Edge) |
| 4 | Does not listen before consent | No audio code exists in Phase 1; manifest requests no microphone permission | Pass by construction |
| 5 | Does not fill fields before consent | Smoke test asserts every text control is still empty after detection; controller never references `.value` | Pass (Edge) |
| 6 | Shows a floating indicator | Screenshots in harness and Edge | Pass |
| 7 | Indicator does not obstruct form interaction | Host has `pointer-events: none`; pill/card are the only hit targets; sits in a configurable corner | Pass (harness) — see limitation on auto-avoidance |
| 8 | Consent not repeatedly requested while navigating the same form | Accept on contact → multipage-2 resumes as *active* without a prompt; three-step page shows one prompt across all steps | Pass (unit, harness) |
| 9 | User can stop assistance | Stop → "Assistance stopped" flash, registry `inactive/stopped`, next page on same origin stays quiet | Pass (unit, harness) |
| 10 | User can get it back after closing it | Decline leaves the launcher dot; clicking it, the shortcut, or the toolbar button re-offers help with focus on "Yes, help me". Smoke test sends the shortcut's message from the real service worker | Pass (unit, harness, Edge) |

Additional behaviour verified:

| Behaviour | Result |
| --- | --- |
| Pause persists across pages (pause on page 2, page 1 shows *Paused*) | Pass (harness) |
| Decline → quiet; manual activation re-offers and focuses "Yes, help me" | Pass (unit, harness) |
| Sign-in form produces no prompt | Pass (unit, harness, Edge) |
| Search box and single-field newsletter ignored; enquiry form chosen with its heading as title | Pass (unit, harness, Edge) |
| Dynamic form: no prompt before injection, prompt after, withdrawn on removal, back on re-add | Pass (harness) |
| No form + shortcut → "No form found" for 3 s | Pass (unit, harness) |
| Payment page: prompt offered, card/CVC/expiry/OTP classified sensitive, PIN code not | Pass (unit, Edge) |
| Dark colour scheme | Pass (harness screenshot) |

Not yet verified (needs a human or tooling we do not have in CI):

- Screen-reader announcement of the live region in Narrator/NVDA.
- Behaviour on a sample of real public websites (planned once Phase 2 widens
  detection; record results here).
- Headful Edge with the user's own profile (expected identical; the smoke test
  uses a throwaway profile).

## Manual checklist (real Edge, extension loaded unpacked)

1. `npm run build`, load `dist/` via `edge://extensions` → **Load unpacked**.
2. `npm run serve`; open <http://localhost:8123/tests/browser/>.
3. Contact form: consent card appears bottom-right; nothing is focused; form
   fields still usable. Click **Yes, help me** → pill reads *Helping with this
   form · 4 fields* with **Pause** and **Stop**.
4. Click *All test pages* → *Multi-page* → page 1: pill still active, no prompt.
   Click **Pause** → *Paused* with **Resume**. Follow *Continue to page 2* → still
   *Paused*. **Resume**, then **Stop** → *Stopped* flash, then nothing.
5. Open any other fixture in the same tab: only the small round launcher dot
   appears. Click it, or press **Alt+Shift+A**, or click the toolbar button →
   consent card with focus on **Yes, help me**. Press **Escape** → treated as
   decline, dot returns.
6. Open `login.html`: nothing. Open `no-form.html`, press **Alt+Shift+A** → *No
   form found* for three seconds.
7. Open `dynamic.html`: nothing for two seconds, then the prompt. **Remove the
   form** → prompt disappears. **Add the form again** → prompt returns.
8. Toolbar button → **Extension options**: untick automatic offers, reload
   `contact.html` → nothing until **Alt+Shift+A**. Change corner → indicator
   moves on open tabs without reload.
9. Open a new tab on the same site after declining in another: the prompt
   appears again (decisions are per tab).
10. Windows **Settings → Accessibility → Contrast themes**: indicator remains
    legible; focus ring visible when tabbing through the buttons.
