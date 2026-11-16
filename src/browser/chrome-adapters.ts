/**
 * The only module (besides the two entry points) that talks to `chrome.*`.
 * Everything else depends on the small interfaces defined in session/ and
 * shared/, which keeps the core testable and makes a Chrome build a matter of
 * swapping this file if Edge and Chrome ever diverge.
 */
import type { RegistryStorage, TabEntryPort } from '../session/registry';
import { isRuntimeRequest, type ContentCommand, type RuntimeRequest, type RuntimeResponse } from '../shared/messages';
import { normaliseSettings, type Settings, type SettingsStore } from '../shared/settings';
import type { TabEntry } from '../types/session';

export function hasExtensionRuntime(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.runtime && typeof chrome.runtime.id === 'string';
}

/** Content script side: ask the background for this tab's registry entry. */
export function backgroundTabEntryPort(): TabEntryPort {
  async function request(req: RuntimeRequest): Promise<TabEntry | null> {
    const res = (await chrome.runtime.sendMessage(req)) as RuntimeResponse | undefined;
    if (!res) throw new Error('no response from background');
    if (!res.ok) throw new Error(res.error);
    return res.entry;
  }
  return {
    get: () => request({ type: 'tab-entry:get' }),
    set: async (entry) => {
      await request({ type: 'tab-entry:set', entry });
    },
    clear: async () => {
      await request({ type: 'tab-entry:clear' });
    },
  };
}

/** Content script side: receive commands from the background (shortcut, toolbar button). */
export function onContentCommand(handler: (cmd: ContentCommand) => void): () => void {
  const listener = (message: unknown) => {
    if (typeof message === 'object' && message !== null && (message as { type?: string }).type === 'command:activate') {
      handler(message as ContentCommand);
    }
  };
  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
}

const SETTINGS_KEY = 'settings';

/** Settings in chrome.storage.sync (falls back to local when sync is unavailable). */
export function chromeSettingsStore(area: chrome.storage.StorageArea = chrome.storage.sync ?? chrome.storage.local): SettingsStore {
  return {
    async load(): Promise<Settings> {
      const data = await area.get(SETTINGS_KEY);
      return normaliseSettings(data[SETTINGS_KEY]);
    },
    async save(patch: Partial<Settings>): Promise<void> {
      const current = await this.load();
      await area.set({ [SETTINGS_KEY]: { ...current, ...patch } });
    },
    onChange(listener: (settings: Settings) => void): () => void {
      const cb = (changes: Record<string, chrome.storage.StorageChange>) => {
        if (SETTINGS_KEY in changes) listener(normaliseSettings(changes[SETTINGS_KEY]?.newValue));
      };
      area.onChanged.addListener(cb);
      return () => area.onChanged.removeListener(cb);
    },
  };
}

const REGISTRY_KEY = 'tabRegistry';

/** Background side: the registry lives in chrome.storage.session so it survives service-worker restarts. */
export function chromeSessionRegistryStorage(): RegistryStorage {
  const area = chrome.storage.session;
  return {
    async read() {
      const data = await area.get(REGISTRY_KEY);
      const value = data[REGISTRY_KEY];
      return typeof value === 'object' && value !== null ? (value as Record<string, TabEntry>) : {};
    },
    async write(entries) {
      await area.set({ [REGISTRY_KEY]: entries });
    },
  };
}

export { isRuntimeRequest };
