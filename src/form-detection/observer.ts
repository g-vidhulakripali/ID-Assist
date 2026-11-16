import { debounce } from '../shared/debounce';

export interface DomWatcherOptions {
  debounceMs?: number;
  /** Mutations inside elements for which this returns true are ignored (e.g. our own UI). */
  ignore?: (node: Node) => boolean;
}

/**
 * Watches the document for changes that could add, remove or reveal form
 * controls, and for in-page navigation (hash/history changes in single-page
 * apps). Calls `onChange` at most once per debounce window.
 *
 * Attribute observation is limited to a short list because observing `class`
 * and `style` on a whole document fires constantly on animated pages.
 */
export function watchDom(doc: Document, onChange: () => void, options: DomWatcherOptions = {}): () => void {
  const ignore = options.ignore ?? (() => false);
  const notify = debounce(onChange, options.debounceMs ?? 300);

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (!ignore(record.target)) {
        notify();
        return;
      }
    }
  });
  observer.observe(doc.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['hidden', 'disabled', 'type', 'open', 'aria-hidden'],
  });

  const view = doc.defaultView;
  const navEvents = ['hashchange', 'popstate', 'pageshow'] as const;
  navEvents.forEach((e) => view?.addEventListener(e, notify));

  return () => {
    observer.disconnect();
    notify.cancel();
    navEvents.forEach((e) => view?.removeEventListener(e, notify));
  };
}
