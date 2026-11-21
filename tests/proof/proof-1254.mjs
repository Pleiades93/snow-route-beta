// proof-1254.mjs - Beta 1.254 (fix_id: audit-r5-batch).
// THE SMALL-DEFECTS BATCH (cross-audit fix programme, round 5):
// eleven adjudicated items, one pin each, plus the R-05 schema sweep.
// O-01 LEGACY_KEYS 'pre' / N-02 DP.stored on success only / O-02
// null-prototype ROADS+REFERENCE / O-04 wake-lock one in-flight
// request / O-06 pack controller owned by the load / O-07 updnav
// stripped at boot / O-08 CSP script-src narrowed / O-09 snow away
// skip + speck cap / A-02 restore without the per-cell merge / #10
// one tile enumerator / R-05 every LS_GLOBAL value documented.
// On the Beta 1.253 tree every mechanism check fails. Behaviour is
// graded by the existing battery (drive149 + selftest-nv1152 for the
// fingerprint, drives 172/188 for the legacy fallback, drive116 for
// the policy) and by drive209 (the __proto__ street, the updnav
// strip) in the real app.
// Run from the repo root:  node tests/proof/proof-1254.mjs
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const app1 = read('parts/app1.js');
const app3 = read('parts/app3.js');
const app4 = read('parts/app4.js');
const snow = read('parts/brand-snow.js');
const citydata = read('parts/create-citydata.js');
const cache = read('parts/create-cache.js');
const csp = read('scripts/csp_stamp.py');
const schema = read('docs/STORAGE-SCHEMA.md');
const whatsnew = read('parts/whatsnew.js');
const changelog = read('CHANGELOG.md');

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };
const slice = (src, from, to) => { const a = src.indexOf(from); const b = a < 0 ? -1 : src.indexOf(to, a); return a < 0 || b < 0 ? '' : src.slice(a, b); };

// ---------- O-01: the fallback boot has a 'pre' key ----------
const legacy = slice(app1, 'const LEGACY_KEYS', '};');
check('1 (O-01): LEGACY_KEYS names the live preload slot for pre',
  legacy.includes("pre: 'snowroute.5w.v5.preload'"));

// ---------- N-02: the stored tier advances only on success ----------
const dpw = slice(app1, 'function dpWriteStore', '\n}');
check('2 (N-02): DP.stored is set inside the lsSet success branch, never before it',
  dpw.includes('if (lsSet(LS_GLOBAL.dp, JSON.stringify({ t, at: Date.now() }))) DP.stored = t;')
  && !dpw.includes('DP.stored = t; try {'));

// ---------- O-02: null-prototype live maps ----------
check('3 (O-02): every street-name-keyed container on the load path is null-prototype (ROADS/REFERENCE, STRETCH + the stretch builder\'s maps, SAMPLES + the sampler\'s out)',
  app1.includes('const ROADS = Object.create(null);')
  && app1.includes('const REFERENCE = Object.create(null);')
  && app1.includes('const STRETCH = Object.create(null);')
  && app1.includes('const out = Object.create(null);')
  && app1.includes('const runsOf = Object.create(null), totals = Object.create(null);')
  && app3.includes('const SAMPLES = Object.create(null);')
  && app3.includes('const out = Object.create(null);'));

// ---------- O-04: one in-flight wake-lock request ----------
check('4 (O-04): syncWake shares one pending request and awaits it',
  app3.includes('let wakeLock = null, wakePending = null;')
  && app3.includes('if (!wakePending) {')
  && app3.includes('await wakePending;'));

// ---------- O-06: the pack controller belongs to the load ----------
check('5 (O-06): attempts register their controller, the stall drop aborts it',
  citydata.includes('function crPackAbort(slug)')
  && citydata.includes('crPackCtls[slug] = ctl')
  && cache.includes('crPackAbort(g.fromPack)'));

// ---------- O-07: the updnav marker is stripped at boot ----------
check('6 (O-07): app4 strips an updnav query via window.history.replaceState (the bare name is the app\'s own history array - the strip would throw)',
  app4.includes("window.history.replaceState(null, '', location.pathname)")
  && !app4.includes(' history.replaceState')
  && app4.includes('/(^|[?&])updnav=/'));

// ---------- O-08: script-src names the one library file ----------
check('7 (O-08): the CSP template narrows script-src to the MapLibre file',
  csp.includes("script-src 'sha384-{script}' https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.js; ")
  && !csp.includes("script-src 'sha384-{script}' https://cdn.jsdelivr.net; "));

// ---------- O-09: snow rests while hidden, specks capped ----------
check('8 (O-09): the snow loop skips away frames and the speck count is capped',
  snow.includes("cvS.classList.contains('away')")
  && snow.includes('Math.min(1000, Math.round(area / SPECK.per))'));

// ---------- A-02: the restore fold does not merge per cell ----------
check('9 (A-02): no per-cell crCovMerge in the restore; one rebuild + one refresh after the loop',
  !cache.includes('crCovMerge([], null)')
  && cache.includes('crCovEnsure(); // ensure the cov exists before the direct fold below')
  && cache.includes('crCov.byName = fresh.byName; crRefreshSearch();'));

// ---------- #10: one ordered tile enumerator ----------
const ptu = slice(app4, 'function packTileUrls', '\n}');
const pul = slice(app4, 'function preloadUrlList', '\n}');
check('10 (#10): packTileEnum exists and both views consume it; the enumeration body exists once',
  app4.includes('function packTileEnum(src, pk, budget)')
  && ptu.includes('packTileEnum(src, pk, budget)')
  && pul.includes('packTileEnum(src, pk, budgets.get(pk)')
  && (app4.match(/for \(let z = 8; z <= maxz; z\+\+\)/g) || []).length === 1
  && (app4.match(/rb\.w - 0\.005/g) || []).length === 1);

// ---------- R-05: every LS_GLOBAL value is documented ----------
const lsg = slice(app1, 'const LS_GLOBAL', '};');
const values = [...lsg.matchAll(/'((?:snowroute)[^']+)'/g)].map(m => m[1]);
check('11 (R-05): LS_GLOBAL parsed (' + values.length + ' values) and every value appears in STORAGE-SCHEMA.md',
  values.length >= 7 && values.every(v => schema.includes(v)));
check('12 (R-05): the dp entry documents its shape and terms',
  schema.includes('`snowroute.v1.dp`') && schema.includes('`{t, at}`') && schema.includes('reads as tier 0'));

// ---------- the release editorial ----------
check('13: the CHANGELOG top entry is Beta 1.254', changelog.includes('## Beta 1.254'));
check('14: What\'s New carries the 1.254 bullet, short and dash-free',
  whatsnew.includes('Street names are back to the app\'s original labels.')
  && 'Street names are back to the app\'s original labels.'.length <= 108
  && !whatsnew.includes('—'));

console.log(`proof-1254: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
