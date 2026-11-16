// Smoke-tests the built extension in a real Microsoft Edge instance.
//
// Launches Edge with the unpacked extension (dist/), opens each fixture page
// through the local static server, and checks whether the ID Assist indicator
// appears (or not) as expected. Uses only Node built-ins and the Chrome
// DevTools Protocol over WebSocket (Node 22+).
//
// Usage: npm run build && node scripts/edge-smoke.mjs [--headful]
//
// Note: Chrome 137+ ignores --load-extension in branded builds. Edge may do the
// same in a future release; if the service worker target is not found, this
// script says so and exits non-zero. Manual loading via edge://extensions
// always works.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const headful = process.argv.includes('--headful');

const EDGE_CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/microsoft-edge',
];
const edge = process.env.EDGE_PATH ?? EDGE_CANDIDATES.find((p) => existsSync(p));
if (!edge) {
  console.error('Microsoft Edge not found. Set EDGE_PATH.');
  process.exit(2);
}
if (!existsSync(path.join(dist, 'manifest.json'))) {
  console.error('dist/manifest.json missing. Run `npm run build` first.');
  process.exit(2);
}

// Expectations per fixture: does the consent prompt appear automatically?
const CASES = [
  { page: 'contact.html', prompt: true },
  { page: 'registration.html', prompt: true },
  { page: 'job-application.html', prompt: true },
  { page: 'multiple-forms.html', prompt: true, title: 'Trade enquiry' },
  { page: 'payment.html', prompt: true },
  { page: 'login.html', prompt: false },
  { page: 'no-form.html', prompt: false },
];

// --- tiny static server (same as scripts/serve.mjs, inlined so this file is standalone)
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  const file = path.normalize(path.join(root, pathname));
  try {
    if (!file.startsWith(root) || !statSync(file).isFile()) throw new Error();
    res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/tests/browser/fixtures/`;

// --- launch Edge
const userDataDir = mkdtempSync(path.join(os.tmpdir(), 'id-assist-edge-'));
const args = [
  `--user-data-dir=${userDataDir}`,
  `--load-extension=${dist}`,
  `--disable-extensions-except=${dist}`,
  '--remote-debugging-port=0',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-sync',
  '--disable-background-networking',
  '--disable-component-update',
  '--window-size=1000,800',
  ...(headful ? [] : ['--headless=new', '--disable-gpu']),
  'about:blank',
];
const proc = spawn(edge, args, { stdio: 'ignore' });
const cleanup = () => {
  try {
    proc.kill();
  } catch {}
  server.close();
  setTimeout(() => {
    try {
      rmSync(userDataDir, { recursive: true, force: true });
    } catch {}
  }, 500);
};
process.on('exit', cleanup);

// Wait for DevToolsActivePort
const portFile = path.join(userDataDir, 'DevToolsActivePort');
let port = null;
for (let i = 0; i < 100 && !port; i++) {
  await sleep(100);
  if (existsSync(portFile)) port = Number(readFileSync(portFile, 'utf8').split('\n')[0]);
}
if (!port) fail('Edge did not expose a DevTools port');

const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
console.log(`Edge ${version.Browser}`);
const ws = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((r, j) => {
  ws.onopen = r;
  ws.onerror = j;
});

let nextId = 1;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
  }
};
function cdp(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
}

// Is the extension loaded? Look for OUR service worker. Edge ships internal
// extensions with service workers of their own, so match on the script name.
let extensionId = null;
let swTargetId = null;
for (let i = 0; i < 30 && !extensionId; i++) {
  const { targetInfos } = await cdp('Target.getTargets');
  const ext = targetInfos.find((t) => t.type === 'service_worker' && /^(chrome-)?extension:\/\/[a-z]+\/background\.js$/.test(t.url));
  if (ext) {
    extensionId = new URL(ext.url).host;
    swTargetId = ext.targetId;
  } else await sleep(200);
}
if (!extensionId) {
  fail('Extension service worker not found: Edge did not load the unpacked extension via --load-extension. Load it manually from edge://extensions.');
}
console.log(`Extension loaded: ${extensionId}`);

let failures = 0;
let screenshotDone = false;
for (const c of CASES) {
  const { targetId } = await cdp('Target.createTarget', { url: base + c.page });
  const { sessionId } = await cdp('Target.attachToTarget', { targetId, flatten: true });
  await cdp('Runtime.enable', {}, sessionId);
  await cdp('Page.enable', {}, sessionId);
  await sleep(1500); // document_idle + first scan
  const expr = `(() => {
    const h = document.querySelector('id-assist-indicator');
    if (!h) return { present: false };
    const r = h.shadowRoot;
    return {
      present: true,
      hidden: h.hidden,
      prompt: !r.querySelector('[role=dialog]').hidden,
      detail: r.getElementById('ia-consent-detail').textContent,
      state: r.querySelector('.pill').dataset.state,
      // Text-like controls only: checkboxes, radios, ranges and selects have non-empty default values.
      values: [...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]):not([type=color]),textarea')]
        .map((e) => e.value).filter(Boolean).length,
    };
  })()`;
  const { result } = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true }, sessionId);
  const v = result.value;
  const promptShown = !!(v.present && !v.hidden && v.prompt);
  let ok = promptShown === c.prompt && (v.values ?? 0) === 0;
  if (ok && c.title && !(v.detail ?? '').includes(`"${c.title}"`)) ok = false;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.page.padEnd(22)} prompt=${promptShown} expected=${c.prompt}${v.detail ? `  (${v.detail.split('.')[0]})` : ''}`);
  if (!ok) failures++;
  if (promptShown && !screenshotDone) {
    const shot = await cdp('Page.captureScreenshot', { format: 'png' }, sessionId);
    const out = path.join(os.tmpdir(), 'id-assist-edge-smoke.png');
    writeFileSync(out, Buffer.from(shot.data, 'base64'));
    console.log(`Screenshot: ${out}`);
    screenshotDone = true;
  }
  await cdp('Target.closeTarget', { targetId });
}

