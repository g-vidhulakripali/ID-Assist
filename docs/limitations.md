# Known limitations and browser constraints

Honest list of what ID Assist cannot do, or does not do yet. Items marked
*(phase N)* are planned; items marked *(browser)* are platform constraints we
will work around but cannot remove.

## Where the extension cannot run *(browser)*

- Browser pages (`edge://`, the Edge Add-ons store, the built-in PDF viewer,
  the New Tab page) and other extensions' pages. The toolbar button and
  shortcut do nothing there; the background logs "cannot run on this page".
- `file://` pages unless the user grants "Allow access to file URLs" on the
  extension's details page. The controlled test pages are therefore served over
  `http://localhost` by `npm run serve`.
- Pages whose site policy blocks extensions (enterprise `ExtensionSettings`
  runtime-blocked hosts).

## Forms we do not detect yet

- Forms inside iframes *(phase 2)*: embedded payment widgets, third-party job
  application frames, some survey tools. The content script runs in the top
  frame only (`all_frames: false`, see decisions D4).
- Forms inside closed shadow roots *(browser)*: `querySelectorAll` cannot see
  into them. Open shadow roots are not traversed yet either *(phase 2)*.
- Canvas-drawn or fully custom controls with no ARIA semantics *(browser)*:
  there is nothing to inspect. ID Assist will say so rather than guess.
- Single-field forms are skipped by design (decisions D7).
- Sign-in forms are skipped by design (decisions D8).

## Session behaviour today

- "Same form" is approximated by "same origin while a session is active"
  (decisions D5). A second, unrelated form on the same site is treated as a
  continuation until Phase 2 adds cross-page form fingerprints and the
  "would you like to switch?" prompt.
- When an active session lands on a page with no eligible form, the indicator
  shows "Waiting for the next part of the form" rather than ending. This is
  right for multi-step forms and slightly odd on, say, a site's home page.
  Stop ends it; navigating to another site ends it automatically.
- The indicator position is a fixed corner chosen in settings. It does not yet
  move out of the way of a form control it happens to cover *(phase 2)*.

## Field counting

The consent card reports visible fields at the moment of detection. On a
stepped form it reports the first step's fields; the count updates in the
active pill as steps are revealed. Sensitive fields are included in the count
but never in assistance.

## Not implemented yet (by phase)

- Phase 2: full field context (instructions, headings, neighbours), DOM-free
  `FieldDescriptor`, iframe and shadow DOM traversal, form switching prompt.
- Phase 3: speech recognition, text-to-speech, conversation manager,
  extraction, mapping, validation, filling. **Phase 1 never writes to a field.**
  Note for Phase 3: Edge's Web Speech API (`webkitSpeechRecognition`) sends
  audio to Microsoft's cloud service; it is neither offline nor local. Local
  recognition options (for example a WebAssembly Whisper build running in an
  offscreen document) must be evaluated against size, latency and accuracy
  before choosing.
- Phase 4: name spelling with phonetic read-back, chunked telephone capture,
  rephrasing, transcript view.
- Phase 5: CV reading. The selected file is only readable when the site uses a
  real `<input type=file>` in the top frame; custom and cross-origin uploaders
  expose nothing to us *(browser)*.
- Phase 6: optional LLM fallback, off by default.

## Edge-specific notes

- Edge 157 still honours `--load-extension` (used by `scripts/edge-smoke.mjs`),
  which Chrome removed from branded builds in version 137. If a future Edge
  release follows, the smoke script reports that it could not find the
  extension's service worker and manual loading via `edge://extensions` remains
  the supported path.
- `chrome.storage.sync` in Edge syncs through the user's Microsoft account when
  extension sync is on; otherwise it behaves like local storage.
