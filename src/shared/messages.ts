import type { TabEntry } from '../types/session';

/** Messages the content script sends to the background service worker. */
export type RuntimeRequest =
  | { type: 'tab-entry:get' }
  | { type: 'tab-entry:set'; entry: TabEntry }
  | { type: 'tab-entry:clear' };

export type RuntimeResponse =
  | { ok: true; entry: TabEntry | null }
  | { ok: false; error: string };

/** Messages the background sends to a tab's content script. */
export type ContentCommand = { type: 'command:activate' };

export function isContentCommand(value: unknown): value is ContentCommand {
  return typeof value === 'object' && value !== null && (value as { type?: unknown }).type === 'command:activate';
}

export function isRuntimeRequest(value: unknown): value is RuntimeRequest {
  if (typeof value !== 'object' || value === null) return false;
  const type = (value as { type?: unknown }).type;
  return type === 'tab-entry:get' || type === 'tab-entry:set' || type === 'tab-entry:clear';
}
