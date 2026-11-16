# Roadmap

Phases follow the master implementation prompt
(`docs/ID_Assist_Master_Implementation_Prompt.txt`, section 17). A phase is not
started until the previous one's acceptance criteria have been tested and
recorded in `docs/testing.md`.

## Phase 1: Browser extension foundation. **Done (2026-11-15)**

Manifest V3, content script, background worker, form detection, floating
indicator, consent prompt, per-tab session registry, pause/resume/stop, options
page, keyboard shortcut, controlled test pages, unit tests, browser harness,
real-Edge smoke test. Acceptance criteria and results: `docs/testing.md`.

## Phase 2: Form understanding. **Next**

- DOM-free `FieldDescriptor` (the "common internal field representation"):
  identity, kind, label, context text, required, constraints (`min`, `max`,
  `pattern`, `maxlength`, `step`, `accept`), options, current value where safe,
  validation state, sensitivity, mapping confidence.
- Context extraction: surrounding instructions, `aria-describedby`, headings,
  legends, neighbouring fields, overall form purpose.
- Open shadow DOM and same-origin iframe traversal; one indicator in the top
  frame.
- Multi-page form identity and the "switch to this form?" prompt.
- Indicator auto-avoidance of covered controls.
- Test pages: conditional fields, repeating sections, custom dropdowns,
  framework-rendered forms (React/Vue/Angular builds without a build step).

## Phase 3: Conversational form filling

Speech recognition evaluation (Web Speech API vs local WASM models), TTS,
conversation manager, extraction, mapping, validation, corrections, interruption
handling, text input alternative. Filling happens here for the first time and
is gated behind the `active` state. Never submits.

## Phase 4: Accuracy and accessibility

Name spelling with phonetic read-back, chunked telephone capture with confirmed
country, rephrasing inside long-text fields, screen-reader pass, visible
transcript option.

## Phase 5: Document assistance

Permission-gated CV reading from `<input type=file>`, PDF and DOCX extraction
locally, OCR investigation, conflict resolution in favour of the user's latest
answer.

## Phase 6: Optional language model fallback

Only if Phases 3 and 4 show a real need. Off by default, isolated, never
touches the DOM, all output validated deterministically, explicit consent before
anything leaves the device.
