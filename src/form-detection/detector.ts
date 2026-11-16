import type { DetectedField, DetectedForm, FieldKind } from '../types/forms';
import { fnv1a } from '../shared/hash';
import { classifyElementSensitivity } from '../security/sensitive-fields';
import { CONTROL_SELECTOR, classifyControl, isDisabled, isRequired } from './field-kind';
import { groupControls } from './grouping';
import { accessibleLabel, containerTitle } from './labels';
import { isVisible } from './visibility';

export interface DetectorOptions {
  /** Elements for which this returns true are ignored, along with their descendants (e.g. our own UI host). */
  ignore?: (el: Element) => boolean;
}

/**
 * Stable element ids for the lifetime of the page. A WeakMap means we never
 * touch the page's DOM attributes and never leak removed elements.
 */
const elementIds = new WeakMap<Element, string>();
let idCounter = 0;
export function stableId(el: Element, prefix: string): string {
  let id = elementIds.get(el);
  if (!id) {
    id = `${prefix}-${(++idCounter).toString(36)}`;
    elementIds.set(el, id);
  }
  return id;
}

const SEARCH_KINDS: ReadonlySet<FieldKind> = new Set(['search']);

export function isAssistable(field: DetectedField): boolean {
  return !field.disabled && field.sensitivity === 'none' && !SEARCH_KINDS.has(field.kind);
}

/**
 * Decide whether a group of controls is a form worth offering help with.
 *
 *  - A lone search box, or anything inside role=search, is navigation, not a form.
 *  - A group with a credential field and at most one other substantive
 *    (non-checkbox) assistable field is a sign-in form; ID Assist has nothing
 *    useful to offer there.
 *  - Otherwise we require at least two assistable fields, or one textarea,
 *    so that single-field widgets (newsletter boxes, coupon codes) do not
 *    trigger an offer on every page.
 */
export function isMeaningfulForm(fields: DetectedField[], container: Element): boolean {
  if (container.closest('[role="search"]')) return false;
  const assistable = fields.filter(isAssistable);
  if (assistable.length === 0) return false;
  if (fields.some((f) => f.sensitivity === 'credential')) {
    // Username + password (+ "remember me") is a sign-in form; checkboxes do not make it worth helping with.
    const substantive = assistable.filter((f) => f.kind !== 'checkbox' && f.kind !== 'switch');
    if (substantive.length <= 1) return false;
  }
  if (assistable.length >= 2) return true;
  return assistable.some((f) => f.kind === 'textarea' || f.kind === 'rich-text');
}

export function formSignature(fields: DetectedField[], container: Element): string {
  const parts = fields.map((f) => `${f.kind}|${f.name}|${f.label}|${f.required ? 1 : 0}`);
  const action = container.getAttribute('action') ?? '';
  const containerId = container.getAttribute('id') ?? '';
  return fnv1a(`${container.tagName}|${containerId}|${action}|${parts.join('||')}`);
}

export function describeField(el: HTMLElement): DetectedField | null {
  const kind = classifyControl(el);
  if (!kind) return null;
  const label = accessibleLabel(el);
  return {
    id: stableId(el, 'f'),
    element: el,
    kind,
    name: el.getAttribute('name') ?? '',
    label,
    required: isRequired(el),
    disabled: isDisabled(el),
    sensitivity: classifyElementSensitivity(el, kind, label),
  };
}

/** Scan a document for forms worth offering help with. Pure read-only DOM inspection. */
export function detectForms(doc: Document, options: DetectorOptions = {}): DetectedForm[] {
  const ignore = options.ignore ?? (() => false);
  const controls: HTMLElement[] = [];
  for (const el of Array.from(doc.querySelectorAll<HTMLElement>(CONTROL_SELECTOR))) {
    if (ignore(el)) continue;
    if (!classifyControl(el)) continue;
    if (!isVisible(el)) continue;
    controls.push(el);
  }

  const forms: DetectedForm[] = [];
  for (const group of groupControls(controls, doc)) {
    if (ignore(group.container)) continue;
    const fields = group.controls.map(describeField).filter((f): f is DetectedField => f !== null);
    // Radio groups count once per name, otherwise a 5-option question looks like 5 fields.
    const dedupedFields = dedupeRadioGroups(fields);
    if (!isMeaningfulForm(dedupedFields, group.container)) continue;
    forms.push({
      id: stableId(group.container, 'form'),
      kind: group.kind,
      element: group.container,
      title: containerTitle(group.container),
      fields: dedupedFields,
      assistableFieldCount: dedupedFields.filter(isAssistable).length,
      signature: formSignature(dedupedFields, group.container),
    });
  }
  return forms;
}

function dedupeRadioGroups(fields: DetectedField[]): DetectedField[] {
  const seenRadioNames = new Set<string>();
  return fields.filter((f) => {
    if (f.kind !== 'radio' || !f.name) return true;
    if (seenRadioNames.has(f.name)) return false;
    seenRadioNames.add(f.name);
    return true;
  });
}

/**
 * Pick the form to offer help with when several are present: the one holding
 * keyboard focus, otherwise the one with the most assistable fields, with
 * document order as the tie-breaker.
 */
export function choosePrimaryForm(forms: DetectedForm[], activeElement: Element | null): DetectedForm | null {
  if (forms.length === 0) return null;
  if (activeElement) {
    const focused = forms.find((f) => f.element.contains(activeElement));
    if (focused) return focused;
  }
  return forms.reduce((best, f) => (f.assistableFieldCount > best.assistableFieldCount ? f : best));
}
