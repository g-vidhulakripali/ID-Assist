/**
 * Groups controls into form candidates.
 *
 *  - Controls owned by a <form> (including via the `form` attribute) are
 *    grouped by that form: an explicit group.
 *  - Orphan controls are grouped by the nearest landmark-like container
 *    (role=form, fieldset, dialog, article, section, main) or <body>: an
 *    implicit group. This is a heuristic and is refined in Phase 2.
 */

export interface ControlGroup {
  container: HTMLElement;
  kind: 'explicit' | 'implicit';
  controls: HTMLElement[];
}

const IMPLICIT_CONTAINER_SELECTOR = '[role="form"],fieldset,dialog,[role="dialog"],article,section,main';

export function ownerForm(control: Element): HTMLFormElement | null {
  const direct = (control as HTMLInputElement).form;
  if (direct instanceof HTMLFormElement) return direct;
  return control.closest('form');
}

export function groupControls(controls: HTMLElement[], doc: Document): ControlGroup[] {
  const groups = new Map<HTMLElement, ControlGroup>();
  const body = doc.body ?? doc.documentElement;

  for (const control of controls) {
    const form = ownerForm(control);
    let container: HTMLElement;
    let kind: 'explicit' | 'implicit';
    if (form) {
      container = form;
      kind = 'explicit';
    } else {
      container = (control.parentElement?.closest(IMPLICIT_CONTAINER_SELECTOR) as HTMLElement | null) ?? body;
      kind = 'implicit';
    }
    let group = groups.get(container);
    if (!group) {
      group = { container, kind, controls: [] };
      groups.set(container, group);
    }
    group.controls.push(control);
  }

  // Keep document order of containers.
  return Array.from(groups.values()).sort((a, b) =>
    a.container.compareDocumentPosition(b.container) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
  );
}
