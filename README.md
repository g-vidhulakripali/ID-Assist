# ID Assist

**Intelligent Dictation Assistance** — a consent-first, voice-first assistant
for completing online forms in Microsoft Edge.

ID Assist notices when you are on a page with a form, asks once whether you
would like help, and (from Phase 3 onwards) guides you through the form one
question at a time, filling the site's own fields with what you say. It never
listens, fills or submits anything without your say-so, and it never handles
passwords, one-time codes or card details.

**Status: Phase 1 complete.** The extension loads in Edge, detects forms, asks
for consent, keeps a session across pages of the same site, and can be paused,
resumed and stopped. It does not yet listen or fill anything; that is Phase 3.
See [docs/roadmap.md](docs/roadmap.md).

## Quick start

Requirements: Node 22+, Microsoft Edge.

```bash
npm install
npm run check        # typecheck + unit tests + build
```

Then load the extension in Edge:

1. Open `edge://extensions`.
2. Turn on **Developer mode** (toggle in the left sidebar).
3. Click **Load unpacked** and choose the `dist/` folder of this repository.
4. Pin ID Assist from the Extensions menu if you want the toolbar button visible.

After changing code, run `npm run build` (or keep `npm run watch` running) and
click the **Reload** icon on the ID Assist card in `edge://extensions`. Open
pages need a refresh to pick up the new content script.

## Try it

```bash
npm run serve
```

Open <http://localhost:8123/tests/browser/> for the controlled test pages. On
the contact form you should see the consent card in the bottom-right corner.
"Yes, help me" starts a session (indicator shows *Helping with this form · 4
fields*); navigating to another test page keeps the session without asking
again; **Stop** ends it. After "No thanks" or **Stop** a small round launcher
dot stays in the corner: click it, press **Alt+Shift+A**, or click the toolbar
button to be offered help again. On the sign-in page nothing appears. On the
article page the shortcut makes the indicator briefly say *No form found*.

Quickest way to see all of this in a real Edge window with a throwaway profile:

```bash
npm run edge:dev
```

The same pages with `?harness` appended run the real content bundle with a
fake `chrome` runtime, so the UI can be exercised without installing the
extension (`npm run build:harness` first).

The full manual checklist and the recorded results are in
[docs/testing.md](docs/testing.md).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run build` | Build the extension into `dist/` |
| `npm run watch` | Rebuild on change |
| `npm run build:harness` | Also build the browser-harness shim |
| `npm test` | Unit tests (Vitest + jsdom) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run check` | typecheck + test + build |
| `npm run serve` | Static server for the test pages on port 8123 |
| `npm run edge:dev` | Open a visible Edge window (throwaway profile) with the extension loaded on the test pages |
| `npm run edge:smoke` | Launch headless Edge with the built extension and check each test page (`--headful` to watch) |
| `npm run icons` | Regenerate the PNG icons |

## Settings

Toolbar button → **Extension options** (or the card's *Details → Extension
options*): turn automatic offers on or off, choose the indicator corner. The
keyboard shortcut is managed by Edge under `edge://extensions/shortcuts`; the
default is `Alt+Shift+A`.

## Project layout

```
manifest.json            Manifest V3 (version is taken from package.json at build time)
public/icons/            Generated PNG icons
scripts/                 build, icon generator, static server, Edge smoke test
src/
  background/            Service worker: per-tab session registry, shortcut relay
  content/               Content script entry: wires everything on a page
  browser/               The only code that calls chrome.* APIs
  form-detection/        Find and describe forms; watch the DOM
  security/              Sensitive-field classification
  session/               Consent/pause/stop state machine; tab registry
  floating-ui/           Indicator pill and consent card (shadow DOM)
  options/               Options page
  shared/, types/        Settings, messages, utilities, shared types
tests/unit/              Vitest suites
tests/browser/           Controlled test pages + harness
docs/                    Architecture, decisions, testing, limitations, roadmap
```

## Documentation

- [docs/architecture.md](docs/architecture.md): stack, module boundaries, how detection, consent, sessions and the indicator fit together
- [docs/decisions.md](docs/decisions.md): why things are the way they are
- [docs/testing.md](docs/testing.md): acceptance criteria, how to test, recorded results
- [docs/limitations.md](docs/limitations.md): what it cannot do and why
- [docs/roadmap.md](docs/roadmap.md): phases 2–6
- [docs/ID_Assist_Master_Implementation_Prompt.txt](docs/ID_Assist_Master_Implementation_Prompt.txt): the product brief

## Principles

Make form completion easier, not more complicated. Never assume personal
information. Ask only when necessary, but never guess to avoid asking. Leave
every consequential action (submitting, paying, registering) to the user.
