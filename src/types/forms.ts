/**
 * Form and field types shared by the detection engine, the session controller
 * and the floating UI.
 *
 * Phase 1 deliberately keeps a reference to the DOM element on each field so
 * the content script can inspect it. Phase 2 introduces the DOM-free common
 * field representation (FieldDescriptor) that the conversation engine will
 * consume; `DetectedField` is the DOM-layer input to that mapping.
 */

/** Broad classification of a form control, derived from tag, type and ARIA role. */
export type FieldKind =
  | 'text'
  | 'email'
  | 'tel'
  | 'url'
  | 'number'
  | 'password'
  | 'search'
  | 'textarea'
  | 'rich-text'
  | 'select'
  | 'select-multiple'
  | 'combobox'
  | 'checkbox'
  | 'radio'
  | 'switch'
  | 'date'
  | 'time'
  | 'datetime'
  | 'month'
  | 'week'
  | 'range'
  | 'color'
  | 'file'
  | 'other';

/**
 * Conservative sensitivity classification. Anything other than `none` is
 * never routed through the speech or AI pipeline; `unknown` means "looks like
 * it might be sensitive, leave it to the user" (see docs/decisions.md).
 */
export type Sensitivity = 'none' | 'credential' | 'one-time-code' | 'payment' | 'unknown';

export interface DetectedField {
  /** Stable id for this element for the lifetime of the page. */
  id: string;
  element: HTMLElement;
  kind: FieldKind;
  /** The `name` attribute, or an empty string. */
  name: string;
  /** Best-effort accessible label (Phase 2 deepens this with context). */
  label: string;
  required: boolean;
  disabled: boolean;
  sensitivity: Sensitivity;
}

export interface DetectedForm {
  /** Stable id for the container element for the lifetime of the page. */
  id: string;
  /** `explicit` = a real <form>; `implicit` = controls grouped by a container heuristic. */
  kind: 'explicit' | 'implicit';
  element: HTMLElement;
  /** Human-readable name derived from aria-label, a heading or legend, when available. */
  title: string;
  fields: DetectedField[];
  /** Fields ID Assist could help with: enabled, not sensitive, not a search box. */
  assistableFieldCount: number;
  /** Content fingerprint used to recognise the same form across rescans. */
  signature: string;
}

/** DOM-free summary that is safe to send across the extension messaging boundary. */
export interface FormSummary {
  id: string;
  title: string;
  fieldCount: number;
  assistableFieldCount: number;
  signature: string;
}

export function summariseForm(form: DetectedForm): FormSummary {
  return {
    id: form.id,
    title: form.title,
    fieldCount: form.fields.length,
    assistableFieldCount: form.assistableFieldCount,
    signature: form.signature,
  };
}
