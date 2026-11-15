import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Load sanitizer proof (fix_id: load-sanitizer-a01a02-b02, 2026-11-15) —
// findings A-01 and A-02 of the 2026-11-15 Carbon sweep, graded PARTLY REAL
// by the human assessment round (denylist-mediums-assessment).
//
// The defects, both in loadRouteState (parts/app1.js), both reachable only
// through crafted backup restores or planted storage:
//   A-01: doneTimes values are validated at load (string + parseable date,
//   else the entry is deleted) but doneVia values one line later are not —
//   a number, a nested object, an array or null survives load, is re-saved
//   verbatim and rides backups. Every consumer compares === 'gps', so the
//   worst effect is a lost "(GPS-verified)" label. Fix: delete doneVia
//   entries whose value is not a string (validateSnap's standard).
//   A-02: the notes filter keeps any entry that is an object with a string
//   `k`; `text` and `at` are unchecked, so an object text renders
//   "[object Object]" and an object/unparseable `at` renders "NaN:NaN AM".
//   Fix: extend the filter — a present `text` must be a string, a present
//   `at` must be a string Date.parse accepts (the doneTimes standard);
//   offending entries are dropped, the loader's existing style.
//
// This proof extracts the shipped sanitizer block verbatim — from the
// `doneVia = parseJ(...)` line through the notes forEach line — and runs
// it in a vm against a planted storage stub, then inspects the doneVia /
// notes the block leaves behind. On unmodified main the A-01/A-02 checks
// FAIL (the sanity checks pass both ways); with the fixes all pass.

const src = readFileSync('parts/app1.js', 'utf8');

const startAt = src.indexOf('doneVia = parseJ(lsGet(LS.via), {});');
if (startAt < 0) throw new Error('doneVia load line not found in parts/app1.js');
const forEachAt = src.indexOf('Object.keys(notes).forEach', startAt);
if (forEachAt < 0) throw new Error('notes forEach not found after the doneVia load');
const endAt = src.indexOf('\n', forEachAt);
const block = src.slice(startAt, endAt);
if (!block.includes('notes[n] = notes[n].filter(f =>')) {
  throw new Error('extracted block does not end at the notes filter: ' + block.slice(-120));
}

// Planted storage: one valid + four corrupt via values; a notes record
// mixing valid entries, corrupt-field entries and legacy shapes.
const store = {
  'planted.via': JSON.stringify({
    Velmar: 'gps',                    // valid — kept both ways
    Mellings: 'tap',                  // valid — kept both ways
    Astona: 42,                       // number — A-01: dropped by the fix
    'Santa Barbara': { nested: true }, // object — A-01: dropped by the fix
    Valeria: ['gps'],                 // array — A-01: dropped by the fix
    Greenpark: null                   // null — A-01: dropped by the fix
  }),
  'planted.notes': JSON.stringify({
    Velmar: [
      { k: 'note', at: '2026-11-10T10:00:00.000Z', text: 'gate sticks' }, // valid — kept both ways
      { k: 'note', at: '2026-11-10T10:05:00.000Z', text: { bad: 1 } },    // object text — A-02: dropped by the fix
      { k: 'note', at: { bad: 1 }, text: 'x' },                           // object at — A-02: dropped by the fix
      { k: 'note', at: 'not a date', text: 'y' },                         // unparseable at — A-02: dropped by the fix
      { k: 'car', at: '2026-11-10T11:00:00.000Z' },                       // valid flag — kept both ways
      { k: 'hazard', at: 1762800000 },                                    // numeric at — A-02: dropped by the fix
      { k: 'note', text: 'no timestamp' },                                // at absent — kept both ways (only present fields are validated)
      'garbage-entry',                                                    // not an object — dropped both ways
      { k: 7, at: '2026-11-10T11:00:00.000Z' }                            // non-string k — dropped both ways
    ],
    Mellings: 'a legacy string', // non-array value — the street key is dropped both ways
    'Not A Street': [{ k: 'car', at: '2026-11-10T11:00:00.000Z' }] // unknown street — dropped both ways
  })
};

const ctx = vm.createContext({
  LS: { via: 'planted.via', notes: 'planted.notes' },
  lsGet: k => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
  // parseJ lifted verbatim from parts/app1.js
  parseJ: (raw, fb) => { if (raw == null) return fb; try { const v = JSON.parse(raw); return v == null ? fb : v; } catch (e) { return fb; } },
  STREETSET: new Set(['Velmar', 'Mellings', 'Astona', 'Santa Barbara', 'Valeria', 'Greenpark'])
});
vm.runInContext(block, ctx);

const via = ctx.doneVia;
const velmar = (ctx.notes && ctx.notes.Velmar) || [];

let failures = 0;
function check(desc, ok) {
  console.log((ok ? 'PASS: ' : 'FAIL: ') + desc);
  if (!ok) failures++;
}

// A-01 — doneVia values
check("valid 'gps' via value survives load", via.Velmar === 'gps');
check("valid 'tap' via value survives load", via.Mellings === 'tap');
check('numeric via value is dropped at load', !Object.prototype.hasOwnProperty.call(via, 'Astona'));
check('nested-object via value is dropped at load', !Object.prototype.hasOwnProperty.call(via, 'Santa Barbara'));
check('array via value is dropped at load', !Object.prototype.hasOwnProperty.call(via, 'Valeria'));
check('null via value is dropped at load', !Object.prototype.hasOwnProperty.call(via, 'Greenpark'));
check('every surviving via value is a string', Object.values(via).every(v => typeof v === 'string'));

// A-02 — note entry fields
const hasText = t => velmar.some(f => f && f.text === t);
const hasKind = k => velmar.some(f => f && f.k === k);
check('valid note entry survives intact', velmar.some(f => f && f.k === 'note' && f.text === 'gate sticks' && f.at === '2026-11-10T10:00:00.000Z'));
check('object-text note is dropped at load', !velmar.some(f => f && typeof f.text === 'object' && f.text !== null));
check('object-at note is dropped at load', !velmar.some(f => f && typeof f.at === 'object' && f.at !== null));
check('unparseable-at note is dropped at load', !hasText('y'));
check('valid flag entry survives load', hasKind('car'));
check('numeric-at flag is dropped at load', !hasKind('hazard'));
check('entry with no at field survives (only present fields are validated)', hasText('no timestamp'));
check('surviving Velmar entries are exactly the three valid ones', velmar.length === 3);
check('non-array street value drops the street key', !Object.prototype.hasOwnProperty.call(ctx.notes, 'Mellings'));
check('unknown-street key is dropped', !Object.prototype.hasOwnProperty.call(ctx.notes, 'Not A Street'));

if (failures > 0) process.exit(1);
