import type { FormSummary } from '../../src/types/forms';
import type { IndicatorState } from '../../src/types/session';
import type { IndicatorPort } from '../../src/session/controller';
import type { Corner, Settings, SettingsStore } from '../../src/shared/settings';
import { DEFAULT_SETTINGS } from '../../src/shared/settings';

/** Load an HTML string into the jsdom document body. */
export function setBody(html: string): Document {
  document.body.innerHTML = html;
  return document;
}

export interface UiCall {
  method: 'setPosition' | 'showConsent' | 'setState' | 'flash' | 'showCollapsed' | 'hide' | 'focusControls';
  args: unknown[];
}

/** A recording IndicatorPort. */
export class FakeIndicator implements IndicatorPort {
  calls: UiCall[] = [];
  consent: { form: FormSummary; focus: boolean } | null = null;
  state: IndicatorState = 'hidden';
  detail = '';
  corner: Corner = 'bottom-right';

  setPosition(corner: Corner): void {
    this.corner = corner;
    this.calls.push({ method: 'setPosition', args: [corner] });
  }
  showConsent(form: FormSummary, options: { focus: boolean }): void {
    this.consent = { form, focus: options.focus };
    this.state = 'detected';
    this.calls.push({ method: 'showConsent', args: [form, options] });
  }
  setState(state: IndicatorState, detail = ''): void {
    this.consent = null;
    this.state = state;
    this.detail = detail;
    this.calls.push({ method: 'setState', args: [state, detail] });
  }
  flash(state: IndicatorState, detail: string, then: 'hide' | 'collapsed' = 'hide'): void {
    this.consent = null;
    this.state = state;
    this.detail = detail;
    this.calls.push({ method: 'flash', args: [state, detail, then] });
  }
  showCollapsed(): void {
    this.consent = null;
    this.state = 'collapsed';
    this.detail = '';
    this.calls.push({ method: 'showCollapsed', args: [] });
  }
  hide(): void {
    this.consent = null;
    this.state = 'hidden';
    this.calls.push({ method: 'hide', args: [] });
  }
  focusControls(): void {
    this.calls.push({ method: 'focusControls', args: [] });
  }
  count(method: UiCall['method']): number {
    return this.calls.filter((c) => c.method === method).length;
  }
}

/** In-memory SettingsStore with a way to push changes. */
export class FakeSettings implements SettingsStore {
  private listeners = new Set<(s: Settings) => void>();
  constructor(public current: Settings = { ...DEFAULT_SETTINGS }) {}
  async load(): Promise<Settings> {
    return { ...this.current };
  }
  async save(patch: Partial<Settings>): Promise<void> {
    this.current = { ...this.current, ...patch };
    this.listeners.forEach((l) => l({ ...this.current }));
  }
  onChange(listener: (settings: Settings) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const flushPromises = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
