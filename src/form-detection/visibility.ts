/**
 * Visibility heuristics. Uses `Element.checkVisibility()` where available
 * (Chromium 105+) and falls back to attribute and computed-style checks in
 * environments without layout, such as jsdom.
 */
export function isVisible(el: Element): boolean {
  if (el.closest('[hidden]')) return false;
  if (el.getAttribute('aria-hidden') === 'true') return false;
  if ((el as HTMLInputElement).type === 'hidden') return false;

  const view = el.ownerDocument.defaultView;
  const checkVisibility = (el as Element & { checkVisibility?: (o?: object) => boolean }).checkVisibility;
  if (typeof checkVisibility === 'function') {
    return checkVisibility.call(el, { checkOpacity: false, checkVisibilityCSS: true });
  }

  if (view) {
    for (let node: Element | null = el; node; node = node.parentElement) {
      const style = view.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
    }
  }
  return true;
}
