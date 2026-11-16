# ID Assist architecture

This document describes the architecture as built in Phase 1 and the shape the
later phases slot into. It is deliberately short; the code is small and the
module boundaries are the documentation of record.

## Technology stack

| Concern | Choice | Why |
| --- | --- | --- |
| Language | TypeScript (strict, `noUncheckedIndexedAccess`) | Typed interfaces between modules are the main defence against a browser extension turning into a ball of callbacks. |
| Extension platform | Manifest V3, Chromium APIs (`chrome.*`) | Required by Edge. The same manifest loads in Chrome; nothing Edge-specific is used. |
| Bundler | esbuild via `scripts/build.mjs` | Content scripts must be single-file classic scripts. esbuild emits several independent IIFE bundles in one call. Vite's library mode cannot do multi-entry IIFE output and its app mode emits ES modules with shared chunks, which a content script cannot load. |
| Tests | Vitest + jsdom | Vitest is Vite's test runner, so we stay in that ecosystem. jsdom models `<label>`, `form`, `labels` and `MutationObserver` well enough to unit-test detection and the UI. |
| UI | Plain DOM in a shadow root | The whole UI is one pill and one card. A framework would add 30–100 KB to every page load for no architectural benefit. |
| Runtime dependencies | None | Everything ships in `dist/` as our own code. |

Dev dependencies: `typescript`, `esbuild`, `vitest`, `jsdom`, `@types/chrome`. Nothing else.

## Processes and boundaries

```
┌──────────────────────────── Edge tab ─────────────────────────────┐
│  Web page (main world)                                            │
│    ├─ the site's forms                                            │
│    └─ <id-assist-indicator>  (shadow root; floating UI)           │
│                                                                   │
│  Content script (isolated world)       src/content/index.ts       │
│    form-detection ─► session/controller ◄─► floating-ui           │
│          ▲                 │                                      │
│    MutationObserver   chrome.runtime.sendMessage (tab-entry:*)    │
└────────────────────────────┼──────────────────────────────────────┘
                             ▼
┌──────────── Background service worker  src/background ───────────┐
│  SessionRegistry (per tabId) in chrome.storage.session            │
│  commands.onCommand / action.onClicked ─► command:activate ─► tab │
└───────────────────────────────────────────────────────────────────┘
```

**Content script** does all the work on a page: detection, state machine, UI.
It is recreated on every page load and knows nothing about other pages.

**Background service worker** is deliberately thin. It exists for two reasons
only: content scripts cannot share state across page loads, and keyboard
commands and the toolbar button are delivered to the background. It never
receives form content, only a per-tab status record.

**`src/browser/chrome-adapters.ts`** is the only module besides the two entry
points that touches `chrome.*`. Everything else depends on small interfaces
(`TabEntryPort`, `SettingsStore`, `IndicatorPort`, `RegistryStorage`), which is
what makes the core unit-testable and the browser harness possible.

## Modules (Phase 1)

| Directory | Responsibility | Key exports |
| --- | --- | --- |
| `src/types/` | Shared types: `DetectedForm`, `DetectedField`, `TabEntry`, `IndicatorState` | – |
| `src/form-detection/` | Find data-entry controls, label them, group them into forms, decide which groups are worth helping with, watch the DOM for change | `detectForms`, `choosePrimaryForm`, `watchDom` |
| `src/security/` | Conservative sensitive-field classification | `classifySensitivity` |
| `src/session/` | Per-page state machine (`SessionController`) and per-tab registry (`SessionRegistry`) | – |
| `src/floating-ui/` | The indicator pill and consent card | `FloatingIndicator` |
| `src/browser/` | Adapters over `chrome.runtime` and `chrome.storage` | – |
| `src/shared/` | Settings, messages protocol, debounce, hash, logger | – |
| `src/content/`, `src/background/`, `src/options/` | Entry points | – |

The master prompt proposes `conversation/`, `speech/`, `information-extraction/`,
`field-mapping/`, `validation/`, `documents/` and `accessibility/` directories.
They do not exist yet because nothing lives in them; they are created in the
phase that fills them (see `docs/roadmap.md`). Accessibility is not a folder: it
is a requirement on every module, checked by the indicator tests and the manual
checklist in `docs/testing.md`.

## Form detection

1. Query every candidate control (`input`, `select`, `textarea`, `contenteditable`,
   ARIA widget roles). Drop buttons, hidden inputs, invisible elements and
   anything inside our own UI.
2. Describe each control: kind, accessible label, required, disabled,
   sensitivity. Element ids come from a `WeakMap`, so the page's DOM is never
   annotated and removed elements are not retained.
3. Group controls by owning `<form>` (respecting the `form=` attribute), or for
   orphans by the nearest `role=form`, `fieldset`, `dialog`, `article`,
   `section`, `main`, else `<body>`.
4. Keep only meaningful groups: not inside `role=search`; at least two
   assistable fields or one textarea; not a sign-in form (credential plus at most
   one other substantive field). Radio buttons sharing a name count once.
5. Fingerprint each form (FNV-1a over kind/name/label/required of its fields
   plus container id/action) so rescans can tell "same form" from "new form".

`watchDom` re-runs this on DOM mutation (debounced, attribute observation
limited to `hidden`, `disabled`, `type`, `open`, `aria-hidden`) and on
`hashchange` / `popstate` / `pageshow`.

## Session and consent

The controller's state machine is documented at the top of
`src/session/controller.ts`. The important properties:

- **Nothing happens before consent.** Detection is read-only. The microphone
  does not exist in Phase 1, and when it arrives it will be gated behind the
  `active` state.
- **Consent carries across pages of one site.** The background remembers
  `active`/`paused` per tab and origin. A new page on the same origin resumes
  silently. A different origin ends the session.
- **No nagging.** Declining or stopping writes `inactive` for the tab and
  origin; ID Assist stays quiet there until the user asks (shortcut or toolbar
  button) or moves to another site. Closing the tab clears the record.
- **Manual activation always works**, including with auto-detection switched
  off, and it is the only path that moves keyboard focus into our UI. Three
  ways in: the keyboard shortcut, the toolbar button, and the collapsed
  launcher dot that remains after a decline or stop while the page has a form.

## Floating UI

A custom element appended to `<html>` (not `<body>`, which some sites replace)
with an open shadow root. `pointer-events: none` on the host and `auto` on the
pill and card means the host never intercepts clicks meant for the page even
though it covers a corner of the viewport. Colour scheme follows
`prefers-color-scheme`, motion follows `prefers-reduced-motion`, and
`forced-colors` is handled for Windows High Contrast. State changes are mirrored
into a visually hidden `role=status` live region.

## Settings

`chrome.storage.sync` under one `settings` key: `autoDetect` and
`indicatorPosition`. Content scripts subscribe to changes, so the options page
takes effect on open tabs without reload.

## What is intentionally not here yet

Speech, conversation, extraction, filling, documents. See `docs/roadmap.md`
and `docs/limitations.md`.
