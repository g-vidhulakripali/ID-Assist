/**
 * Background service worker. Deliberately thin: it owns the per-tab session
 * registry (because content scripts cannot share state across page loads),
 * relays the keyboard shortcut and toolbar button to the active tab, and
 * seeds default settings on install. It never sees form content.
 */
import { chromeSessionRegistryStorage, chromeSettingsStore } from '../browser/chrome-adapters';
import { SessionRegistry } from '../session/registry';
import { logger } from '../shared/logger';
import { isRuntimeRequest, type ContentCommand, type RuntimeRequest, type RuntimeResponse } from '../shared/messages';

const registry = new SessionRegistry(chromeSessionRegistryStorage());

async function handleRequest(req: RuntimeRequest, tabId: number): Promise<RuntimeResponse> {
  switch (req.type) {
    case 'tab-entry:get':
      return { ok: true, entry: await registry.get(tabId) };
    case 'tab-entry:set':
      await registry.set(tabId, req.entry);
      return { ok: true, entry: req.entry };
    case 'tab-entry:clear':
      await registry.clear(tabId);
      return { ok: true, entry: null };
  }
}

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (!isRuntimeRequest(message)) return false;
  const tabId = sender.tab?.id;
  if (tabId === undefined) {
    sendResponse({ ok: false, error: 'request did not come from a tab' } satisfies RuntimeResponse);
    return false;
  }
  handleRequest(message, tabId).then(sendResponse, (err: unknown) =>
    sendResponse({ ok: false, error: String(err) } satisfies RuntimeResponse),
  );
  return true; // keep the channel open for the async response
});

chrome.tabs.onRemoved.addListener((tabId) => {
  registry.clear(tabId).catch((err) => logger.warn('could not clear tab entry', err));
});

async function activateInTab(tabId: number): Promise<void> {
  const cmd: ContentCommand = { type: 'command:activate' };
  try {
    await chrome.tabs.sendMessage(tabId, cmd);
  } catch {
    // No content script here: browser pages (edge://), the Add-ons store, PDF viewer, file:// without permission.
    logger.info('ID Assist cannot run on this page');
  }
}

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'activate-assist' && tab?.id !== undefined) void activateInTab(tab.id);
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.id !== undefined) void activateInTab(tab.id);
});

chrome.runtime.onInstalled.addListener(() => {
  // Persist defaults so the options page shows real stored values from the start.
  const store = chromeSettingsStore();
  store
    .load()
    .then((s) => store.save(s))
    .catch((err) => logger.warn('could not seed settings', err));
});
