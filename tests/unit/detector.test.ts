import { describe, expect, it } from 'vitest';
import { choosePrimaryForm, detectForms } from '../../src/form-detection/detector';
import { setBody } from './helpers';

const contactForm = `
  <form id="contact" action="/send">
    <label for="n">Full name</label><input id="n" name="name" required>
    <label for="e">Email address</label><input id="e" name="email" type="email">
    <label for="m">Message</label><textarea id="m" name="message"></textarea>
    <button type="submit">Send</button>
  </form>`;

describe('detectForms', () => {
  it('detects an ordinary HTML form with labelled fields', () => {
    const forms = detectForms(setBody(contactForm));
    expect(forms).toHaveLength(1);
    const form = forms[0]!;
    expect(form.kind).toBe('explicit');
    expect(form.fields.map((f) => f.kind)).toEqual(['text', 'email', 'textarea']);
    expect(form.fields.map((f) => f.label)).toEqual(['Full name', 'Email address', 'Message']);
    expect(form.fields[0]!.required).toBe(true);
    expect(form.assistableFieldCount).toBe(3);
  });

  it('ignores buttons and hidden inputs', () => {
    const forms = detectForms(
      setBody(`<form>
        <input type="hidden" name="csrf" value="x">
        <input name="a" aria-label="A"><input name="b" aria-label="B">
        <input type="submit" value="Go"><button>Reset</button>
      </form>`),
    );
    expect(forms[0]!.fields.map((f) => f.name)).toEqual(['a', 'b']);
  });

  it('ignores a search box and a single-field newsletter form', () => {
    const forms = detectForms(
      setBody(`
        <form role="search"><input type="search" name="q" aria-label="Search"></form>
        <form id="nl"><input type="email" name="email" aria-label="Your email"><button>Subscribe</button></form>
        ${contactForm}`),
    );
    expect(forms.map((f) => f.element.id)).toEqual(['contact']);
  });

  it('does not treat a sign-in form as something to help with', () => {
    const forms = detectForms(
      setBody(`<form>
        <label for="u">Username</label><input id="u" name="username">
        <label for="p">Password</label><input id="p" name="password" type="password">
        <label><input type="checkbox" name="remember"> Remember me</label>
      </form>`),
    );
    expect(forms).toHaveLength(0);
  });

  it('keeps a registration form but marks its password fields sensitive', () => {
    const forms = detectForms(
      setBody(`<form>
        <label for="n">Name</label><input id="n" name="name">
        <label for="e">Email</label><input id="e" name="email" type="email">
        <label for="p">Password</label><input id="p" name="password" type="password">
        <label for="c">Confirm password</label><input id="c" name="password_confirmation" type="password">
      </form>`),
    );
    expect(forms).toHaveLength(1);
    expect(forms[0]!.assistableFieldCount).toBe(2);
    expect(forms[0]!.fields.filter((f) => f.sensitivity === 'credential')).toHaveLength(2);
  });

  it('distinguishes multiple independent forms on one page', () => {
    const forms = detectForms(
      setBody(`
        <form id="a"><input name="x" aria-label="X"><input name="y" aria-label="Y"></form>
        <form id="b"><input name="p" aria-label="P"><input name="q" aria-label="Q"><input name="r" aria-label="R"></form>`),
    );
    expect(forms.map((f) => f.element.id)).toEqual(['a', 'b']);
    expect(forms[0]!.signature).not.toBe(forms[1]!.signature);
  });

  it('groups orphan controls into an implicit form by container', () => {
    const forms = detectForms(
      setBody(`<main>
        <section aria-label="Profile">
          <label for="a">First name</label><input id="a">
          <label for="b">Last name</label><input id="b">
        </section>
        <p>Unrelated text</p>
      </main>`),
    );
    expect(forms).toHaveLength(1);
    expect(forms[0]!.kind).toBe('implicit');
    expect(forms[0]!.title).toBe('Profile');
    expect(forms[0]!.fields).toHaveLength(2);
  });

  it('honours the form attribute for controls outside the form element', () => {
    const forms = detectForms(
      setBody(`<form id="f"><input name="inside" aria-label="Inside"></form>
               <input name="outside" form="f" aria-label="Outside">`),
    );
    expect(forms).toHaveLength(1);
    expect(forms[0]!.fields.map((f) => f.name)).toEqual(['inside', 'outside']);
  });

  it('counts a radio group once', () => {
    const forms = detectForms(
      setBody(`<form>
        <label for="n">Name</label><input id="n" name="name">
        <label><input type="radio" name="size" value="s"> Small</label>
        <label><input type="radio" name="size" value="m"> Medium</label>
        <label><input type="radio" name="size" value="l"> Large</label>
      </form>`),
    );
    expect(forms[0]!.fields).toHaveLength(2);
  });

  it('skips hidden controls and sections', () => {
    const forms = detectForms(
      setBody(`<form>
        <input name="a" aria-label="A"><input name="b" aria-label="B">
        <div hidden><input name="c" aria-label="C"></div>
        <input name="d" aria-label="D" style="display:none">
      </form>`),
    );
    expect(forms[0]!.fields.map((f) => f.name)).toEqual(['a', 'b']);
  });

  it('recognises custom ARIA controls', () => {
    const forms = detectForms(
      setBody(`<form>
        <span id="l1">Country</span><div role="combobox" aria-labelledby="l1" tabindex="0"></div>
        <span id="l2">Notes</span><div role="textbox" contenteditable="true" aria-labelledby="l2"></div>
        <span id="l3">Newsletter</span><div role="switch" aria-labelledby="l3" aria-checked="false"></div>
      </form>`),
    );
    expect(forms[0]!.fields.map((f) => [f.kind, f.label])).toEqual([
      ['combobox', 'Country'],
      ['rich-text', 'Notes'],
      ['switch', 'Newsletter'],
    ]);
  });

  it('ignores elements the caller asks it to ignore (our own UI)', () => {
    const doc = setBody(`${contactForm}<div id="ours"><input aria-label="X"><input aria-label="Y"></div>`);
    const ours = doc.getElementById('ours')!;
    const forms = detectForms(doc, { ignore: (el) => ours.contains(el) });
    expect(forms).toHaveLength(1);
    expect(forms[0]!.element.id).toBe('contact');
  });

  it('produces stable ids and signatures across rescans', () => {
    const doc = setBody(contactForm);
    const first = detectForms(doc)[0]!;
    const second = detectForms(doc)[0]!;
    expect(second.id).toBe(first.id);
    expect(second.signature).toBe(first.signature);
    expect(second.fields.map((f) => f.id)).toEqual(first.fields.map((f) => f.id));
  });

  it('derives a title from a heading or legend', () => {
    const forms = detectForms(
      setBody(`<h2>Trade enquiry</h2><form><input aria-label="A"><input aria-label="B"></form>
               <form><fieldset><legend>Shipping</legend><input aria-label="C"><input aria-label="D"></fieldset></form>`),
    );
    expect(forms.map((f) => f.title)).toEqual(['Trade enquiry', 'Shipping']);
  });
});

describe('choosePrimaryForm', () => {
  it('prefers the form that has focus, then the one with the most assistable fields', () => {
    const doc = setBody(`
      <form id="small"><input id="s1" aria-label="A"><input aria-label="B"></form>
      <form id="big"><input aria-label="C"><input aria-label="D"><input aria-label="E"></form>`);
    const forms = detectForms(doc);
    expect(choosePrimaryForm(forms, null)!.element.id).toBe('big');
    expect(choosePrimaryForm(forms, doc.getElementById('s1'))!.element.id).toBe('small');
    expect(choosePrimaryForm([], null)).toBeNull();
  });
});
