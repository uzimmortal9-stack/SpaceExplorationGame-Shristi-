#!/usr/bin/env node
/**
 * fetch-assets.mjs — download + convert every asset declared in tools/assets.json.
 *
 *   npm run assets
 *
 * All model geometry comes from the CC0 Quaternius mirror and is shipped as
 * ASCII USD; this script downloads it, invokes tools/usda_to_glb.py to produce
 * real .glb files (correct pivots, embedded PBR textures), copies the HDRIs and
 * PBR texture sets, and finally writes public/assets/manifest.json which the
 * runtime asset loader reads.
 *
 * The script is incremental: anything already present and non-empty is skipped,
 * so re-runs are cheap. If a download fails the entry is recorded as MISSING in
 * the manifest and listed in ASSET_DOWNLOAD_MANIFEST.md, and the game falls back
 * to its procedural stand-in for that one asset only.
 */

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Some corporate / sandbox networks terminate TLS with a private CA that is
// installed in the OS trust store but not in Node's bundled one. Adopt the
// system bundle when it exists so `fetch` behaves like `curl` does.
if (!process.env.NODE_EXTRA_CA_CERTS) {
  for (const ca of [
    '/etc/ssl/certs/ca-certificates.crt',
    '/etc/pki/tls/certs/ca-bundle.crt',
    '/etc/ssl/cert.pem',
  ]) {
    try {
      const { existsSync } = await import('node:fs');
      if (existsSync(ca)) {
        const { execFileSync } = await import('node:child_process');
        // NODE_EXTRA_CA_CERTS is only read at startup, so re-exec once with it set.
        if (!process.env.__ASSET_CA_REEXEC) {
          execFileSync(process.execPath, [fileURLToPath(import.meta.url)], {
            stdio: 'inherit',
            env: { ...process.env, NODE_EXTRA_CA_CERTS: ca, __ASSET_CA_REEXEC: '1' },
          });
          process.exit(0);
        }
        break;
      }
    } catch (err) {
      if (err && err.status) process.exit(err.status);
      break;
    }
  }
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'assets');
const CACHE = path.join(ROOT, '.assetcache');
const SPEC = JSON.parse(await fs.readFile(path.join(ROOT, 'tools', 'assets.json'), 'utf8'));

const CONCURRENCY = 3;
const failures = [];

const log = (...a) => console.log('[assets]', ...a);

async function exists(p) {
  try {
    const st = await fs.stat(p);
    return st.size > 0;
  } catch {
    return false;
  }
}

function rawUrl(srcKey, relPath) {
  const s = SPEC.sources[srcKey];
  const encoded = relPath.split('/').map(encodeURIComponent).join('/');
  return `https://api.github.com/repos/${s.repo}/contents/${s.root}/${encoded}?ref=${s.ref}`;
}

async function download(url, dest, { attempts = 6 } = {}) {
  if (await exists(dest)) return true;
  await fs.mkdir(path.dirname(dest), { recursive: true });
  for (let i = 0; i < attempts; i++) {
    try {
      const headers = { Accept: 'application/vnd.github.raw', 'User-Agent': 'aurora-drift-assets' };
      if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
      const res = await fetch(url, { headers, redirect: 'follow' });
      // 401/403/429 from the unauthenticated API are rate limiting, not a
      // permanent failure — wait for the documented reset and try again.
      if (res.status === 401 || res.status === 403 || res.status === 429) {
        const reset = Number(res.headers.get('x-ratelimit-reset') || 0) * 1000;
        const waitMs = reset > Date.now() ? Math.min(reset - Date.now() + 1500, 75_000) : 4000 * (i + 1);
        if (i === 0) log(`rate limited — waiting ${Math.round(waitMs / 1000)}s`);
        await new Promise((r) => setTimeout(r, waitMs));
        throw new Error(`HTTP ${res.status} (rate limited)`);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0) throw new Error('empty body');
      await fs.writeFile(dest, buf);
      return true;
    } catch (err) {
      if (i === attempts - 1) {
        failures.push({ url, dest: path.relative(ROOT, dest), error: String(err.message || err) });
        return false;
      }
      await new Promise((r) => setTimeout(r, 700 * (i + 1)));
    }
  }
  return false;
}

