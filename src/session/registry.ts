import type { TabEntry } from '../types/session';

/** Key/value storage for the per-tab registry (chrome.storage.session in production). */
export interface RegistryStorage {
  read(): Promise<Record<string, TabEntry>>;
  write(entries: Record<string, TabEntry>): Promise<void>;
}

export function memoryRegistryStorage(initial: Record<string, TabEntry> = {}): RegistryStorage {
  let data = { ...initial };
  return {
    read: async () => ({ ...data }),
    write: async (entries) => {
      data = { ...entries };
    },
  };
}

/**
 * Remembers, per browser tab, whether the user consented, paused, declined or
 * stopped. Lives in the background service worker because content scripts are
 * recreated on every page load and cannot see each other.
 */
export class SessionRegistry {
  constructor(private readonly storage: RegistryStorage) {}

  async get(tabId: number): Promise<TabEntry | null> {
    const all = await this.storage.read();
    return all[String(tabId)] ?? null;
  }

  async set(tabId: number, entry: TabEntry): Promise<void> {
    const all = await this.storage.read();
    all[String(tabId)] = entry;
    await this.storage.write(all);
  }

  async clear(tabId: number): Promise<void> {
    const all = await this.storage.read();
    if (!(String(tabId) in all)) return;
    delete all[String(tabId)];
    await this.storage.write(all);
  }
}

/** The content script's view of the registry: only its own tab, resolved by the background. */
export interface TabEntryPort {
  get(): Promise<TabEntry | null>;
  set(entry: TabEntry): Promise<void>;
  clear(): Promise<void>;
}

export function memoryTabEntryPort(initial: TabEntry | null = null): TabEntryPort & { current: TabEntry | null } {
  const port = {
    current: initial,
    async get() {
      return port.current;
    },
    async set(entry: TabEntry) {
      port.current = entry;
    },
    async clear() {
      port.current = null;
    },
  };
  return port;
}
