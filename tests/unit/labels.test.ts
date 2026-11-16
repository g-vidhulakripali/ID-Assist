import { describe, expect, it } from 'vitest';
import { accessibleLabel, humaniseIdentifier } from '../../src/form-detection/labels';
import { setBody } from './helpers';

describe('accessibleLabel', () => {
  it('prefers aria-labelledby, then aria-label, then <label for>, then wrapping label', () => {
    const doc = setBody(`
      <span id="t">Given name</span>
      <input id="a" aria-labelledby="t" aria-label="ignored">
      <input id="b" aria-label="Family name">
      <label for="c">Email</label><input id="c">
      <label>Phone <input id="d"></label>
      <label for="e">Country <select id="e"><option>Germany</option></select></label>`);
    expect(accessibleLabel(doc.getElementById('a')!)).toBe('Given name');
    expect(accessibleLabel(doc.getElementById('b')!)).toBe('Family name');
    expect(accessibleLabel(doc.getElementById('c')!)).toBe('Email');
    expect(accessibleLabel(doc.getElementById('d')!)).toBe('Phone');
    expect(accessibleLabel(doc.getElementById('e')!)).toBe('Country');
  });

  it('falls back to placeholder, title and a humanised name', () => {
    const doc = setBody(`
      <input id="a" placeholder="Your city">
      <input id="b" title="Postcode">
      <input id="c" name="user[first_name]">
      <input id="d" name="dateOfBirth">`);
    expect(accessibleLabel(doc.getElementById('a')!)).toBe('Your city');
    expect(accessibleLabel(doc.getElementById('b')!)).toBe('Postcode');
    expect(accessibleLabel(doc.getElementById('c')!)).toBe('user first name');
    expect(accessibleLabel(doc.getElementById('d')!)).toBe('date of birth');
  });

  it('collapses whitespace in labels', () => {
    const doc = setBody(`<label for="a">  Full
      name  <span>(required)</span></label><input id="a">`);
    expect(accessibleLabel(doc.getElementById('a')!)).toBe('Full name (required)');
  });

  it('humanises identifiers', () => {
    expect(humaniseIdentifier('billing_address-line1')).toBe('billing address line1');
    expect(humaniseIdentifier('applicant[phoneNumber]')).toBe('applicant phone number');
  });
});
