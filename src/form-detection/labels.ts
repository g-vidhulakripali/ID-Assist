/**
 * Basic accessible-name computation for Phase 1. It follows the spirit of the
 * accessible name algorithm (aria-labelledby, aria-label, <label>, placeholder,
 * title) and finally humanises the `name` attribute. Phase 2 extends this with
 * surrounding instructions, headings and neighbouring-field context.
 */

export function normaliseText(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

export function humaniseIdentifier(raw: string): string {
  return normaliseText(
    raw
      .replace(/[[\]_\-.]+/g, ' ') // name="user[first_name]" -> "user first name"
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase(),
  );
}

export function accessibleLabel(el: Element): string {
  const doc = el.ownerDocument;

  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => normaliseText(doc.getElementById(id)?.textContent))
      .filter(Boolean)
      .join(' ');
    if (text) return text;
  }

  const ariaLabel = normaliseText(el.getAttribute('aria-label'));
  if (ariaLabel) return ariaLabel;

  const labels = (el as HTMLInputElement).labels;
  if (labels && labels.length > 0) {
    const text = Array.from(labels)
      .map((l) => normaliseText(labelTextExcludingControls(l)))
      .filter(Boolean)
      .join(' ');
    if (text) return text;
  }

  // Custom controls are often wrapped in a <label> without `for`.
  const wrappingLabel = el.closest('label');
  if (wrappingLabel) {
    const text = normaliseText(labelTextExcludingControls(wrappingLabel));
    if (text) return text;
  }

  const placeholder = normaliseText(el.getAttribute('placeholder'));
  if (placeholder) return placeholder;

  const title = normaliseText(el.getAttribute('title'));
  if (title) return title;

  const name = el.getAttribute('name') ?? el.getAttribute('id') ?? '';
  return humaniseIdentifier(name);
}

/** Text of a label without the text of any controls nested inside it (e.g. select options). */
function labelTextExcludingControls(label: Element): string {
  const clone = label.cloneNode(true) as Element;
  clone.querySelectorAll('input,select,textarea,button').forEach((n) => n.remove());
  return clone.textContent ?? '';
}

/** Title for a group of fields: aria-label, legend, or nearest preceding heading. */
export function containerTitle(container: Element): string {
  const ariaLabel = normaliseText(container.getAttribute('aria-label'));
  if (ariaLabel) return ariaLabel;
  const labelledBy = container.getAttribute('aria-labelledby');
  if (labelledBy) {
    const text = normaliseText(container.ownerDocument.getElementById(labelledBy)?.textContent);
    if (text) return text;
  }
  const legend = container.querySelector(':scope > legend, :scope > fieldset > legend');
  if (legend) {
    const text = normaliseText(legend.textContent);
    if (text) return text;
  }
  const heading = container.querySelector('h1,h2,h3,h4,h5,h6');
  if (heading) {
    const text = normaliseText(heading.textContent);
    if (text) return text;
  }
  // Look at the immediately preceding heading sibling, a common pattern.
  let sibling = container.previousElementSibling;
  for (let i = 0; i < 3 && sibling; i++, sibling = sibling.previousElementSibling) {
    if (/^H[1-6]$/.test(sibling.tagName)) {
      const text = normaliseText(sibling.textContent);
      if (text) return text;
    }
  }
  return '';
}
