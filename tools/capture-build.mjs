// Build src/captureEntry.ts (and its whole dependency graph) into a Node-loadable
// bundle so the headless QA harness runs the REAL game code.
import { build } from 'vite';

await build({
  configFile: false,
  logLevel: 'warn',
  build: {
    ssr: true,
    outDir: '.capture',
    emptyOutDir: true,
    target: 'node20',
    rollupOptions: {
      input: 'src/captureEntry.ts',
      external: ['three', /^three\//],
      output: { format: 'esm', entryFileNames: 'captureEntry.mjs' },
    },
  },
});
console.log('[capture] bundle ready → .capture/captureEntry.mjs');
