import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Clear-all sibling maps proof (fix_id: clearall-sibling-maps, 2026-11-15).
//
// The defect: draft.roads, draft.sectors and draft.parts are
// street-name-keyed maps, and every site that creates them uses a
// null-prototype object - newDraft() (parts/create-fetch.js, the
// Beta 1.169 D-05 fix) and normalizePack's cleanRoads for the map
// importDraft adopts (parts/create-packs.js) - because a plain object
// misbehaves for names that collide with built-in Object members:
// reading an unset 'constructor' / 'toString' / '__proto__' key
// returns the inherited member instead of undefined (so a first street
// carrying one of those names reads as already present), and
// assigning '__proto__' as a key invokes the prototype setter instead
// of storing an own entry, so such a street can never join the map.
// The crClearAll ("Clear all") handler's wholesale reset was the one
// remaining site that assigned plain objects:
//     draft.roads = {}; ... draft.sectors = {}; draft.parts = {};
// (its fourth map, osmNames, was fixed the same way in PR #66), so
// after a single Clear-all, all three maps silently downgraded to the
// collision-prone form for the rest of the create session. The fix
// assigns Object.create(null) for the three, matching every other
// creation site.
//
// This proof extracts the handler's exact shipped reset statement from
// parts/create-pick.js and executes it against a draft stub, then
// checks the three maps the statement leaves behind. On unmodified
// main twelve checks FAIL; the other six pass both ways (the
// emptiness sanity, and the '__proto__' read-back - which passes on a
// plain object only because the assignment silently replaces the
// map's prototype with the stored record, the very corruption the
// own-key check exposes). With the fix all eighteen pass.

const src = readFileSync('parts/create-pick.js', 'utf8');

// Locate the crClearAll handler and lift its reset statement verbatim.
const handlerAt = src.indexOf("$('crClearAll')");
if (handlerAt < 0) throw new Error('crClearAll handler not found in parts/create-pick.js');
const assignAt = src.indexOf('draft.roads =', handlerAt);
if (assignAt < 0) throw new Error('no draft.roads assignment inside the crClearAll handler');
const lineStart = src.lastIndexOf('\n', assignAt) + 1;
const lineEnd = src.indexOf('\n', assignAt);
const resetStmt = src.slice(lineStart, lineEnd).trim();
if (!resetStmt.includes('draft.roads =') || !resetStmt.includes('draft.sectors =') || !resetStmt.includes('draft.parts =')) {
  throw new Error('extracted statement is not the wholesale reset line: ' + resetStmt);
}

const ctx = vm.createContext({
  Object, Set,
  draft: {
    roads: Object.create(null),
    primaries: new Set(['Alpha Street']),
    osmNames: Object.create(null),
    sectors: Object.create(null),
    parts: Object.create(null)
  }
});
ctx.draft.roads['Alpha Street'] = [[43.8, -79.5]]; // a pick exists in each map before Clear-all
ctx.draft.sectors['Alpha Street'] = [0];
ctx.draft.parts['Alpha Street'] = { total: 1 };

vm.runInContext(resetStmt, ctx);

let failures = 0;
function check(desc, ok) {
  console.log((ok ? 'PASS: ' : 'FAIL: ') + desc);
  if (!ok) failures++;
}

for (const field of ['roads', 'sectors', 'parts']) {
  const m = ctx.draft[field];
  check(field + ': reset map has null prototype', Object.getPrototypeOf(m) === null);
  check(field + ": unset 'constructor' reads back undefined (no inherited member)", m['constructor'] === undefined);
  check(field + ": unset '__proto__' reads back undefined (no inherited member)", m['__proto__'] === undefined);

  // The join-by-assignment pattern (crAddStreet / crSetChosen / the
  // crStreetParts cache): a street named '__proto__' must land as an
  // own key, not be swallowed by the prototype setter.
  const sentinel = { street: '__proto__' };
  m['__proto__'] = sentinel;
  check(field + ": '__proto__' stored as an own key", Object.prototype.hasOwnProperty.call(m, '__proto__'));
  check(field + ": own-key lookup returns the stored '__proto__' entry", m['__proto__'] === sentinel);

  check(field + ': reset actually emptied the pre-existing pick', !Object.prototype.hasOwnProperty.call(m, 'Alpha Street'));
}

if (failures > 0) process.exit(1);
