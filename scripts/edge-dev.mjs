// Opens a real Microsoft Edge window with the built extension loaded and the
// test pages served, for interactive manual testing. Uses a throwaway profile
// so your own Edge profile is untouched. Close the window to stop everything.
//
// Usage: npm run build && node scripts/edge-dev.mjs [--port 8123]
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const portArg = process.argv.indexOf('--port');
const port = portArg > -1 ? Number(process.argv[portArg + 1]) : 8124;

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

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  const file = path.normalize(path.join(root, pathname.endsWith('/') ? pathname + 'index.html' : pathname));
  try {
    if (!file.startsWith(root) || !statSync(file).isFile()) throw new Error();
    res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404).end('Not found');
  }
});
await new Promise((r) => server.listen(port, '127.0.0.1', r));
const url = `http://127.0.0.1:${port}/tests/browser/`;

const userDataDir = mkdtempSync(path.join(os.tmpdir(), 'id-assist-edge-dev-'));
const proc = spawn(
  edge,
  [
    `--user-data-dir=${userDataDir}`,
    `--load-extension=${dist}`,
    `--disable-extensions-except=${dist}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-sync',
    '--window-size=1100,850',
    url,
  ],
  { stdio: 'ignore' },
);
console.log(`[id-assist] Edge opened with the extension loaded. Test pages: ${url}`);
console.log('[id-assist] Close the Edge window to stop the server and delete the temporary profile.');

proc.on('exit', () => {
  server.close();
  setTimeout(() => {
    try {
      rmSync(userDataDir, { recursive: true, force: true });
    } catch {}
    process.exit(0);
  }, 500);
});
