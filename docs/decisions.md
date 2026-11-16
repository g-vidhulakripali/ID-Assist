# Decision log

Short records of choices that are not obvious from the code. Newest last.
Each is reversible unless marked otherwise.

## D1. esbuild instead of `vite build` for the bundles

Content scripts are classic scripts and need self-contained IIFE bundles; Vite
cannot emit several of those from one config. esbuild can. Vitest keeps us in
the Vite ecosystem for testing. Revisit if we ever add real extension pages that
benefit from Vite's HTML pipeline.

## D2. No runtime dependencies, no UI framework

The UI is two small boxes. A framework would cost every page load more than the
whole extension currently weighs. Revisit in Phase 4 if the optional transcript
view grows.

## D3. Default shortcut `Alt+Shift+A`

Checked against Microsoft's published Edge shortcut list: Edge uses
`Alt+Shift+B`, `Alt+Shift+I`, `Alt+Shift+T`; `Alt+Shift+A` is free, and so is
it in Chrome. `Ctrl+Shift+<letter>` was avoided because Edge already binds
seventeen of those. Caveat: on Windows with several input languages,
`Alt+Shift` alone switches language; users in that situation can rebind the
command under `edge://extensions/shortcuts`, and the options page shows the
shortcut the browser actually assigned.

## D4. Top frame only (`all_frames: false`)

Forms embedded in iframes (payment widgets, embedded typeforms, some ATS job
boards) are not detected in Phase 1. Injecting into every frame would put an
indicator in every frame and complicate consent. Planned for Phase 2 with a
single indicator in the top frame and a frame-aware detector.

## D5. Form identity across pages = same origin while a session is active

The prompt requires that moving between pages or sections of one form does not
re-ask for consent, while a genuinely different form should prompt to switch.
Phase 1 uses the simplest rule that satisfies the first half: while a tab has an
active session, any page on the same origin continues it. The second half
(recognising a different form on the same site and offering to switch) needs
form fingerprints across pages and is a Phase 2 item. Consequence today: after
consenting on a site, an unrelated form on another page of that site is
treated as part of the session until the user stops it.

## D6. Decline or stop means quiet for this tab and origin

Declining once on a site that has forms on many pages must not produce a
prompt on every page. The record is per tab, so a new tab on the same site asks
again, and it is cleared on navigation to another origin or when the tab closes.
Manual activation bypasses it.

## D7. Single-field forms are not offered

Newsletter boxes, coupon fields and search bars are forms too, and offering
help with them on every page would be the fastest way to get the extension
disabled. Rule: at least two assistable fields or one textarea. Users can still
invoke ID Assist manually on anything with at least one assistable field once
Phase 3 can fill it; Phase 1's manual activation uses the same rule.

## D8. Sign-in forms are skipped

A credential field plus at most one other substantive field (checkboxes do not
count) is a sign-in form. ID Assist will never handle passwords, so there is
nothing to offer. Registration forms (two or more non-credential fields) are
offered, with the password fields marked sensitive and excluded.

## D9. Sensitive classification leans towards flagging

Password, one-time-code and payment fields are detected by native semantics
first (type, autocomplete) and then by text markers. Government identifiers,
PINs, tokens and secrets are classified `unknown`, which Phase 3 will treat as
"leave to the user". Postal "PIN code" is explicitly exempted because it is an
address field in India. False positives cost a typed field; false negatives
could route a secret through speech, so the asymmetry is deliberate.

## D10. Automatic detection never moves keyboard focus

Stealing focus from a field the user is typing in is hostile, especially for
screen-reader users. Automatic prompts are announced through a polite live
region and left where they are; the shortcut and toolbar button, being
explicit requests, do move focus to the "Yes, help me" button.

## D11. Background owns the registry; content asks

`chrome.storage.session` is not readable from content scripts by default, and
the service worker can be killed at any time. Keeping the registry in session
storage behind a three-message protocol gives durability across worker
restarts with no state in the worker's memory.

## D13. A collapsed launcher dot stays after decline or stop

First hands-on test: after closing the prompt there was no visible way to get
it back, and the shortcut and toolbar button are not discoverable. So declining
or stopping now leaves a 36 px round launcher in the chosen corner while the
page has an eligible form; clicking it is the same as the shortcut. It is not a
prompt, so it does not conflict with "do not repeatedly ask". It disappears when
the page has no form and on sites with no session. Revisit if users find even
the dot intrusive (a setting to hide it is cheap).

## D12. Settings in `chrome.storage.sync`

Two small preferences that a user would expect to follow them between devices.
Falls back to `local` if `sync` is unavailable.
