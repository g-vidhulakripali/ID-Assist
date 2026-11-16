import type { IndicatorPort } from '../session/controller';
import type { Corner } from '../shared/settings';
import type { FormSummary } from '../types/forms';
import type { IndicatorState } from '../types/session';
import { INDICATOR_CSS } from './styles';

export const HOST_TAG = 'id-assist-indicator';

export interface IndicatorCallbacks {
  onAccept(): void;
  onDecline(): void;
  onPause(): void;
  onResume(): void;
  onStop(): void;
  /** The collapsed launcher dot was clicked: ask for help again. */
  onActivate(): void;
}

export const STATE_TEXT: Record<IndicatorState, string> = {
  hidden: '',
  collapsed: 'ID Assist',
  detected: 'Form detected',
  'awaiting-consent': 'Waiting for your answer',
  active: 'Helping with this form',
  listening: 'Listening',
  processing: 'Thinking',
  speaking: 'Speaking',
  paused: 'Paused',
  stopped: 'Stopped',
  'no-form': 'No form found',
};

const FLASH_MS = 3000;

/**
 * The small floating indicator and the consent card. Rendered in an open
 * shadow root on a custom element appended to <html>, so page styles and
 * scripts that replace <body> leave it alone. It never captures pointer
 * events outside its own boxes (`pointer-events: none` on the host).
 */