async function pool(items, fn) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      await fn(items[i], i);
    }
  });
  await Promise.all(workers);
}

function python(args) {
  return new Promise((resolve) => {
    const proc = spawn('python3', args, { cwd: ROOT });
    let out = '';
    let err = '';
    proc.stdout.on('data', (d) => (out += d));
    proc.stderr.on('data', (d) => (err += d));
    proc.on('close', (code) => resolve({ code, out, err }));
    proc.on('error', (e) => resolve({ code: 1, out: '', err: String(e) }));
  });
}

// -------------------------------------------------------------------------
// 1. shared texture atlases used by the Quaternius kits
// -------------------------------------------------------------------------
log('downloading kit textures…');
const KIT_TEX_DIR = path.join(OUT, 'kit');
await fs.mkdir(KIT_TEX_DIR, { recursive: true });
await pool(SPEC.textures, async (t) => {
  const dest = path.join(CACHE, t.src, t.path);
  await download(rawUrl(t.src, t.path), dest);
});

// The Quaternius atlases are 2K-4K PNGs (up to 12 MB each) and dozens of models
// share the same few files. Publish ONE downscaled copy of each into
// public/assets/kit/ and have every .glb reference it by URI, so the payload is
// a couple of MB instead of ~145 MB of duplicated pixels.
const publishedTextures = new Set();
for (const t of SPEC.textures) {
  const srcFile = path.join(CACHE, t.src, t.path);
  const name = path.basename(t.path);
  if (publishedTextures.has(name)) continue;
  const destFile = path.join(KIT_TEX_DIR, name);
  if (!(await exists(srcFile))) continue;
  if (!(await exists(destFile))) {
    const res = await python(['tools/resize_texture.py', srcFile, destFile, '--max', '1024']);
    if (res.code !== 0) await fs.copyFile(srcFile, destFile);
  }
  publishedTextures.add(name);
}
log(`published ${publishedTextures.size} shared kit textures`);

// -------------------------------------------------------------------------
// 2. HDRI environments
// -------------------------------------------------------------------------
log('downloading HDRI environments…');
const environment = [];
await pool(SPEC.environment, async (e) => {
  const dest = path.join(OUT, e.out);
  const ok = await download(rawUrl(e.src, e.path), dest);
  environment.push({
    id: path.basename(e.out, path.extname(e.out)),
    url: `assets/${e.out}`,
    available: ok,
    credit: e.credit,
    use: e.use,
    source: rawUrl(e.src, e.path),
  });
});

// -------------------------------------------------------------------------
// 3. PBR surface sets
// -------------------------------------------------------------------------
log('downloading PBR surface sets…');
const surfaces = [];
await pool(SPEC.surfaces, async (s) => {
  const maps = {};
  let ok = true;
  for (const [slot, rel] of Object.entries(s.files)) {
    const ext = path.extname(rel);
    const out = `${s.out}_${slot}${ext}`;
    const got = await download(rawUrl(s.src, rel), path.join(OUT, out));
    if (got) maps[slot] = `assets/${out}`;
    else ok = false;
  }
  surfaces.push({
    id: path.basename(s.out),
    maps,
    available: ok && Object.keys(maps).length > 0,
    credit: s.credit,
    use: s.use,
  });
});

