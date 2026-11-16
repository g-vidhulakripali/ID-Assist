/**
 * Styles for the floating indicator. They live inside a shadow root, so page
 * CSS cannot reach them and they cannot leak into the page. `:host` resets
 * everything so inherited page styles (font-size, color, direction) do not apply.
 */
export const INDICATOR_CSS = `
:host {
  all: initial;
  position: fixed;
  z-index: 2147483647;
  --ia-gap: 16px;
  --ia-bg: #ffffff;
  --ia-fg: #1b1f27;
  --ia-muted: #5a6170;
  --ia-border: #d5d9e2;
  --ia-accent: #1f4fd8;
  --ia-accent-fg: #ffffff;
  --ia-focus: #1f4fd8;
  --ia-shadow: 0 6px 24px rgba(16, 24, 40, 0.18);
  --ia-dot: #8a93a6;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: 13px;
  line-height: 1.35;
  color: var(--ia-fg);
  direction: ltr;
  pointer-events: none;
}
@media (prefers-color-scheme: dark) {
  :host {
    --ia-bg: #1e2230;
    --ia-fg: #eef1f7;
    --ia-muted: #a8b0c2;
    --ia-border: #3a4154;
    --ia-accent: #7aa2ff;
    --ia-accent-fg: #0d1326;
    --ia-focus: #9db8ff;
    --ia-shadow: 0 6px 24px rgba(0, 0, 0, 0.5);
    --ia-dot: #6e7890;
  }
}
:host([data-corner="bottom-right"]) { right: var(--ia-gap); bottom: var(--ia-gap); }
:host([data-corner="bottom-left"])  { left: var(--ia-gap); bottom: var(--ia-gap); }
:host([data-corner="top-right"])    { right: var(--ia-gap); top: var(--ia-gap); }
:host([data-corner="top-left"])     { left: var(--ia-gap); top: var(--ia-gap); }
:host([hidden]) { display: none; }

.root {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  max-width: min(360px, calc(100vw - 2 * var(--ia-gap)));
}
:host([data-corner$="left"]) .root { align-items: flex-start; }
:host([data-corner^="top"]) .root { flex-direction: column-reverse; }

.card, .pill {
  pointer-events: auto;
  background: var(--ia-bg);
  color: var(--ia-fg);
  border: 1px solid var(--ia-border);
  box-shadow: var(--ia-shadow);
}
.card {
  border-radius: 12px;
  padding: 14px 16px;
  width: min(340px, calc(100vw - 2 * var(--ia-gap)));
  box-sizing: border-box;
}
.card[hidden] { display: none; }
.card .title { margin: 0 0 6px; font-size: 14px; font-weight: 600; }
.card .detail { margin: 0 0 12px; color: var(--ia-muted); }
.actions { display: flex; gap: 8px; flex-wrap: wrap; }

.pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border-radius: 999px;
  padding: 6px 8px 6px 12px;
  min-height: 36px;
  box-sizing: border-box;
}
.dot {
  width: 10px; height: 10px; border-radius: 50%;
  background: var(--ia-dot);
  flex: none;
}
.pill[data-state="active"] .dot, .pill[data-state="speaking"] .dot { background: #1aa36b; }
.pill[data-state="listening"] .dot { background: #d9342b; animation: ia-pulse 1.2s ease-in-out infinite; }
.pill[data-state="processing"] .dot { background: #e0a100; animation: ia-pulse 1.2s ease-in-out infinite; }
.pill[data-state="paused"] .dot { background: #e0a100; }
.pill[data-state="stopped"] .dot, .pill[data-state="no-form"] .dot { background: var(--ia-dot); }
.pill[data-state="detected"] .dot, .pill[data-state="awaiting-consent"] .dot { background: var(--ia-accent); }
@keyframes ia-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
@media (prefers-reduced-motion: reduce) { .dot { animation: none !important; } }

.status { white-space: nowrap; }
.status .detail { color: var(--ia-muted); }
.status .detail::before { content: " · "; }
.status .detail:empty { display: none; }

button {
  all: unset;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 28px;
  min-width: 28px;
  padding: 0 10px;
  border-radius: 999px;
  font: inherit;
  font-weight: 600;
  color: var(--ia-fg);
  background: transparent;
  border: 1px solid var(--ia-border);
  cursor: pointer;
}
button:hover { background: rgba(127, 140, 170, 0.14); }
button:focus-visible { outline: 2px solid var(--ia-focus); outline-offset: 2px; }
button.primary { background: var(--ia-accent); color: var(--ia-accent-fg); border-color: var(--ia-accent); }
button.icon { padding: 0; width: 28px; font-size: 16px; line-height: 1; }
button[hidden] { display: none; }
.pill[hidden] { display: none; }

.launcher {
  pointer-events: auto;
  width: 36px; height: 36px; min-width: 36px; min-height: 36px;
  padding: 0;
  border-radius: 50%;
  background: var(--ia-accent);
  color: var(--ia-accent-fg);
  border-color: var(--ia-accent);
  box-shadow: var(--ia-shadow);
  opacity: 0.85;
}
.launcher:hover, .launcher:focus-visible { opacity: 1; }

.sr-only {
  position: absolute; width: 1px; height: 1px; overflow: hidden;
  clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap;
}

@media (forced-colors: active) {
  .card, .pill, button { border-color: ButtonText; }
  button.primary { background: Highlight; color: HighlightText; }
  .dot { border: 1px solid ButtonText; }
}
`;
