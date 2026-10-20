// Writes (or completes) latest.json, the updater manifest, for one platform.
//
//   node scripts/updater-manifest.js --platform linux-x86_64 --file <bundle> --out <latest.json>
//        [--notes <text>] [--merge <other latest.json>]...
//
// <bundle> is the signed installer (`.exe`, `.AppImage`); its `.sig` file must sit next to it.
// The download URL points at the asset of this version's GitHub release. When --out already holds
// the same version, its other platforms are kept; --merge adds the platforms of manifests built on
// another machine (Windows and Linux builds cannot run on the same one).
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    platform: { type: 'string' },
    file: { type: 'string' },
    out: { type: 'string' },
    notes: { type: 'string', default: '' },
    merge: { type: 'string', multiple: true, default: [] },
  },
});

/** @param {string} path @returns {any} */
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

if (!values.platform || !values.file || !values.out) {
  throw new Error('Usage : --platform <cible> --file <installateur> --out <latest.json> [--notes <texte>] [--merge <latest.json>]');
}

const conf = readJson('src-tauri/tauri.conf.json');
const { version } = conf;
const endpoint = conf.plugins.updater.endpoints[0];
const releaseBase = endpoint.replace(/\/releases\/latest\/download\/[^/]+$/, `/releases/download/v${version}`);
if (releaseBase === endpoint) throw new Error(`Endpoint de l'updater inattendu : ${endpoint}`);

/** @type {Record<string, { signature: string, url: string }>} */
const platforms = {};

/** @param {string} path */
const keepPlatforms = (path) => {
  const manifest = readJson(path);
  if (manifest.version === version) Object.assign(platforms, manifest.platforms);
};

try {
  keepPlatforms(values.out);
} catch (err) {
  if (/** @type {NodeJS.ErrnoException} */ (err).code !== 'ENOENT') throw err;
}
for (const path of values.merge) keepPlatforms(path);

platforms[values.platform] = {
  signature: readFileSync(`${values.file}.sig`, 'utf8').trim(),
  url: `${releaseBase}/${basename(values.file)}`,
};

const manifest = {
  version,
  notes: values.notes,
  pub_date: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  platforms: Object.fromEntries(Object.entries(platforms).sort(([a], [b]) => a.localeCompare(b))),
};
writeFileSync(values.out, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`latest.json généré : ${values.out} (${Object.keys(manifest.platforms).join(', ')})`);