// -------------------------------------------------------------------------
// 4. models: download USD, convert to GLB
// -------------------------------------------------------------------------
log(`downloading + converting ${SPEC.models.length} models…`);
const models = [];
let converted = 0;
await pool(SPEC.models, async (m) => {
  const usd = path.join(CACHE, m.src, m.path);
  const glb = path.join(OUT, 'models', `${m.id}.glb`);
  const entry = {
    id: m.id,
    url: `assets/models/${m.id}.glb`,
    pivot: m.pivot ?? 'bottom',
    source: rawUrl(m.src, m.path),
    license: SPEC.sources[m.src].license,
    author: SPEC.sources[m.src].author,
    pack: m.path.split('/')[0],
    available: false,
  };

  if (!(await exists(glb))) {
    const got = await download(rawUrl(m.src, m.path), usd);
    if (!got) {
      models.push(entry);
      return;
    }
    // the kit's textures live in <pack>/textures next to the model
    const texDir = path.join(CACHE, m.src, m.path.split('/')[0], 'textures');
    const res = await python([
      'tools/usda_to_glb.py',
      usd,
      glb,
      '--pivot',
      entry.pivot,
      '--textures',
      texDir,
      '--texture-uri-base',
      '../kit',
      '--name',
      m.id,
    ]);
    if (res.code !== 0) {
      failures.push({ url: entry.source, dest: `public/assets/models/${m.id}.glb`, error: res.err.trim().split('\n').pop() });
      models.push(entry);
      return;
    }
    try {
      Object.assign(entry, JSON.parse(res.out.trim()));
      delete entry.file;
    } catch { /* keep defaults */ }
  }

  if (await exists(glb)) {
    const buf = await fs.readFile(glb);
    entry.available = true;
    entry.bytes = buf.length;
    entry.hash = createHash('sha1').update(buf).digest('hex').slice(0, 12);
    converted++;
  }
  models.push(entry);
});

models.sort((a, b) => a.id.localeCompare(b.id));
environment.sort((a, b) => a.id.localeCompare(b.id));
surfaces.sort((a, b) => a.id.localeCompare(b.id));

const manifest = {
  generated: new Date().toISOString(),
  generator: 'tools/fetch-assets.mjs',
  sources: SPEC.sources,
  counts: {
    models: models.length,
    modelsAvailable: models.filter((m) => m.available).length,
    environment: environment.filter((e) => e.available).length,
    surfaces: surfaces.filter((s) => s.available).length,
  },
  environment,
  surfaces,
  models,
};

await fs.mkdir(OUT, { recursive: true });
await fs.writeFile(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));

log(`models converted/present: ${manifest.counts.modelsAvailable}/${models.length}`);
log(`hdri: ${manifest.counts.environment}/${environment.length}  surfaces: ${manifest.counts.surfaces}/${surfaces.length}`);

// -------------------------------------------------------------------------
// 5. report anything that could not be fetched
// -------------------------------------------------------------------------
const missingModels = models.filter((m) => !m.available);
const missingEnv = environment.filter((e) => !e.available);
const missingSurf = surfaces.filter((s) => !s.available);
const anyMissing = missingModels.length + missingEnv.length + missingSurf.length;

if (anyMissing === 0) {
  log('all assets present ✔');
  await fs.rm(path.join(ROOT, 'ASSET_DOWNLOAD_MANIFEST.md'), { force: true });
} else {
  log(`${anyMissing} asset(s) unavailable — writing ASSET_DOWNLOAD_MANIFEST.md`);
  const rows = [];
  for (const m of missingModels) {
    rows.push(`| \`${m.id}\` | model (.glb) | ${m.pack} | ${m.license} | \`public/assets/models/${m.id}.glb\` | ${m.source} |`);
  }
  for (const e of missingEnv) {
    rows.push(`| \`${e.id}\` | HDRI (.hdr) | ${e.credit} | CC0 | \`public/${e.url}\` | ${e.source} |`);
  }
  for (const s of missingSurf) {
    rows.push(`| \`${s.id}\` | PBR set | ${s.credit} | CC0 | \`public/assets/surfaces/\` | see tools/assets.json |`);
  }
  const md = `# Asset Download Manifest

${anyMissing} asset(s) could not be downloaded in this environment (network restriction or
upstream change). **The game still runs** — the asset loader substitutes a clearly
marked procedural stand-in for each missing entry and logs it to the console.

## How to fix (zero code changes)

\`\`\`bash
npm run assets      # re-runs the downloader; picks up whatever is now reachable
\`\`\`

Or place the files manually at the paths below and reload — the loader reads
\`public/assets/manifest.json\` at runtime and swaps the real asset in automatically.

| Asset | Type | Pack / credit | License | Destination | Source URL |
| ----- | ---- | ------------- | ------- | ----------- | ---------- |
${rows.join('\n')}

## Download errors

${failures.slice(0, 40).map((f) => `- \`${f.dest}\` — ${f.error}`).join('\n') || '_none recorded_'}
`;
  await fs.writeFile(path.join(ROOT, 'ASSET_DOWNLOAD_MANIFEST.md'), md);
}
