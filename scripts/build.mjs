// Build script for the ID Assist extension.
//
// Why esbuild directly rather than `vite build`:
//   A Manifest V3 content script is injected as a classic (non-module) script,
//   so it must be a single self-contained IIFE bundle with no shared chunks.
//   Vite's library mode only supports one entry point when emitting IIFE
//   output, and its multi-entry app mode emits ES modules with shared chunks.
//   esbuild bundles several entries into independent IIFE files in one call.
//   Vite still powers the test runner (Vitest), so we stay in the same ecosystem.
import { build, context } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const args = new Set(process.argv.slice(2));
const watch = args.has('--watch');
const harness = args.has('--harness');

/** @type {import('esbuild').BuildOptions} */
const common = {
  bundle: true,
  target: ['chrome116'],
  sourcemap: watch ? 'inline' : false,
  minify: false,
  logLevel: 'info',
  legalComments: 'none',
  define: { __DEV__: JSON.stringify(watch) },
};

const extensionBuilds = [
  { entryPoints: { content: 'src/content/index.ts' }, format: 'iife' },
  { entryPoints: { options: 'src/options/options.ts' }, format: 'iife' },
  { entryPoints: { background: 'src/background/service-worker.ts' }, format: 'esm' },
].map((b) => ({ ...common, ...b, outdir: dist, absWorkingDir: root }));

const harnessBuild = {
  ...common,
  entryPoints: { shim: 'tests/browser/harness/shim.ts' },
  format: 'iife',
  outdir: path.join(root, 'tests/browser/dist'),
  absWorkingDir: root,
};

async function copyStatic() {
  await mkdir(dist, { recursive: true });
  const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  manifest.version = pkg.version; // package.json is the single source of truth for the version
  await writeFile(path.join(dist, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await cp(path.join(root, 'public'), dist, { recursive: true });
  await cp(path.join(root, 'src/options/options.html'), path.join(dist, 'options.html'));
}

async function main() {
  await rm(dist, { recursive: true, force: true });
  await copyStatic();
  const builds = harness ? [...extensionBuilds, harnessBuild] : extensionBuilds;
  if (watch) {
    const contexts = await Promise.all(builds.map((b) => context(b)));
    await Promise.all(contexts.map((c) => c.watch()));
    console.log('[id-assist] watching. Reload the extension in edge://extensions after each rebuild.');
  } else {
    await Promise.all(builds.map((b) => build(b)));
    console.log(`[id-assist] built to ${path.relative(root, dist)}${harness ? ' (+ tests/browser/dist)' : ''}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
