import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// osmNames Clear-all twin proof (fix_id: osmnames-clearall-twin, 2026-11-15).
//
// The defect: draft.osmNames is a street-name-keyed map, and every site
// that creates it uses a null-prototype object - newDraft()
// (parts/create-fetch.js) and importDraft (parts/create-pick.js, the D-03
// fix, PR #63) - because a plain object misbehaves for names that collide
// with built-in Object members: reading an unset 'constructor' /
// 'toString' / '__proto__' key returns the inherited member instead of
// undefined (the own-ways lookup in crStreetParts reads exactly that
// way), and assigning '__proto__' as a key invokes the prototype setter
// instead of storing an own entry, so such a street can never join the
// map. The crClearAll ("Clear all") handler's wholesale reset was the
// one remaining site that assigned a plain object:
//     draft.osmNames = {};
// so after a single Clear-all, the draft's name map silently downgraded
// to the collision-prone form for the rest of the create session. The
// fix assigns Object.create(null), matching every other creation site.
//
// This proof extracts the handler's exact shipped reset statement from
// parts/create-pick.js and executes it against a draft stub, then checks
// the map the statement leaves behind. On unmodified main the five
// behavioural checks FAIL (the emptiness sanity passes both ways);
// with the fix all six pass.

const src = readFileSync('parts/create-pick.js', 'utf8');

// Locate the crClearAll handler and lift its reset statement verbatim.
const handlerAt = src.indexOf("$('crClearAll')");
if (handlerAt < 0) throw new Error('crClearAll handler not found in parts/create-pick.js');
const assignAt = src.indexOf('draft.osmNames =', handlerAt);
if (assignAt < 0) throw new Error('no draft.osmNames assignment inside the crClearAll handler');
const lineStart = src.lastIndexOf('\n', assignAt) + 1;
const lineEnd = src.indexOf('\n', assignAt);
const resetStmt = src.slice(lineStart, lineEnd).trim();
if (!resetStmt.includes('draft.roads =') || !resetStmt.includes('draft.osmNames =')) {
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
ctx.draft.osmNames['Alpha Street'] = 'Alpha Street'; // a pick exists before Clear-all

vm.runInContext(resetStmt, ctx);
const osm = ctx.draft.osmNames;

let failures = 0;
function check(desc, ok) {
  console.log((ok ? 'PASS: ' : 'FAIL: ') + desc);
  if (!ok) failures++;
}

check('reset osmNames has null prototype', Object.getPrototypeOf(osm) === null);
check("unset 'constructor' reads back undefined (no inherited member)", osm['constructor'] === undefined);
check("unset '__proto__' reads back undefined (no inherited member)", osm['__proto__'] === undefined);

// The crAddStreet pattern: a tapped street joins as key -> itself.
osm['__proto__'] = '__proto__';
check("'__proto__' stored as an own key", Object.prototype.hasOwnProperty.call(osm, '__proto__'));
check("own-ways lookup returns '__proto__' itself", osm['__proto__'] === '__proto__');

check('reset actually emptied the pre-existing pick', !Object.prototype.hasOwnProperty.call(osm, 'Alpha Street'));

if (failures > 0) process.exit(1);
