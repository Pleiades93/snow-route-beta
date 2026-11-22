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
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const engine = read('parts/engine.js');
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
const tierLoop = stackBody.match(/for \(let t = 1; t <= (\d+); t\+\+\) \{\s*const id = 'streetnamespt' \+ t;/);
if (tierLoop) for (let t = 1; t <= Number(tierLoop[1]); t++) stack.add('streetnamespt' + t);

// ---------- read CR_ROUTE_LAYERS (base array + its concat expansions) ----------
const listStart = createPick.indexOf('const CR_ROUTE_LAYERS =');
const listLine2 = listStart > -1 ? createPick.indexOf('\n', createPick.indexOf('\n', listStart) + 1) : -1;
const listStmt = listStart > -1 && listLine2 > listStart ? createPick.slice(listStart, listLine2) : ''; // the statement is exactly two lines (the base array, then the concat line)
const list = new Set();
const baseArr = listStmt.match(/\[([^\]]*)\]\s*\/\/ Beta 1\.207/);
if (baseArr) for (const m of baseArr[1].matchAll(/'([^']+)'/g)) list.add(m[1]);
for (const m of listStmt.matchAll(/\[([\d, ]+)\]\.map\(t => '([^']+)' \+ t\)/g)) {
  for (const n of m[1].split(',').map(x => x.trim()).filter(Boolean)) list.add(m[2] + n);
}
for (const m of listStmt.matchAll(/\[([\d, ]+)\]\.flatMap\(i => \['([^']+)' \+ i \+ '-s', '([^']+)' \+ i \+ '-b'\]\)/g)) {
  for (const n of m[1].split(',').map(x => x.trim()).filter(Boolean)) { list.add(m[2] + n + '-s'); list.add(m[3] + n + '-b'); }
}

const FADES = ['fade-casing', 'fade-surf-y', 'fade-surf-r', 'fade-band-g', 'fade-fill-g', 'selfade-y', 'selfade-r', 'selfade-g', 'selfade-fill'];
const EXCLUSIONS = []; // route-stack layers that stay visible in create mode, each with its reason - none today (see header)

// ---------- (1) the derivation is real, not an empty extraction ----------
check('1: the derivation reads the stack (35+ layer ids from addStack, the streetnamespt tier loop among them) and the list (35+ ids) - a silently empty extraction fails here, not downstream',
  stack.size >= 35 && list.size >= 35 && stack.has('streetnamespt1') && stack.has('streetnamespt4') && list.has('sel-glow5-b'));

// ---------- (2) stack ⊆ list: nothing the engine stacks escapes the backdrop ----------
const unhidden = [...stack].filter(id => !list.has(id) && !EXCLUSIONS.includes(id));
check('2: every route-stack layer addStack builds is named in CR_ROUTE_LAYERS (or in this proof\'s named EXCLUSIONS) - the leak class | unhidden: ' + JSON.stringify(unhidden),
  unhidden.length === 0);

// ---------- (3) the nine feather ids, named ----------
check('3: all nine Beta 1.259 feather layers are derived from addStack AND named in CR_ROUTE_LAYERS (the 1.264 fix itself)',
  FADES.every(id => stack.has(id)) && FADES.every(id => list.has(id)));

// ---------- (4) list ⊆ stack: no stale entries ----------
const stale = [...list].filter(id => !stack.has(id));
check('4: every CR_ROUTE_LAYERS member is a layer addStack actually builds - no stale entries left by retired layers | stale: ' + JSON.stringify(stale),
  stale.length === 0);

// ---------- (5) the list is the backdrop's working list ----------
check('5: crSetBackdrop records and hides by iterating CR_ROUTE_LAYERS (the list this proof reads is the list the backdrop uses)',
  createPick.includes('for (const id of CR_ROUTE_LAYERS)') && createPick.includes("map.setLayoutProperty(pair[0], 'visibility', 'none')"));

// ---------- (6) the release editorial ----------
const BULLET = 'Street names now load in with the map, in sync, instead of popping in after a wait.';
check("6: What's New carries the 1.266 bullet (rolled by the unified-load-in round), within the 108-char cap, em-dash free, and the CHANGELOG top entry is Beta 1.266 above 1.265",
  whatsnew.includes(BULLET) && BULLET.length <= 108 && !whatsnew.includes('—') &&
  changelog.indexOf('## Beta 1.266') > -1 && changelog.indexOf('## Beta 1.266') < changelog.indexOf('## Beta 1.265'));

console.log(`proof-1264: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
