/**
 * smoke.mjs — run the headless integration test (src/smoke.ts) under Node.
 *
 *   npm run smoke
 *
 * Loads every real asset, builds the real systems, drives the full mission
 * loop and reports pass/fail. Exits non-zero on any failure.
 */
import './capture-dom.mjs';
import { loadAssets } from './capture-assets.mjs';

const assets = await loadAssets();
const { runSmoke } = await import('../.capture/captureEntry.mjs');
const res = await runSmoke(assets);

for (const n of res.notes) console.log(`  · ${n}`);
console.log('');
for (const f of res.failures) console.log(`  ✗ ${f}`);
console.log(`\n${res.passed} passed, ${res.failed} failed`);
process.exit(res.failed === 0 ? 0 : 1);