// Manual re-activation: decline on a page, then trigger the same message the
// keyboard shortcut and toolbar button produce, from inside the real service worker.
{
  const sw = { targetId: swTargetId };
  const { targetId } = await cdp('Target.createTarget', { url: base + 'contact.html' });
  const { sessionId } = await cdp('Target.attachToTarget', { targetId, flatten: true });
  await cdp('Runtime.enable', {}, sessionId);
  await sleep(1500);
  const decline = `(() => { const r = document.querySelector('id-assist-indicator').shadowRoot;
    [...r.querySelectorAll('button')].find((b) => b.textContent === 'No thanks').click();
    return { launcherVisible: !r.querySelector('.launcher').hidden, pillHidden: r.querySelector('.pill').hidden }; })()`;
  const afterDecline = (await cdp('Runtime.evaluate', { expression: decline, returnByValue: true }, sessionId)).result.value;
  let reactivated = { promptBack: false, via: 'none' };
  if (sw.targetId) {
    const { sessionId: swSession } = await cdp('Target.attachToTarget', { targetId: sw.targetId, flatten: true });
    await cdp('Runtime.enable', {}, swSession);
    // No "tabs" permission, so URLs are not visible to query(); send to every tab (only the fixture has a content script).
    const send = `(async () => { const tabs = await chrome.tabs.query({}); const out = [];
      for (const t of tabs) { try { await chrome.tabs.sendMessage(t.id, { type: 'command:activate' }); out.push(t.id + ':ok'); }
        catch (e) { out.push(t.id + ':' + (e && e.message)); } }
      return out.join(' | '); })()`;
    const sent = (await cdp('Runtime.evaluate', { expression: send, awaitPromise: true, returnByValue: true }, swSession)).result.value;
    await sleep(300);
    const check = `(() => { const r = document.querySelector('id-assist-indicator').shadowRoot;
      return { promptBack: !r.querySelector('[role=dialog]').hidden, focused: r.activeElement && r.activeElement.textContent }; })()`;
    const v = (await cdp('Runtime.evaluate', { expression: check, returnByValue: true }, sessionId)).result.value;
    reactivated = { ...v, via: `service worker (${sent})` };
  }
  const ok = afterDecline.launcherVisible && afterDecline.pillHidden && reactivated.promptBack;
  console.log(`${ok ? 'PASS' : 'FAIL'}  decline -> launcher dot: ${afterDecline.launcherVisible}; re-activate via ${reactivated.via}: prompt back=${reactivated.promptBack}, focus="${reactivated.focused ?? ''}"`);
  if (!ok) failures++;
  await cdp('Target.closeTarget', { targetId });
}

ws.close();
cleanup();
console.log(failures ? `${failures} case(s) failed` : 'All cases passed in real Edge');
process.exit(failures ? 1 : 0);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function fail(msg) {
  console.error(msg);
  cleanup();
  process.exit(1);
}
