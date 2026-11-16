import type { FieldKind, Sensitivity } from '../types/forms';

/**
 * Conservative sensitive-field classification.
 *
 * Rules, in order of confidence:
 *  1. Native semantics: type=password, autocomplete tokens.
 *  2. Strong textual markers in name/id/label for credentials, one-time codes
 *     and payment-card data.
 *  3. Weaker markers for identifiers we would rather not handle yet (PINs,
 *     national IDs, secrets) -> `unknown`, which is treated as "leave it to the user".
 *
 * False positives cost the user a manually typed field; false negatives could
 * route a secret through speech recognition. The rules therefore lean towards
 * flagging. Never log values of fields classified here.
 */

const CREDENTIAL_AUTOCOMPLETE = new Set(['current-password', 'new-password']);
const OTP_AUTOCOMPLETE = new Set(['one-time-code']);
const PAYMENT_AUTOCOMPLETE_PREFIX = 'cc-';

const CREDENTIAL_RE = /\b(pass(word|wort|code|phrase)|pwd|passwd)\b/i;
/** Postal "PIN code" (India) and similar are addresses, not secrets; removed before the `pin` check. */
const NOT_SENSITIVE_RE = /\b(pin[\s-]?code|pincode|postal[\s-]?code|zip[\s-]?code)\b/gi;
const OTP_RE =
  /\b(otp|one[\s-]?time[\s-]?(code|pass(code)?)?|verification[\s-]?code|security[\s-]?code|auth(entication)?[\s-]?code|2fa|mfa|totp|sms[\s-]?code|confirmation[\s-]?code)\b/i;
const PAYMENT_RE =
  /\b(card[\s-]?(number|no|num)|credit[\s-]?card|debit[\s-]?card|cc[\s-]?(number|num|no)|cvv2?|cvc2?|cvn|cid|csc|card[\s-]?security|expir(y|ation)[\s-]?(date|month|year)?|exp[\s-]?(date|month|year|mm|yy)|iban|account[\s-]?number|routing[\s-]?number|sort[\s-]?code|swift|bic)\b/i;
const UNKNOWN_RE =
  /\b(pin|secret|token|api[\s-]?key|ssn|social[\s-]?security|national[\s-]?(insurance|id|identity)|passport[\s-]?(no|number|id)|tax[\s-]?(id|number)|aadhaar|pan[\s-]?(card|number)|driver'?s?[\s-]?licen[cs]e|licen[cs]e[\s-]?number)\b/i;

export interface SensitivityInput {
  kind: FieldKind;
  autocomplete: string;
  name: string;
  id: string;
  label: string;
}

export function classifySensitivity(input: SensitivityInput): Sensitivity {
  if (input.kind === 'password') return 'credential';

  const tokens = input.autocomplete.toLowerCase().split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    if (CREDENTIAL_AUTOCOMPLETE.has(token)) return 'credential';
    if (OTP_AUTOCOMPLETE.has(token)) return 'one-time-code';
    if (token.startsWith(PAYMENT_AUTOCOMPLETE_PREFIX)) return 'payment';
  }

  const text = `${input.name} ${input.id} ${input.label}`.replace(/[_\-.]+/g, ' ');
  if (CREDENTIAL_RE.test(text)) return 'credential';
  if (OTP_RE.test(text)) return 'one-time-code';
  if (PAYMENT_RE.test(text)) return 'payment';
  if (UNKNOWN_RE.test(text.replace(NOT_SENSITIVE_RE, ' '))) return 'unknown';
  return 'none';
}

export function classifyElementSensitivity(el: Element, kind: FieldKind, label: string): Sensitivity {
  return classifySensitivity({
    kind,
    autocomplete: el.getAttribute('autocomplete') ?? '',
    name: el.getAttribute('name') ?? '',
    id: el.getAttribute('id') ?? '',
    label,
  });
}
