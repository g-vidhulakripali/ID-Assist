import type { FieldKind } from '../types/forms';

/**
 * Selector for every element that may be a data-entry control. Buttons and
 * hidden inputs match too and are filtered out by `classifyControl`.
 */
export const CONTROL_SELECTOR = [
  'input',
  'select',
  'textarea',
  '[contenteditable]:not([contenteditable="false"])',
  '[role="textbox"]',
  '[role="combobox"]',
  '[role="listbox"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="slider"]',
  '[role="spinbutton"]',
].join(',');

const INPUT_TYPE_TO_KIND: Record<string, FieldKind> = {
  text: 'text',
  email: 'email',
  tel: 'tel',
  url: 'url',
  number: 'number',
  password: 'password',
  search: 'search',
  checkbox: 'checkbox',
  radio: 'radio',
  date: 'date',
  time: 'time',
  'datetime-local': 'datetime',
  month: 'month',
  week: 'week',
  range: 'range',
  color: 'color',
  file: 'file',
};

const ROLE_TO_KIND: Record<string, FieldKind> = {
  textbox: 'text',
  combobox: 'combobox',
  listbox: 'select',
  checkbox: 'checkbox',
  radio: 'radio',
  switch: 'switch',
  slider: 'range',
  spinbutton: 'number',
};

/**
 * Returns the kind of a data-entry control, or `null` when the element is not
 * one (buttons, submit/reset/image inputs, hidden inputs).
 */
export function classifyControl(el: Element): FieldKind | null {
  const tag = el.tagName.toLowerCase();
  if (tag === 'input') {
    const type = ((el as HTMLInputElement).getAttribute('type') ?? 'text').toLowerCase();
    if (type === 'hidden' || type === 'submit' || type === 'button' || type === 'reset' || type === 'image') {
      return null;
    }
    return INPUT_TYPE_TO_KIND[type] ?? 'text';
  }
  if (tag === 'textarea') return 'textarea';
  if (tag === 'select') return (el as HTMLSelectElement).multiple ? 'select-multiple' : 'select';
  if (tag === 'button') return null;

  const role = el.getAttribute('role')?.toLowerCase();
  if (role && ROLE_TO_KIND[role]) {
    // An input with role=combobox was handled above; this is a custom control.
    if (role === 'textbox' && el.getAttribute('contenteditable') !== null) return 'rich-text';
    return ROLE_TO_KIND[role] ?? 'other';
  }
  if (el.getAttribute('contenteditable') !== null && el.getAttribute('contenteditable') !== 'false') {
    return 'rich-text';
  }
  return null;
}

/** Whether the native or ARIA semantics mark the control as required. */
export function isRequired(el: Element): boolean {
  if ((el as HTMLInputElement).required) return true;
  return el.getAttribute('aria-required') === 'true';
}

export function isDisabled(el: Element): boolean {
  if ((el as HTMLInputElement).disabled) return true;
  if (el.getAttribute('aria-disabled') === 'true') return true;
  if (el.hasAttribute('readonly') || el.getAttribute('aria-readonly') === 'true') return true;
  return el.closest('fieldset[disabled]') !== null;
}
