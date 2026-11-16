export type Corner = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

export interface Settings {
  /** Offer help automatically when a form is detected. Manual activation always works. */
  autoDetect: boolean;
  /** Where the floating indicator sits. */
  indicatorPosition: Corner;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  autoDetect: true,
  indicatorPosition: 'bottom-right',
});

export const CORNERS: readonly Corner[] = ['bottom-right', 'bottom-left', 'top-right', 'top-left'];

/** Merge stored values with defaults, discarding anything malformed. */
export function normaliseSettings(raw: unknown): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS };
  if (typeof raw !== 'object' || raw === null) return out;
  const r = raw as Record<string, unknown>;
  if (typeof r.autoDetect === 'boolean') out.autoDetect = r.autoDetect;
  if (typeof r.indicatorPosition === 'string' && (CORNERS as readonly string[]).includes(r.indicatorPosition)) {
    out.indicatorPosition = r.indicatorPosition as Corner;
  }
  return out;
}

/** Abstraction over chrome.storage so the core can be tested without a browser. */
export interface SettingsStore {
  load(): Promise<Settings>;
  save(patch: Partial<Settings>): Promise<void>;
  /** Returns an unsubscribe function. */
  onChange(listener: (settings: Settings) => void): () => void;
}
