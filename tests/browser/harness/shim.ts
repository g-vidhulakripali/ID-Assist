/**
 * Browser test harness: a fake `chrome` runtime so the real content bundle can
 * run in an ordinary page without being installed as an extension. It lets us
 * exercise the floating UI and consent flow in any Chromium browser (including
 * automated ones) and gives developers a fast inner loop.
 *
 * It implements only what the content script uses:
 *   chrome.runtime.id / sendMessage / onMessage
 *   chrome.storage.sync get/set/onChanged
 *
 * The per-tab registry is backed by sessionStorage, so navigating between
 * fixture pages behaves like navigating within one tab.
 */
import { SessionRegistry, type RegistryStorage } from '../../../src/session/registry';
import { isRuntimeRequest, type RuntimeResponse } from '../../../src/shared/messages';

const TAB_ID = 1;
const REG_KEY = 'id-assist-harness-registry';
const SETTINGS_KEY = 'id-assist-harness-settings';

const storage: RegistryStorage = {
  async read() {
    try {
      return JSON.parse(sessionStorage.getItem(REG_KEY) ?? '{}');
    } catch {
      return {};
    }
  },
  async write(entries) {
    sessionStorage.setItem(REG_KEY, JSON.stringify(entries));
  },
};
const registry = new SessionRegistry(storage);

type Listener = (message: unknown, sender: unknown, sendResponse: (r: unknown) => void) => unknown;
const messageListeners = new Set<Listener>();
type ChangeListener = (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>) => void;
const changeListeners = new Set<ChangeListener>();

function readSettingsArea(): Record<string, unknown> {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
  } catch {
    return {};
  }
}

const fakeArea = {
  async get(key: string) {
    const all = readSettingsArea();
    return { [key]: all[key] };
  },
  async set(items: Record<string, unknown>) {
    const all = readSettingsArea();
    const changes: Record<string, { oldValue?: unknown; newValue?: unknown }> = {};
    for (const [k, v] of Object.entries(items)) {
      changes[k] = { oldValue: all[k], newValue: v };
      all[k] = v;
    }
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(all));
    changeListeners.forEach((l) => l(changes));
  },
  onChanged: {
    addListener: (l: ChangeListener) => changeListeners.add(l),
    removeListener: (l: ChangeListener) => changeListeners.delete(l),
  },
};

const fakeChrome = {
  runtime: {
    id: 'harness',
    async sendMessage(message: unknown): Promise<RuntimeResponse> {
      if (!isRuntimeRequest(message)) return { ok: false, error: 'unknown message' };
      switch (message.type) {
        case 'tab-entry:get':
          return { ok: true, entry: await registry.get(TAB_ID) };
        case 'tab-entry:set':
          await registry.set(TAB_ID, message.entry);
          return { ok: true, entry: message.entry };
        case 'tab-entry:clear':
          await registry.clear(TAB_ID);
          return { ok: true, entry: null };
      }
    },
    onMessage: {
      addListener: (l: Listener) => messageListeners.add(l),
      removeListener: (l: Listener) => messageListeners.delete(l),
    },
  },
  storage: { sync: fakeArea, local: fakeArea },
};

const harness = {
  /** Simulate the keyboard shortcut / toolbar button. */
  activate() {
    messageListeners.forEach((l) => l({ type: 'command:activate' }, { id: 'harness' }, () => {}));
  },
  /** Simulate a new tab: forget everything the background remembered. */
  resetTab() {
    sessionStorage.removeItem(REG_KEY);
  },
  async settings(patch: Record<string, unknown>) {
    const current = (await fakeArea.get('settings')).settings ?? {};
    await fakeArea.set({ settings: { ...(current as object), ...patch } });
  },
  registry,
};

declare global {
  interface Window {
    idAssistHarness: typeof harness;
  }
}

if (!('chrome' in globalThis) || !(globalThis as { chrome?: { runtime?: { id?: string } } }).chrome?.runtime?.id) {
  (globalThis as unknown as { chrome: unknown }).chrome = fakeChrome;
}
window.idAssistHarness = harness;

// Alt+Shift+A on the page stands in for the browser-level command.
window.addEventListener('keydown', (e) => {
  if (e.altKey && e.shiftKey && e.code === 'KeyA') {
    e.preventDefault();
    harness.activate();
  }
});