export class FloatingIndicator implements IndicatorPort {
  readonly host: HTMLElement;
  private readonly shadow: ShadowRoot;
  private readonly card: HTMLDivElement;
  private readonly cardDetail: HTMLParagraphElement;
  private readonly pill: HTMLDivElement;
  private readonly launcher: HTMLButtonElement;
  private readonly statusText: HTMLSpanElement;
  private readonly statusDetail: HTMLSpanElement;
  private readonly live: HTMLSpanElement;
  private readonly buttons: Record<'accept' | 'decline' | 'pause' | 'resume' | 'stop' | 'dismiss', HTMLButtonElement>;
  private state: IndicatorState = 'hidden';
  private flashTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly doc: Document,
    private readonly callbacks: IndicatorCallbacks,
  ) {
    this.host = doc.createElement(HOST_TAG);
    this.host.setAttribute('data-corner', 'bottom-right');
    this.host.setAttribute('lang', 'en');
    this.host.hidden = true;
    this.shadow = this.host.attachShadow({ mode: 'open' });

    const style = doc.createElement('style');
    style.textContent = INDICATOR_CSS;

    const root = el(doc, 'div', { class: 'root' });

    // Consent card
    this.card = el(doc, 'div', {
      class: 'card',
      role: 'dialog',
      'aria-labelledby': 'ia-consent-title',
      'aria-describedby': 'ia-consent-detail',
    });
    this.card.hidden = true;
    const title = el(doc, 'p', { class: 'title', id: 'ia-consent-title' });
    title.textContent = "Hi, I'm ID Assist. Would you like me to help you complete this form?";
    this.cardDetail = el(doc, 'p', { class: 'detail', id: 'ia-consent-detail' });
    const actions = el(doc, 'div', { class: 'actions' });
    const accept = button(doc, 'Yes, help me', 'primary');
    const decline = button(doc, 'No thanks');
    actions.append(accept, decline);
    this.card.append(title, this.cardDetail, actions);

    // Status pill
    this.pill = el(doc, 'div', { class: 'pill', role: 'group', 'aria-label': 'ID Assist' });
    const dot = el(doc, 'span', { class: 'dot', 'aria-hidden': 'true' });
    const status = el(doc, 'span', { class: 'status' });
    this.statusText = el(doc, 'span', { class: 'text' });
    this.statusDetail = el(doc, 'span', { class: 'detail' });
    status.append(this.statusText, this.statusDetail);
    this.live = el(doc, 'span', { class: 'sr-only', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
    const pause = button(doc, 'Pause');
    const resume = button(doc, 'Resume');
    const stop = button(doc, 'Stop');
    const dismiss = button(doc, '×', 'icon');
    dismiss.setAttribute('aria-label', 'Dismiss');
    dismiss.title = 'Dismiss';
    this.pill.append(dot, status, pause, resume, stop, dismiss, this.live);

    // Collapsed launcher: the only thing visible after a decline or stop.
    this.launcher = doc.createElement('button');
    this.launcher.type = 'button';
    this.launcher.className = 'launcher';
    this.launcher.setAttribute('aria-label', 'ID Assist: offer help with the form on this page');
    this.launcher.title = 'ID Assist: offer help with the form on this page';
    this.launcher.innerHTML = MIC_ICON;
    this.launcher.hidden = true;

    root.append(this.card, this.pill, this.launcher);
    this.shadow.append(style, root);

    this.buttons = { accept, decline, pause, resume, stop, dismiss };
    this.launcher.addEventListener('click', () => this.callbacks.onActivate());
    accept.addEventListener('click', () => this.callbacks.onAccept());
    decline.addEventListener('click', () => this.callbacks.onDecline());
    pause.addEventListener('click', () => this.callbacks.onPause());
    resume.addEventListener('click', () => this.callbacks.onResume());
    stop.addEventListener('click', () => this.callbacks.onStop());
    dismiss.addEventListener('click', () => this.onDismiss());
    this.shadow.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Escape' && !this.card.hidden) {
        e.stopPropagation();
        this.callbacks.onDecline();
      }
    });
  }

  mount(): void {
    if (!this.host.isConnected) this.doc.documentElement.append(this.host);
  }

  unmount(): void {
    this.clearFlash();
    this.host.remove();
  }

  /** True for nodes that belong to the indicator; used to keep detection and observation away from it. */
  owns(node: Node): boolean {
    return node === this.host || this.host.contains(node) || this.shadow.contains(node);
  }

  get currentState(): IndicatorState {
    return this.state;
  }

  setPosition(corner: Corner): void {
    this.host.setAttribute('data-corner', corner);
  }

  showConsent(form: FormSummary, options: { focus: boolean }): void {
    this.clearFlash();
    this.mount();
    const title = form.title ? `"${form.title}": ` : '';
    const fields = `${form.fieldCount} field${form.fieldCount === 1 ? '' : 's'}`;
    this.cardDetail.textContent = `${title}${fields} found. Nothing is listened to or filled in until you say yes.`;
    this.card.hidden = false;
    this.applyState('detected', '');
    this.host.hidden = false;
    this.announce(`ID Assist: form detected. ${this.cardDetail.textContent}`);
    if (options.focus) this.buttons.accept.focus();
  }

  setState(state: IndicatorState, detail = ''): void {
    this.clearFlash();
    this.mount();
    this.card.hidden = true;
    this.applyState(state, detail);
    this.host.hidden = state === 'hidden';
    if (state !== 'hidden') this.announce(`ID Assist: ${STATE_TEXT[state]}${detail ? `, ${detail}` : ''}`);
  }

  flash(state: IndicatorState, detail: string, then: 'hide' | 'collapsed' = 'hide'): void {
    this.setState(state, detail);
    this.flashTimer = setTimeout(() => {
      this.flashTimer = null;
      if (this.state !== state) return;
      if (then === 'collapsed') this.showCollapsed();
      else this.hide();
    }, FLASH_MS);
  }

  showCollapsed(): void {
    this.clearFlash();
    this.mount();
    this.card.hidden = true;
    this.applyState('collapsed', '');
    this.host.hidden = false;
  }

  hide(): void {
    this.clearFlash();
    this.card.hidden = true;
    this.applyState('hidden', '');
    this.host.hidden = true;
  }

  focusControls(): void {
    if (!this.card.hidden) {
      this.buttons.accept.focus();
      return;
    }
    if (this.state === 'collapsed') {
      this.launcher.focus();
      return;
    }
    const target = [this.buttons.pause, this.buttons.resume, this.buttons.stop, this.buttons.dismiss].find((b) => !b.hidden);
    target?.focus();
  }

  private onDismiss(): void {
    if (!this.card.hidden || this.state === 'detected' || this.state === 'awaiting-consent') {
      this.callbacks.onDecline();
      return;
    }
    // Transient states (stopped, no-form) can simply be hidden.
    this.hide();
  }

  private applyState(state: IndicatorState, detail: string): void {
    this.state = state;
    this.pill.dataset.state = state;
    this.pill.hidden = state === 'collapsed';
    this.launcher.hidden = state !== 'collapsed';
    this.statusText.textContent = STATE_TEXT[state];
    this.statusDetail.textContent = detail;
    const b = this.buttons;
    const active = state === 'active' || state === 'listening' || state === 'processing' || state === 'speaking';
    b.pause.hidden = !active;
    b.resume.hidden = state !== 'paused';
    b.stop.hidden = !(active || state === 'paused');
    b.dismiss.hidden = !(state === 'detected' || state === 'awaiting-consent' || state === 'stopped' || state === 'no-form');
  }

  private announce(text: string): void {
    // Clear first so repeated identical announcements are still read out.
    this.live.textContent = '';
    this.live.textContent = text;
  }

  private clearFlash(): void {
    if (this.flashTimer !== null) {
      clearTimeout(this.flashTimer);
      this.flashTimer = null;
    }
  }
}

/** Static inline SVG (no user content) for the launcher: a microphone outline. */
const MIC_ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">' +
  '<rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/>' +
  '<path d="M6 11a6 6 0 0 0 12 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
  '<path d="M12 17v3M9 20h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  attrs: Record<string, string> = {},
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function button(doc: Document, label: string, className = ''): HTMLButtonElement {
  const b = doc.createElement('button');
  b.type = 'button';
  b.textContent = label;
  if (className) b.className = className;
  return b;
}
