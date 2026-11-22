import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Denylist fix proof (fix_id: rerun-denylist-b02-a05, 2026-11-15) — A-05 of
// the 2026-11-15 Carbon sweep re-run, graded REAL by the assessment round.
//
// The defect (parts/app1.js): loadRouteState's sanitizer filters the stored
// history to entries naming current streets and rewrites each survivor's
// items in place. The in-memory `history` is then what every writer
// persists - saveHistory, saveAll, finishRun's archive write - so the first
// ordinary save after such a load writes the STRIPPED history back to
// storage permanently, contradicting the codebase's own principle
// (reconcileInterruptedFinish's dropPhantom): a load-time strip is a view,
// never a write.
//
// The fix: the sanitizer records a snapshot (histRawList / histRawView) and
// the writers persist historyForWrite(...): entries the strip dropped ride
// back verbatim, survivors are written in their raw form, user deletions
// still delete, and finishes still append. (Beta 1.272, architecture
// programme #2: the snapshot and the writers moved into the HIST repository
// in parts/app1.js - loadFrom / forWrite / serialise / save / deleteAt /
// appended - with the semantics unchanged; this proof drives them there.)
//
// This proof extracts the shipped HIST object verbatim and runs it in a vm
// against a planted storage stub. On unmodified main the
// storage-preservation checks FAIL (the view checks pass both ways); with
// the fix all checks pass.

const src = readFileSync('parts/app1.js', 'utf8');

function extractObj(name) {
  const at = src.indexOf('const ' + name + ' = {');
  if (at < 0) throw new Error('object not found: ' + name);
  const open = src.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(at, i + 1) + ';'; }
  }
  throw new Error('unbalanced braces extracting ' + name);
}
const histSrc = extractObj('HIST');
if (!histSrc.includes('STREETSET.has(n)')) throw new Error('extracted HIST does not contain the items sanitizer (loadFrom)');
if (!histSrc.includes('dropPhantom')) throw new Error('extracted HIST does not contain dropPhantom');

// Planted storage: a valid entry; a mixed entry (one current street, one
// street the pack no longer has); an entry naming ONLY the foreign street;
// an entry the first predicate drops (unparseable at).
const E1 = { at: '2026-11-01T12:00:00.000Z', items: { Velmar: '2026-11-01T12:05:00.000Z' }, workM: 111 };
const E2 = { at: '2026-11-02T12:00:00.000Z', items: { Velmar: '2026-11-02T12:05:00.000Z', 'Old Street': '2026-11-02T12:06:00.000Z' }, workM: 222 };
const E3 = { at: '2026-11-03T12:00:00.000Z', items: { 'Old Street': '2026-11-03T12:05:00.000Z' }, workM: 333 };
const E4 = { at: 'not a date', items: { Velmar: null }, workM: 444 };
const plantedText = JSON.stringify([E1, E2, E3, E4]);

const harness = `
__out.viewLen = history.length;
__out.viewE2Items = Object.keys(history[1].items).sort();
HIST.save();
__out.afterSave = store.get('planted.hist');
HIST.deleteAt(0); // the user deletes the first clean (Pace delete handler)
HIST.save();
__out.afterDelete = store.get('planted.hist');
history = HIST.appended({ at: '2026-11-04T12:00:00.000Z', items: { Velmar: '2026-11-04T12:05:00.000Z' }, workM: 555 });
HIST.save();
__out.afterAppend = store.get('planted.hist');
`;

const ctx = vm.createContext({
  plantedText,
  LS: { hist: 'planted.hist' },
  STREETSET: new Set(['Velmar', 'Mellings'])
});
vm.runInContext(`
let history = [];
const store = new Map([['planted.hist', plantedText]]);
function lsGet(k) { return store.has(k) ? store.get(k) : null; }
function lsSet(k, v) { store.set(k, String(v)); return true; }
function parseJ(t, fb) { if (t == null) return fb; try { return JSON.parse(t); } catch (e) { return fb; } }
const __out = {};
`, ctx);
vm.runInContext(histSrc, ctx);
vm.runInContext('HIST.loadFrom(plantedText);', ctx);
vm.runInContext(harness, ctx);
const out = vm.runInContext('__out', ctx);

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) pass++; else fail++;
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (cond ? '' : '  (' + detail + ')'));
}
const parse = t => JSON.parse(t);
const hasOld = e => e && e.items && Object.prototype.hasOwnProperty.call(e.items, 'Old Street');

check('view: sanitizer keeps exactly the 2 current-street entries', out.viewLen === 2, 'view length ' + out.viewLen);
check('view: the mixed entry shows only the current street', JSON.stringify(out.viewE2Items) === '["Velmar"]', JSON.stringify(out.viewE2Items));
check('A-05: an ordinary save leaves storage byte-identical to what was loaded', out.afterSave === plantedText, 'stored text changed across a no-op save');
const saved = parse(out.afterSave);
check('A-05: the foreign-only entry survives the save', saved.length === 4 && hasOld(saved[2]), 'stored length ' + saved.length);
check('A-05: the mixed entry keeps its foreign street in storage', hasOld(saved[1]), 'stored E2 items ' + JSON.stringify(saved[1] && saved[1].items));
const afterDel = parse(out.afterDelete);
check('delete still deletes: the removed clean is gone from storage', afterDel.length === 3 && !afterDel.some(e => e.workM === 111), 'stored length ' + afterDel.length);
check('A-05: the strip-dropped entries survive even a delete-save', afterDel.some(e => e.workM === 333) && afterDel.some(e => e.workM === 444), 'stored workMs ' + JSON.stringify(afterDel.map(e => e.workM)));
const afterApp = parse(out.afterAppend);
check('append still appends: the new clean lands at the end', afterApp.length === 4 && afterApp[3].workM === 555, 'stored length ' + afterApp.length);
check('A-05: the strip-dropped entries survive an append-save too', afterApp.some(e => e.workM === 333) && hasOld(afterApp.find(e => e.workM === 222)), 'stored workMs ' + JSON.stringify(afterApp.map(e => e.workM)));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
