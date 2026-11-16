import { describe, expect, it } from 'vitest';
import { classifySensitivity } from '../../src/security/sensitive-fields';
import type { FieldKind } from '../../src/types/forms';

const field = (over: Partial<{ kind: FieldKind; autocomplete: string; name: string; id: string; label: string }>) =>
  classifySensitivity({ kind: 'text', autocomplete: '', name: '', id: '', label: '', ...over });

describe('classifySensitivity', () => {
  it('flags password inputs and password autocomplete', () => {
    expect(field({ kind: 'password' })).toBe('credential');
    expect(field({ autocomplete: 'current-password' })).toBe('credential');
    expect(field({ name: 'user_pwd' })).toBe('credential');
    expect(field({ label: 'Passphrase' })).toBe('credential');
  });

  it('flags one-time codes', () => {
    expect(field({ autocomplete: 'one-time-code' })).toBe('one-time-code');
    expect(field({ label: 'Enter the verification code we sent you' })).toBe('one-time-code');
    expect(field({ name: 'otp' })).toBe('one-time-code');
    expect(field({ label: '2FA code' })).toBe('one-time-code');
  });

  it('flags payment card and bank details', () => {
    expect(field({ autocomplete: 'cc-number' })).toBe('payment');
    expect(field({ autocomplete: 'cc-csc' })).toBe('payment');
    expect(field({ label: 'Card number' })).toBe('payment');
    expect(field({ label: 'CVV' })).toBe('payment');
    expect(field({ label: 'Expiry date' })).toBe('payment');
    expect(field({ label: 'IBAN' })).toBe('payment');
  });

  it('treats identifiers it is unsure about as unknown (left to the user)', () => {
    expect(field({ label: 'Social Security Number' })).toBe('unknown');
    expect(field({ label: 'Passport number' })).toBe('unknown');
    expect(field({ label: 'PIN' })).toBe('unknown');
    expect(field({ name: 'api_key' })).toBe('unknown');
  });

  it('does not flag ordinary personal fields', () => {
    expect(field({ label: 'Full name', autocomplete: 'name' })).toBe('none');
    expect(field({ label: 'Email address', kind: 'email' })).toBe('none');
    expect(field({ label: 'Date of birth', kind: 'date' })).toBe('none');
    expect(field({ label: 'Passport photo upload', kind: 'file' })).toBe('none');
    expect(field({ label: 'Season pass holder?' })).toBe('none');
  });

  it('treats a postal PIN code as an address field, not a secret', () => {
    expect(field({ label: 'PIN code', name: 'pincode' })).toBe('none');
    expect(field({ label: 'Postal code' })).toBe('none');
  });
});
