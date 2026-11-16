import { choosePrimaryForm } from '../form-detection/detector';
import type { Logger } from '../shared/logger';
import { silentLogger } from '../shared/logger';
import { DEFAULT_SETTINGS, type Corner, type Settings, type SettingsStore } from '../shared/settings';
import type { DetectedForm, FormSummary } from '../types/forms';
import { summariseForm } from '../types/forms';
import type { ControllerState, IndicatorState, TabEntry } from '../types/session';
import type { TabEntryPort } from './registry';

/** What the controller needs from the floating UI. Implemented by FloatingIndicator and by test doubles. */
export interface IndicatorPort {
  setPosition(corner: Corner): void;
  /** Show the consent prompt for a form. `focus` moves keyboard focus into the prompt (manual activation only). */
  showConsent(form: FormSummary, options: { focus: boolean }): void;
  /** Show a session state; hides the consent prompt if it is open. */
  setState(state: IndicatorState, detail?: string): void;
  /** Show a transient state, then hide or fall back to the collapsed launcher. */
  flash(state: IndicatorState, detail: string, then?: 'hide' | 'collapsed'): void;
  /** Show only the small launcher dot; clicking it asks for help again. */
  showCollapsed(): void;
  hide(): void;
  focusControls(): void;
}

export interface ControllerDeps {
  detect(): DetectedForm[];
  ui: IndicatorPort;
  registry: TabEntryPort;
  settings: SettingsStore;
  origin: string;
  activeElement(): Element | null;
  now?: () => number;
  log?: Logger;
}

/**
 * The per-page session controller: the state machine behind consent, pause,
 * resume and stop. It never touches field values; in Phase 1 an active session
 * only inspects the form and reports what it found.
 *
 * State transitions:
 *   idle -> awaiting-consent (form detected and autoDetect on, or manual activation)
 *   awaiting-consent -> active (accept) | inactive (decline, dismiss, Escape) | idle (form vanished)
 *   active <-> paused
 *   active | paused | awaiting-consent -> inactive (stop)
 *   inactive -> awaiting-consent (manual activation only: shortcut, toolbar button, launcher dot)
 *
 * The registry remembers active/paused/inactive across page loads on the same
 * origin, so moving between pages of one form never re-asks for consent, and a
 * declined or stopped session stays quiet until the user asks again.
 */
export class SessionController {
  private _state: ControllerState = 'idle';
  private forms: DetectedForm[] = [];
  private currentForm: DetectedForm | null = null;
  private settings: Settings = { ...DEFAULT_SETTINGS };
  private lastConsentSignature: string | null = null;
  private unsubscribeSettings: (() => void) | null = null;
  private readonly log: Logger;
  private readonly now: () => number;

  constructor(private readonly deps: ControllerDeps) {
    this.log = deps.log ?? silentLogger;
    this.now = deps.now ?? (() => Date.now());
  }

  get state(): ControllerState {
    return this._state;
  }

  get form(): DetectedForm | null {
    return this.currentForm;
  }

  async start(): Promise<void> {
    this.settings = await this.deps.settings.load();
    this.unsubscribeSettings = this.deps.settings.onChange((s) => this.applySettings(s));
    this.deps.ui.setPosition(this.settings.indicatorPosition);

    let entry = await this.deps.registry.get();
    if (entry && entry.origin !== this.deps.origin) {
      // A different website: the previous session is over.
      this.log.debug('origin changed, ending previous session');
      await this.deps.registry.clear();
      entry = null;
    }

    if (entry) {
      if (entry.state === 'inactive') {
        // Quiet, but discoverable: a launcher dot if the page has a form.
        this._state = 'inactive';
        this.forms = this.deps.detect();
        if (this.forms.length > 0) this.deps.ui.showCollapsed();
        this.log.debug('staying quiet on this origin (', entry.reason, ')');
        return;
      }
      // Consent carries over: resume without asking again.
      this.forms = this.deps.detect();
      this.currentForm = choosePrimaryForm(this.forms, this.deps.activeElement());
      this._state = entry.state;
      this.renderSession();
      return;
    }

    this.rescan();
  }

  dispose(): void {
    this.unsubscribeSettings?.();
    this.unsubscribeSettings = null;
  }

  /** Re-run detection and reconcile with the current state. Called by the DOM watcher. */
  rescan(): void {
    this.onFormsChanged(this.deps.detect());
  }

