/**
 * Content script entry point. Wires the detector, DOM watcher, session
 * controller and floating indicator together on each page. Everything here is
 * read-only with respect to the page's form fields: Phase 1 never writes a value.
 */
import { backgroundTabEntryPort, chromeSettingsStore, hasExtensionRuntime, onContentCommand } from '../browser/chrome-adapters';
import { FloatingIndicator } from '../floating-ui/indicator';
import { detectForms } from '../form-detection/detector';
import { watchDom } from '../form-detection/observer';
import { SessionController } from '../session/controller';
import { logger } from '../shared/logger';

declare global {
  interface Window {
    __idAssistLoaded?: boolean;
  }
}

function main(): void {
  if (window.__idAssistLoaded) return; // guard against double injection (e.g. extension reload)
  window.__idAssistLoaded = true;
  if (!hasExtensionRuntime()) {
    logger.warn('extension runtime not available; not starting');
    return;
  }
  if (window.top !== window) return; // manifest says top frame only; belt and braces

  const indicator = new FloatingIndicator(document, {
    onAccept: () => void controller.accept(),
    onDecline: () => void controller.decline(),
    onPause: () => void controller.pause(),
    onResume: () => void controller.resume(),
    onStop: () => void controller.stop(),
    onActivate: () => controller.manualActivate(),
  });

  const ignore = (node: Node) => indicator.owns(node);
  const controller = new SessionController({
    detect: () => detectForms(document, { ignore: (el) => ignore(el) }),
    ui: indicator,
    registry: backgroundTabEntryPort(),
    settings: chromeSettingsStore(),
    origin: location.origin,
    activeElement: () => document.activeElement,
    log: logger,
  });

  const stopWatching = watchDom(document, () => controller.rescan(), { ignore });
  const stopCommands = onContentCommand(() => controller.manualActivate());

  controller.start().catch((err) => logger.error('failed to start', err));

  window.addEventListener(
    'pagehide',
    () => {
      stopWatching();
      stopCommands();
      controller.dispose();
    },
    { once: true },
  );
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main, { once: true });
} else {
  main();
}
