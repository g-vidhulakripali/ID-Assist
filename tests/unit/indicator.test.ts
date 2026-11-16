import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FloatingIndicator, HOST_TAG, STATE_TEXT, type IndicatorCallbacks } from '../../src/floating-ui/indicator';
import type { IndicatorState } from '../../src/types/session';

function make() {
  const callbacks: IndicatorCallbacks = {
    onAccept: vi.fn(),
    onDecline: vi.fn(),
    onPause: vi.fn(),
    onResume: vi.fn(),
    onStop: vi.fn(),
    onActivate: vi.fn(),
  };
  const ui = new FloatingIndicator(document, callbacks);
  const root = ui.host.shadowRoot!;
  const button = (label: string) =>
    Array.from(root.querySelectorAll('button')).find((b) => b.textContent === label || b.getAttribute('aria-label') === label)!;
  const visibleButtons = () =>
    Array.from(root.querySelectorAll('button'))
      .filter((b) => !b.hidden && !b.closest('[hidden]'))
      .map((b) => b.getAttribute('aria-label') ?? b.textContent);
  return { ui, callbacks, root, button, visibleButtons };
}

describe('FloatingIndicator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    document.querySelectorAll(HOST_TAG).forEach((n) => n.remove());
    vi.useRealTimers();
  });

  it('is not in the document until something is shown', () => {
    const { ui } = make();
    expect(document.querySelector(HOST_TAG)).toBeNull();
    ui.setState('active', '3 fields');
    expect(document.querySelector(HOST_TAG)).toBe(ui.host);
    expect(ui.host.parentElement).toBe(document.documentElement);
    expect(ui.host.hidden).toBe(false);
  });

  it('shows the consent prompt with the exact wording and wires the buttons', () => {
    const { ui, callbacks, root, button } = make();
    ui.showConsent({ id: 'f', title: 'Contact us', fieldCount: 4, assistableFieldCount: 4, signature: 's' }, { focus: false });
    const dialog = root.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.hidden).toBe(false);
    expect(root.getElementById('ia-consent-title')?.textContent).toBe(
      "Hi, I'm ID Assist. Would you like me to help you complete this form?",
    );
    expect(root.getElementById('ia-consent-detail')?.textContent).toContain('"Contact us": 4 fields found');
    button('Yes, help me').click();
    button('No thanks').click();
    expect(callbacks.onAccept).toHaveBeenCalledTimes(1);
    expect(callbacks.onDecline).toHaveBeenCalledTimes(1);
  });

  it('moves focus into the prompt only when asked', () => {
    const { ui, button } = make();
    ui.showConsent({ id: 'f', title: '', fieldCount: 2, assistableFieldCount: 2, signature: 's' }, { focus: false });
    expect(ui.host.shadowRoot!.activeElement).toBeNull();
    ui.showConsent({ id: 'f', title: '', fieldCount: 2, assistableFieldCount: 2, signature: 's' }, { focus: true });
    expect(ui.host.shadowRoot!.activeElement).toBe(button('Yes, help me'));
  });

  it('treats Escape in the prompt as a decline', () => {
    const { ui, callbacks, button } = make();
    ui.showConsent({ id: 'f', title: '', fieldCount: 2, assistableFieldCount: 2, signature: 's' }, { focus: true });
    button('Yes, help me').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
    expect(callbacks.onDecline).toHaveBeenCalledTimes(1);
  });

  it('shows the right controls for each state', () => {
    const { ui, visibleButtons, root } = make();
    ui.setState('active', '3 fields');
    expect(root.querySelector('[role="dialog"]')!.hasAttribute('hidden')).toBe(true);
    expect(visibleButtons()).toEqual(['Pause', 'Stop']);
    ui.setState('paused');
    expect(visibleButtons()).toEqual(['Resume', 'Stop']);
    ui.setState('listening');
    expect(visibleButtons()).toEqual(['Pause', 'Stop']);
    ui.setState('stopped');
    expect(visibleButtons()).toEqual(['Dismiss']);
  });

  it('renders text for every indicator state and announces changes to assistive tech', () => {
    const { ui, root } = make();
    const live = root.querySelector('[role="status"]')!;
    const states: IndicatorState[] = ['detected', 'awaiting-consent', 'active', 'listening', 'processing', 'speaking', 'paused', 'stopped', 'no-form', 'collapsed'];
    for (const s of states) {
      ui.setState(s, 'detail');
      expect(root.querySelector('.text')!.textContent).toBe(STATE_TEXT[s]);
      expect(live.textContent).toBe(`ID Assist: ${STATE_TEXT[s]}, detail`);
    }
  });

  it('fires session callbacks from the pill buttons', () => {
    const { ui, callbacks, button } = make();
    ui.setState('active');
    button('Pause').click();
    button('Stop').click();
    ui.setState('paused');
    button('Resume').click();
    expect(callbacks.onPause).toHaveBeenCalledTimes(1);
    expect(callbacks.onStop).toHaveBeenCalledTimes(1);
    expect(callbacks.onResume).toHaveBeenCalledTimes(1);
  });

  it('shows only the launcher dot when collapsed, and clicking it asks for help again', () => {
    const { ui, callbacks, root, visibleButtons } = make();
    ui.showCollapsed();
    expect(ui.host.hidden).toBe(false);
    expect((root.querySelector('.pill') as HTMLElement).hidden).toBe(true);
    expect(visibleButtons()).toEqual(['ID Assist: offer help with the form on this page']);
    (root.querySelector('.launcher') as HTMLButtonElement).click();
    expect(callbacks.onActivate).toHaveBeenCalledTimes(1);
    ui.focusControls();
    expect(root.activeElement).toBe(root.querySelector('.launcher'));
  });

  it('can fall back to the launcher after a flash', () => {
    const { ui } = make();
    ui.flash('stopped', 'Assistance stopped', 'collapsed');
    vi.advanceTimersByTime(3000);
    expect(ui.currentState).toBe('collapsed');
    expect(ui.host.hidden).toBe(false);
  });

  it('hides a flashed state after a short delay', () => {
    const { ui } = make();
    ui.flash('no-form', 'No form found on this page');
    expect(ui.host.hidden).toBe(false);
    vi.advanceTimersByTime(3000);
    expect(ui.host.hidden).toBe(true);
    expect(ui.currentState).toBe('hidden');
  });

  it('positions itself by corner and never claims the whole viewport', () => {
    const { ui } = make();
    ui.setState('active');
    ui.setPosition('top-left');
    expect(ui.host.getAttribute('data-corner')).toBe('top-left');
    expect(ui.owns(ui.host.shadowRoot!.querySelector('button')!)).toBe(true);
    expect(ui.owns(document.body)).toBe(false);
  });
});
