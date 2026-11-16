import { beforeEach, describe, expect, it } from 'vitest';
import { detectForms } from '../../src/form-detection/detector';
import { SessionController } from '../../src/session/controller';
import { memoryTabEntryPort } from '../../src/session/registry';
import type { TabEntry } from '../../src/types/session';
import { FakeIndicator, FakeSettings, setBody } from './helpers';

const ORIGIN = 'https://forms.example';
const contactForm = `
  <form id="contact">
    <label for="n">Name</label><input id="n" name="name">
    <label for="e">Email</label><input id="e" name="email" type="email">
    <label for="m">Message</label><textarea id="m" name="message"></textarea>
  </form>`;

function makeController(opts: { html?: string; entry?: TabEntry | null; autoDetect?: boolean } = {}) {
  setBody(opts.html ?? contactForm);
  const ui = new FakeIndicator();
  const registry = memoryTabEntryPort(opts.entry ?? null);
  const settings = new FakeSettings();
  settings.current.autoDetect = opts.autoDetect ?? true;
  const controller = new SessionController({
    detect: () => detectForms(document),
    ui,
    registry,
    settings,
    origin: ORIGIN,
    activeElement: () => document.activeElement,
    now: () => 1000,
  });
  return { controller, ui, registry, settings };
}

describe('SessionController', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('offers help once when a form is detected and does nothing until the user answers', async () => {
    const { controller, ui, registry } = makeController();
    await controller.start();
    expect(controller.state).toBe('awaiting-consent');
    expect(ui.consent?.form.fieldCount).toBe(3);
    expect(ui.consent?.focus).toBe(false); // automatic detection never steals focus
    expect(registry.current).toBeNull(); // nothing persisted before the user decides
    // DOM churn while the prompt is open does not re-prompt for the same form
    controller.rescan();
    controller.rescan();
    expect(ui.count('showConsent')).toBe(1);
  });

  it('does not offer help on a page without an eligible form', async () => {
    const { controller, ui } = makeController({ html: '<p>Just text</p><input type="search" aria-label="Search">' });
    await controller.start();
    expect(controller.state).toBe('idle');
    expect(ui.calls.filter((c) => c.method !== 'setPosition')).toEqual([]);
  });

  it('starts a session on accept and records it for the tab', async () => {
    const { controller, ui, registry } = makeController();
    await controller.start();
    await controller.accept();
    expect(controller.state).toBe('active');
    expect(ui.state).toBe('active');
    expect(ui.detail).toBe('3 fields');
    expect(registry.current).toMatchObject({ state: 'active', origin: ORIGIN, updatedAt: 1000 });
    expect(registry.current?.formSignature).toBe(controller.form?.signature);
  });

  it('goes quiet on decline, leaves the launcher dot, and remembers it', async () => {
    const { controller, ui, registry } = makeController();
    await controller.start();
    await controller.decline();
    expect(controller.state).toBe('inactive');
    expect(ui.state).toBe('collapsed');
    expect(registry.current).toMatchObject({ state: 'inactive', reason: 'declined' });
    // New forms appearing later do not re-prompt
    controller.rescan();
    expect(ui.count('showConsent')).toBe(1);
  });

  it('pauses, resumes and stops', async () => {
    const { controller, ui, registry } = makeController();
    await controller.start();
    await controller.accept();
    await controller.pause();
    expect(controller.state).toBe('paused');
    expect(ui.state).toBe('paused');
    expect(registry.current?.state).toBe('paused');
    await controller.resume();
    expect(controller.state).toBe('active');
    await controller.stop();
    expect(controller.state).toBe('inactive');
    expect(ui.calls.at(-1)).toEqual({ method: 'flash', args: ['stopped', 'Assistance stopped', 'collapsed'] });
    expect(registry.current).toMatchObject({ state: 'inactive', reason: 'stopped' });
  });

  it('ignores pause/resume/accept in the wrong state', async () => {
    const { controller, ui } = makeController();
    await controller.start();
    await controller.pause();
    await controller.resume();
    expect(controller.state).toBe('awaiting-consent');
    await controller.decline();
    await controller.accept();
    expect(controller.state).toBe('inactive');
    expect(ui.count('setState')).toBe(0);
  });

  it('resumes an active session on a new page of the same origin without asking again', async () => {
    const entry: TabEntry = { state: 'active', origin: ORIGIN, formSignature: 'old', updatedAt: 1 };
    const { controller, ui } = makeController({ entry });
    await controller.start();
    expect(controller.state).toBe('active');
    expect(ui.count('showConsent')).toBe(0);
    expect(ui.state).toBe('active');
  });

  it('resumes a paused session as paused', async () => {
    const entry: TabEntry = { state: 'paused', origin: ORIGIN, formSignature: 'old', updatedAt: 1 };
    const { controller, ui } = makeController({ entry });
    await controller.start();
    expect(controller.state).toBe('paused');
    expect(ui.state).toBe('paused');
  });

  it('keeps an active session alive between steps when no form is visible', async () => {
    const entry: TabEntry = { state: 'active', origin: ORIGIN, formSignature: 'old', updatedAt: 1 };
    const { controller, ui } = makeController({ entry, html: '<p>Loading step 2…</p>' });
    await controller.start();
    expect(controller.state).toBe('active');
    expect(ui.detail).toBe('Waiting for the next part of the form');
  });

  it('stays quiet on a new page of the same origin after a decline or stop, showing only the launcher', async () => {
    const entry: TabEntry = { state: 'inactive', reason: 'stopped', origin: ORIGIN, formSignature: null, updatedAt: 1 };
    const { controller, ui } = makeController({ entry });
    await controller.start();
    expect(controller.state).toBe('inactive');
    expect(ui.count('showConsent')).toBe(0);
    expect(ui.state).toBe('collapsed');

    const noForm = makeController({ entry, html: '<p>no form here</p>' });
    await noForm.controller.start();
    expect(noForm.ui.state).toBe('hidden');
  });

  it('shows the launcher when a form appears later on a quiet page, and hides it when the form goes', async () => {
    const entry: TabEntry = { state: 'inactive', reason: 'declined', origin: ORIGIN, formSignature: null, updatedAt: 1 };
    const { controller, ui } = makeController({ entry, html: '<p>empty</p>' });
    await controller.start();
    expect(ui.state).toBe('hidden');
    document.body.innerHTML = contactForm;
    controller.rescan();
    expect(ui.state).toBe('collapsed');
    expect(ui.count('showConsent')).toBe(0);
    document.body.innerHTML = '';
    controller.rescan();
    expect(ui.state).toBe('hidden');
  });

  it('ends the previous session when the tab moves to a different origin', async () => {
    const entry: TabEntry = { state: 'active', origin: 'https://other.example', formSignature: 'x', updatedAt: 1 };
    const { controller, ui, registry } = makeController({ entry });
    await controller.start();
    expect(registry.current).toBeNull();
    expect(controller.state).toBe('awaiting-consent'); // fresh consent for the new site
    expect(ui.count('showConsent')).toBe(1);
  });

  it('withdraws the prompt if the form disappears before the user answers', async () => {
    const { controller, ui } = makeController();
    await controller.start();
    document.getElementById('contact')!.remove();
    controller.rescan();
    expect(controller.state).toBe('idle');
    expect(ui.state).toBe('hidden');
  });

  it('does not prompt automatically when auto-detection is off, but manual activation works', async () => {
    const { controller, ui } = makeController({ autoDetect: false });
    await controller.start();
    expect(controller.state).toBe('idle');
    controller.manualActivate();
    expect(controller.state).toBe('awaiting-consent');
    expect(ui.consent?.focus).toBe(true); // explicit request: focus the prompt for keyboard users
  });

  it('manual activation after a decline offers help again', async () => {
    const { controller, ui } = makeController();
    await controller.start();
    await controller.decline();
    controller.manualActivate();
    expect(controller.state).toBe('awaiting-consent');
    expect(ui.count('showConsent')).toBe(2);
  });

  it('manual activation reports when there is no form, and focuses controls when active', async () => {
    const { controller, ui } = makeController({ html: '<p>nothing</p>' });
    await controller.start();
    controller.manualActivate();
    expect(ui.calls.at(-1)).toEqual({ method: 'flash', args: ['no-form', 'No form found on this page', 'hide'] });

    const active = makeController();
    await active.controller.start();
    await active.controller.accept();
    active.controller.manualActivate();
    expect(active.ui.calls.at(-1)?.method).toBe('focusControls');
  });

  it('reacts to settings changes: position, and turning auto-detection on or off', async () => {
    const { controller, ui, settings } = makeController({ autoDetect: false });
    await controller.start();
    await settings.save({ indicatorPosition: 'top-left' });
    expect(ui.corner).toBe('top-left');
    await settings.save({ autoDetect: true });
    expect(controller.state).toBe('awaiting-consent');
    await settings.save({ autoDetect: false });
    expect(controller.state).toBe('idle');
    expect(ui.state).toBe('hidden');
  });

  it('survives a registry that fails to persist', async () => {
    const { controller, registry } = makeController();
    registry.set = async () => {
      throw new Error('background gone');
    };
    await controller.start();
    await controller.accept();
    expect(controller.state).toBe('active');
  });
});
