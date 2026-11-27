// proof-1264.mjs - Beta 1.264 (fix_id: createfeatherleak-1264).
// THE CREATE-MODE FEATHER LEAK (Andrew's report, 2026-11-21, with his
// screenshot): in the create-route flow the loaded Route 5W's feathered
// road-end tips showed as small dark/gold ticks at the map edges while
// the route's coloured paint was correctly gone. Diagnosis
// (create-mode-feather-leak-2026-11-21/RECORD.md, CONFIRMED): the create
// backdrop (crSetBackdrop, parts/create-pick.js) hides exactly the layer
// ids in CR_ROUTE_LAYERS, and Beta 1.259's nine feather layers - added
// to engine.js's addStack - never joined that list, so they rendered
// for the whole creation session (14 features at Andrew's framing).
// The fix adds the nine ids. This proof is the standing guard against
// the drift class (the third time a hand-kept list mirrored the stack
// and silently fell behind): it DERIVES the route-stack layer ids from
// addStack itself - the add(line('...')) and add({ id: '...' }) calls
// plus the streetnamespt tier loop - and asserts the derived set and
// CR_ROUTE_LAYERS agree exactly, in both directions:
//   stack ⊆ list   (a new stack layer the backdrop does not hide LEAKS)
//   list ⊆ stack   (a retired layer's stale entry rots the list)
// A stack layer that must legitimately stay visible in create mode
// would be named in EXCLUSIONS below with its reason - none exists
// today: the backdrop's design (Beta 1.120) hides the loaded route's
// whole stack and shows the create POIs instead.
// The rendered behaviour is graded by drive217. Fail-first baseline:
// on the Beta 1.263 tree checks 2 and 3 fail (the nine feather ids are
// derived from addStack and absent from CR_ROUTE_LAYERS).
// Beta 1.282 (architecture #13) re-shape, claim unchanged: the hide list
// and the stack must still agree exactly in both directions - but the
// list is no longer a literal in create-pick.js; it IS the engine's
// LAYERS catalogue (CR_ROUTE_LAYERS = GLP.layers.stack). This proof now
// evaluates the catalogue out of engine.js, grades it against the
// addStack derivation, and pins create-pick's seat on the catalogue
// (check 5). The drift class this guards is the same one, one level up:
// a stack layer missing from the catalogue leaks exactly as before.

// Phase 6: the owner builds the tiers from the catalogue's ids, passed through the unify hook (check 1 pins it).
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const engine = read('parts/engine.js');
const app2 = read('parts/app2.js');
const createPick = read('parts/create-pick.js');
const whatsnew = read('parts/whatsnew.js');
const changelog = read('CHANGELOG.md');

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };

// ---------- derive the route stack from addStack ----------
const stackStart = engine.indexOf('function addStack(');
const stackEnd = engine.indexOf('\n}\n', stackStart);
const stackBody = stackStart > -1 && stackEnd > stackStart ? engine.slice(stackStart, stackEnd) : '';
const stack = new Set();
for (const m of stackBody.matchAll(/add\(line\('([^']+)'/g)) stack.add(m[1]);
for (const m of stackBody.matchAll(/add\(\{ id: '([^']+)'/g)) stack.add(m[1]);
// Phase 6: the tiers come from the catalogue's titles, via the hook in addStack (check 1).
const hookTitles = stackBody.includes('ids: LAYERS.titles');

// ---------- read the hide list: the engine catalogue's stack (Beta 1.282) ----------
const catStart = engine.indexOf('const LAYERS = {');
const catEndMark = 'LAYERS.stack = [...LAYERS.paint, ...LAYERS.poi, ...LAYERS.titles, ...LAYERS.glow];';
const catEnd = catStart > -1 ? engine.indexOf(catEndMark, catStart) : -1;
const catSrc = catStart > -1 && catEnd > catStart ? engine.slice(catStart, catEnd + catEndMark.length) : '';
const LAYERS = catSrc ? vm.runInNewContext(catSrc + '\nLAYERS;') : null;
const list = new Set(LAYERS ? LAYERS.stack : []);
if (hookTitles && LAYERS) for (const id of LAYERS.titles) stack.add(id);

const FADES = ['fade-casing', 'fade-surf-y', 'fade-surf-r', 'fade-band-g', 'fade-fill-g', 'selfade-y', 'selfade-r', 'selfade-g', 'selfade-fill'];
const EXCLUSIONS = []; // route-stack layers that stay visible in create mode, each with its reason - none today (see header)

// ---------- (1) the derivation is real, not an empty extraction ----------
check('1: the derivation reads the stack (35+ layer ids from addStack, the catalogue title ids among them via the unify hook) and the catalogue (35+ ids in its stack) - a silently empty extraction fails here, not downstream',
  stack.size >= 35 && list.size >= 35 && stack.has('streetnamespt1') && stack.has('streetnamespt4') && list.has('sel-glow5-b') &&
  hookTitles && app2.includes('function addRouteTitles(m, { newStack, data, ids, fontStack })') && app2.includes('for (const [index, id] of ids.entries())'));

// ---------- (2) stack ⊆ list: nothing the engine stacks escapes the backdrop ----------
const unhidden = [...stack].filter(id => !list.has(id) && !EXCLUSIONS.includes(id));
check('2: every route-stack layer addStack builds is named in the catalogue stack CR_ROUTE_LAYERS reads (or in this proof\'s named EXCLUSIONS) - the leak class | unhidden: ' + JSON.stringify(unhidden),
  unhidden.length === 0);

// ---------- (3) the nine feather ids, named ----------
check('3: all nine Beta 1.259 feather layers are derived from addStack AND named in the catalogue stack (the 1.264 fix itself)',
  FADES.every(id => stack.has(id)) && FADES.every(id => list.has(id)));

// ---------- (4) list ⊆ stack: no stale entries ----------
const stale = [...list].filter(id => !stack.has(id));
check('4: every CR_ROUTE_LAYERS member is a layer addStack actually builds - no stale entries left by retired layers | stale: ' + JSON.stringify(stale),
  stale.length === 0);

// ---------- (5) the list is the backdrop's working list ----------
check('5: the backdrop records and hides by iterating CR_ROUTE_LAYERS, and CR_ROUTE_LAYERS IS the catalogue stack this proof reads (GLP.layers.stack - the list this proof reads is the list the backdrop uses)',
  app2.includes('const CR_ROUTE_LAYERS = GLP.layers.stack;') && app2.includes('for (const id of CR_ROUTE_LAYERS)') && app2.includes("m.setLayoutProperty(pair[0], 'visibility', 'none')") && createPick.includes('setRouteBackdrop(map, on,'));

// ---------- (6) the release editorial ----------
check("6: the CHANGELOG orders Beta 1.266 above 1.265",
  changelog.indexOf('## Beta 1.266') > -1 && changelog.indexOf('## Beta 1.266') < changelog.indexOf('## Beta 1.265'));

console.log(`proof-1264: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
