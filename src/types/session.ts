/**
 * Session state shared between the content script (per page) and the
 * background service worker (per tab registry).
 */

/**
 * What the background remembers about a tab.
 *
 * - `active` / `paused`: the user consented and assistance continues across
 *   page loads on the same origin without asking again.
 * - `inactive`: the user declined or stopped. ID Assist stays quiet on this
 *   origin in this tab until the user activates it manually or navigates to a
 *   different origin.
 */
export type TabEntryState = 'active' | 'paused' | 'inactive';

export interface TabEntry {
  state: TabEntryState;
  /** `location.origin` where the decision was made. */
  origin: string;
  /** Signature of the form the user consented to (informational in Phase 1). */
  formSignature: string | null;
  /** Why the entry is inactive, when it is. */
  reason?: 'declined' | 'stopped';
  updatedAt: number;
}

/** Content-side controller states. */
export type ControllerState =
  | 'idle'
  | 'awaiting-consent'
  | 'active'
  | 'paused'
  | 'inactive'; // declined or stopped on this origin

/**
 * What the floating indicator can show. Listening/processing/speaking arrive in Phase 3.
 * `collapsed` is the small launcher dot left behind after a decline or stop so
 * there is always a visible way to ask for help again.
 */
export type IndicatorState =
  | 'hidden'
  | 'collapsed'
  | 'detected'
  | 'awaiting-consent'
  | 'active'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'paused'
  | 'stopped'
  | 'no-form';
