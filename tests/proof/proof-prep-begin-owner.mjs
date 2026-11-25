// proof-prep-begin-owner.mjs - Section 1 step 4 (Architecture #16, Beta 1.281).
// THE PREPARATION-ENTRY BUNDLE HAS ONE OWNER. Through Beta 1.280 every
// preparation entry spelled out the same begin by hand -
//   crSetPrepState('preparing'); crPrepFail = null; crFailFromGrid = false; crWanted = null;
// at crCityPrepare and crGridResume (parts/create-cache.js) and at crStartPrep
// (parts/create-citydata.js) - three copies of one ritual, free to drift (the
// Beta 1.154 latch was exactly such a drift: crFailFromGrid cleared at two
// entries and survived a city change at the third). Now crPrepBegin
// (parts/create-fetch.js, beside the prep state record it drives) owns the
// bundle and the three entries call it. What stayed at the sites, by design:
// the coverage-generation bump (each site spends the token differently) and
// crStartPrep's anchor assignment. The mutation battery for this round found
// the bundle's crFailFromGrid clear already pinned by drive208, but its
// crWanted clear observed by NO drive (181 and 208 both stay green with it
// dropped) - checks 5-6 pin that effect here, at the owner, so the bundle's
// four effects are all graded somewhere that still runs.
// Run from the repo root:  node tests/proof/proof-prep-begin-owner.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const fetchJs = read('parts/create-fetch.js');
const cacheJs = read('parts/create-cache.js');
const citydataJs = read('parts/create-citydata.js');
const allParts = ['parts/create-cache.js', 'parts/create-citydata.js', 'parts/create-fetch.js', 'parts/create-pick.js']
  .map(read).join('\n');

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };

// ---------- extraction helpers (string/comment-aware brace matching) ----------
function extractFn(src, header) {
  const at = src.indexOf(header);
  if (at < 0) return '';
  let i = src.indexOf('{', at), depth = 0, str = null, esc = false, line = false, block = false;
  for (; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (line) { if (c === '\n') line = false; continue; }
    if (block) { if (c === '*' && n === '/') { block = false; i++; } continue; }
    if (str) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === str) str = null; continue; }
    if (c === '/' && n === '/') { line = true; i++; continue; }
    if (c === '/' && n === '*') { block = true; i++; continue; }
    if (c === "'" || c === '"' || c === '`') { str = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(at, i + 1); }
  }
  return '';
}
const line = (src, prefix) => (src.split('\n').find((l) => l.startsWith(prefix)) || '');

// ---------- 1-3: the owner exists, holds the bundle once, and every door calls it ----------
const beginFn = extractFn(fetchJs, 'function crPrepBegin()');
check('1: crPrepBegin exists in create-fetch.js, beside the prep state record',
  !!beginFn && fetchJs.includes('function crSetPrepState(') && fetchJs.indexOf('function crPrepBegin()') > fetchJs.indexOf('function crSetPrepState('));
const BUNDLE = "crSetPrepState('preparing'); crPrepFail = null; crFailFromGrid = false; crWanted = null;";
check('2: the begin body is exactly the historical bundle (setter + the three clears)',
  beginFn.includes(BUNDLE));
check('3: the bundle text survives exactly once across the create parts - inside the owner, at no entry site',
  allParts.split(BUNDLE).length - 1 === 1);
check('4a: crCityPrepare calls the owner', extractFn(cacheJs, 'function crCityPrepare()').includes('crPrepBegin();'));
check('4b: crGridResume calls the owner', extractFn(cacheJs, 'function crGridResume()').includes('crPrepBegin();'));
check('4c: crStartPrep calls the owner and keeps its own anchor assignment',
  extractFn(citydataJs, 'function crStartPrep(anchor)').includes('crPrepBegin(); crPrepAnchor = anchor;'));

// ---------- 5-6: the owner's four effects, run for real ----------
const prelude = [
  line(fetchJs, 'let crWanted = null;'),
  line(fetchJs, "let crPrepState = 'none';"),
  line(fetchJs, 'const CR_PREP_EDGES ='),
  line(fetchJs, 'const crPrepViolations = [];'),
  extractFn(fetchJs, 'function crSetPrepState(next)'),
  line(fetchJs, 'let crPrepFail = null;'),
  line(fetchJs, 'let crFailFromGrid = false;'),
  beginFn,
].join('\n');
check('5a: the prelude extracted whole (record, setter, owner)', prelude.includes('crPrepBegin') && prelude.includes('CR_PREP_EDGES'));
function runScenario(seed) {
  const script = prelude + '\n' + seed + '\ncrPrepBegin();\n' +
    '({ state: crPrepState, fail: crPrepFail, ffg: crFailFromGrid, wanted: crWanted, viol: crPrepViolations.length });';
  return vm.runInNewContext(script, {});
}
const dirty = runScenario("crPrepState = 'failed'; crPrepFail = { ok: false, kind: 'dense' }; crFailFromGrid = true; crWanted = { anchor: { lat: 1, lng: 2 }, label: 'Prepare this area' };");
check('5b: from a failed grid preparation, the begin moves the record to preparing',
  dirty.state === 'preparing');
check('5c: the begin clears the previous failure and its grid provenance',
  dirty.fail === null && dirty.ffg === false);
check('5d: the begin answers the outstanding offer (crWanted cleared) - the effect no drive observes',
  dirty.wanted === null);
check('5e: a legal begin records no violation', dirty.viol === 0);
const fromReady = runScenario("crPrepState = 'ready'; crWanted = { anchor: { lat: 3, lng: 4 }, label: 'Prepare wider area' };");
check('6a: from ready with an offer outstanding, the begin still lands all four effects',
  fromReady.state === 'preparing' && fromReady.fail === null && fromReady.ffg === false && fromReady.wanted === null && fromReady.viol === 0);
const refused = vm.runInNewContext(prelude + "\n({ ok: crSetPrepState('ready'), viol: crPrepViolations.length, state: crPrepState });", {});
check('6b: the record underneath was not weakened - an illegal edge from none is still refused and recorded',
  refused.ok === false && refused.viol === 1 && refused.state === 'none');

console.log(`proof-prep-begin-owner: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