  onFormsChanged(forms: DetectedForm[]): void {
    this.forms = forms;
    switch (this._state) {
      case 'idle': {
        if (!this.settings.autoDetect) return;
        const primary = choosePrimaryForm(forms, this.deps.activeElement());
        if (primary) this.offer(primary, false);
        return;
      }
      case 'awaiting-consent': {
        if (forms.length === 0) {
          this._state = 'idle';
          this.currentForm = null;
          this.deps.ui.hide();
          return;
        }
        const same = this.currentForm ? forms.find((f) => f.id === this.currentForm!.id) : undefined;
        const next = same ?? choosePrimaryForm(forms, this.deps.activeElement());
        if (next && next.signature !== this.lastConsentSignature) this.offer(next, false);
        else if (next) this.currentForm = next;
        return;
      }
      case 'active':
      case 'paused': {
        const same = this.currentForm ? forms.find((f) => f.id === this.currentForm!.id) : undefined;
        this.currentForm = same ?? choosePrimaryForm(forms, this.deps.activeElement());
        this.renderSession();
        return;
      }
      case 'inactive':
        if (forms.length > 0) this.deps.ui.showCollapsed();
        else this.deps.ui.hide();
        return;
    }
  }

  async accept(): Promise<void> {
    if (this._state !== 'awaiting-consent' || !this.currentForm) return;
    this._state = 'active';
    await this.persist('active');
    this.renderSession();
    this.log.info(
      `session started: "${this.currentForm.title || 'untitled form'}" with ${this.currentForm.fields.length} field(s)`,
      this.currentForm.fields.map((f) => ({ kind: f.kind, label: f.label, required: f.required, sensitivity: f.sensitivity })),
    );
  }

  async decline(): Promise<void> {
    if (this._state !== 'awaiting-consent') return;
    this._state = 'inactive';
    this.deps.ui.showCollapsed();
    await this.persist('inactive', 'declined');
  }

  async pause(): Promise<void> {
    if (this._state !== 'active') return;
    this._state = 'paused';
    await this.persist('paused');
    this.renderSession();
  }

  async resume(): Promise<void> {
    if (this._state !== 'paused') return;
    this._state = 'active';
    await this.persist('active');
    this.renderSession();
  }

  /** Explicit stop: ends the session. A new one needs fresh consent (manual activation). */
  async stop(): Promise<void> {
    if (this._state === 'idle' || this._state === 'inactive') return;
    this._state = 'inactive';
    this.deps.ui.flash('stopped', 'Assistance stopped', this.forms.length > 0 ? 'collapsed' : 'hide');
    await this.persist('inactive', 'stopped');
  }

  /** Keyboard shortcut, toolbar button or the collapsed launcher. Works even when auto-detection is off or the user declined earlier. */
  manualActivate(): void {
    if (this._state === 'active' || this._state === 'paused') {
      this.deps.ui.focusControls();
      return;
    }
    if (this._state === 'awaiting-consent') {
      this.deps.ui.focusControls();
      return;
    }
    this.forms = this.deps.detect();
    const primary = choosePrimaryForm(this.forms, this.deps.activeElement());
    if (!primary) {
      this.deps.ui.flash('no-form', 'No form found on this page');
      return;
    }
    this.offer(primary, true);
  }

  private offer(form: DetectedForm, focus: boolean): void {
    this._state = 'awaiting-consent';
    this.currentForm = form;
    this.lastConsentSignature = form.signature;
    this.deps.ui.showConsent(summariseForm(form), { focus });
  }

  private renderSession(): void {
    const state: IndicatorState = this._state === 'paused' ? 'paused' : 'active';
    const detail = this.currentForm
      ? `${this.currentForm.fields.length} field${this.currentForm.fields.length === 1 ? '' : 's'}`
      : 'Waiting for the next part of the form';
    this.deps.ui.setState(state, detail);
  }

  private async persist(state: TabEntry['state'], reason?: TabEntry['reason']): Promise<void> {
    const entry: TabEntry = {
      state,
      origin: this.deps.origin,
      formSignature: this.currentForm?.signature ?? null,
      updatedAt: this.now(),
    };
    if (reason) entry.reason = reason;
    try {
      await this.deps.registry.set(entry);
    } catch (err) {
      // The background may be unavailable (extension reloaded). The page-level state still works.
      this.log.warn('could not persist session state', err);
    }
  }

  private applySettings(next: Settings): void {
    const prev = this.settings;
    this.settings = next;
    if (prev.indicatorPosition !== next.indicatorPosition) this.deps.ui.setPosition(next.indicatorPosition);
    if (!prev.autoDetect && next.autoDetect && this._state === 'idle') this.rescan();
    if (prev.autoDetect && !next.autoDetect && this._state === 'awaiting-consent') {
      this._state = 'idle';
      this.currentForm = null;
      this.deps.ui.hide();
    }
  }
}
