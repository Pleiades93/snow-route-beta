// Proof — rerun D-04 (sweep-20261115-171048 candidates assessment, judged REAL/LOW):
// crStreetParts cached a street's sector record forever, so a record computed
// BEFORE the city extract covered the street (no cuts, or partial cuts) stayed
// frozen for the rest of the draft even after the extract arrived. The fix
// stamps each record with the coverage fingerprint it was cut against and
// recomputes an UNTRIMMED street's record when coverage has since grown.
//
// This proof drives the real crStreetParts (extracted verbatim from
// parts/create-pick.js) through the assessed sequence:
//   open trim before extract -> extract arrives -> trim must show cut pieces
// plus the within-one-draft growth path (empty extract -> unrelated cell ->
// the covering cell), the replacement-coverage path, the settled-cache
// stability contract, and the deliberate boundary: a street WITH a chosen
// trim keeps its record (draft.sectors indexes mean pieces of THAT record;
// recomputing under a live trim would reinterpret the user's picks) - and
// the sector session's Cancel snapshot is a second holder of the same
// indexes, so it pins the record too while it is in flight (Codex P2 on
// PR #75), while a whole-road session (snapshot null) pins nothing.
//
// Run from the repo root: node tests/proof/proof-rerun-d04-streetparts-covstamp.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync('parts/create-pick.js', 'utf8');

function extractFn(source, name) {
  const marker = 'function ' + name + '(';
  const start = source.indexOf(marker);
  if (start < 0) return null;
  let depth = 0, i = source.indexOf('{', start);
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error('Unbalanced braces in ' + name);
}

const crStreetPartsSrc = extractFn(src, 'crStreetParts');
if (!crStreetPartsSrc) throw new Error('crStreetParts not found');
// The stamp helper exists only with the fix; on unmodified main it is absent
// and crStreetParts never references it, so the same proof runs (and fails
// on behaviour) against the unfixed tree.
const crCovStampSrc = extractFn(src, 'crCovStamp');

const MLAT = 111320, MLNG = 80000;

// Main Street: one straight run, 5 vertices ~50 m apart (200 m total).
const MAIN = [[43.8000, -79.500000], [43.8000, -79.499375], [43.8000, -79.498750], [43.8000, -79.498125], [43.8000, -79.497500]];
// A second, disconnected run of the same street (for the trim-boundary case).
const MAIN_RUN2 = [[43.8020, -79.500000], [43.8020, -79.499375], [43.8020, -79.498750]];
// Cross Street: runs north-south THROUGH Main's middle vertex (cum 100 m).
const CROSS = [[43.7990, -79.498750], [43.8000, -79.498750], [43.8010, -79.498750]];
// Far Street: nowhere near Main - grows the extract without adding cuts.
const FAR = [[43.9000, -79.6000], [43.9010, -79.6000]];
const FAR2 = [[43.9050, -79.6000], [43.9060, -79.6000]];

function covWith(gen, entries, boxes) {
  const byName = Object.create(null), byId = Object.create(null);
  let id = 1;
  for (const [name, pts] of entries) {
    (byName[name] = byName[name] || []).push({ pts });
    byId[id++] = { name, pts };
  }
  return { gen, byName, byId, boxes: boxes || [], fetchedAt: 0 };
}
const BOX = { s: 43.79, w: -79.51, n: 43.81, e: -79.49 };

function freshDraft(roads) {
  const osmNames = Object.create(null);
  for (const k of Object.keys(roads)) osmNames[k] = k;
  return {
    roads, primaries: new Set(), osmNames,
    sectors: Object.create(null), parts: Object.create(null),
    name: '', area: '', tileNames: []
  };
}

const ctx = vm.createContext({
  Object, Array, Set, JSON, Math,
  MLAT, MLNG,
  draft: null,
  crCov: null,
  crSectorSession: { street: null, snapshot: undefined, collapsed: false, face: 'panel' },
  stitchRuns(name, one) { return one[name]; },
  distM(a, b) { return Math.hypot((a[0] - b[0]) * MLAT, (a[1] - b[1]) * MLNG); },
  projOnLine(line, cum, v) {
    let best = { off: Infinity, d: 0 };
    for (let i = 1; i < line.length; i++) {
      const ax = line[i - 1][1] * MLNG, ay = line[i - 1][0] * MLAT;
      const bx = line[i][1] * MLNG, by = line[i][0] * MLAT;
      const vx = v[1] * MLNG, vy = v[0] * MLAT;
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
      let t = L2 ? ((vx - ax) * dx + (vy - ay) * dy) / L2 : 0;
      t = Math.max(0, Math.min(1, t));
      const off = Math.hypot(vx - (ax + t * dx), vy - (ay + t * dy));
      if (off < best.off) best = { off, d: cum[i - 1] + t * Math.sqrt(L2) };
    }
    return best;
  },
  // The documented finishing policy (cuts merged under 15 m, none within
  // 12 m of an end), splitting at the vertex nearest each surviving cut.
  finishJunctionCuts(line, cum, total, cuts) {
    const ok = cuts.filter(d => d > 12 && d < total - 12).sort((a, b) => a - b);
    const merged = [];
    for (const d of ok) { if (merged.length && d - merged[merged.length - 1] < 15) continue; merged.push(d); }
    if (!merged.length) return [line];
    const bounds = [0, ...merged, total], parts = [];
    for (let k = 0; k + 1 < bounds.length; k++) {
      let i0 = cum.findIndex(c => c >= bounds[k] - 1e-9); if (i0 < 0) i0 = 0;
      let i1 = cum.findIndex(c => c >= bounds[k + 1] - 1e-9); if (i1 < 0) i1 = line.length - 1;
      parts.push(line.slice(i0, i1 + 1));
    }
    return parts;
  }
});

vm.runInContext((crCovStampSrc ? crCovStampSrc + '\n' : '') + crStreetPartsSrc, ctx);

let failures = 0;
function check(desc, ok) {
  console.log((ok ? 'PASS: ' : 'FAIL: ') + desc);
  if (!ok) failures++;
}

// ---- Sequence 1 (the assessed defect): trim opened BEFORE the extract ----
// A photo-import-shaped draft: the street is in the draft, crCov is null.
ctx.draft = freshDraft({ 'Main Street': [MAIN] });
ctx.crCov = null;
const rec1 = ctx.crStreetParts('Main Street');
check('S1: no extract yet -> one uncut piece', !!rec1 && rec1.parts.length === 1);

// The extract arrives, carrying a cross street through Main's midpoint.
ctx.crCov = covWith(1, [['Cross Street', CROSS]], [BOX]);
const rec2 = ctx.crStreetParts('Main Street');
check('S1: after the extract lands, the record recomputes to 2 cut pieces', !!rec2 && rec2.parts.length === 2);
check('S1: the recomputed record replaces the cached one', rec2 !== rec1 && ctx.draft.parts['Main Street'] === rec2);

// Settled coverage: no growth -> the cache is read back, not recomputed.
const rec3 = ctx.crStreetParts('Main Street');
check('S1: settled coverage -> identical cached record returned', rec3 === rec2);

// ---- Sequence 2: coverage grows cell-by-cell inside one draft ----
ctx.draft = freshDraft({ 'Main Street': [MAIN] });
ctx.crCov = covWith(1, [], []); // prepare started: extract exists but is EMPTY
const g1 = ctx.crStreetParts('Main Street');
check('S2: empty extract -> one uncut piece', !!g1 && g1.parts.length === 1);

ctx.crCov = covWith(1, [['Far Street', FAR]], [BOX]); // an unrelated cell lands
const g2 = ctx.crStreetParts('Main Street');
check('S2: unrelated growth recomputes but adds no cut (still 1 piece)', !!g2 && g2.parts.length === 1 && g2 !== g1);

ctx.crCov = covWith(1, [['Far Street', FAR], ['Cross Street', CROSS]], [BOX, BOX]); // the covering cell lands
const g3 = ctx.crStreetParts('Main Street');
check('S2: covering cell lands -> 2 cut pieces', !!g3 && g3.parts.length === 2);

// ---- Sequence 3: a REPLACEMENT coverage (new prepare, same counts) ----
ctx.crCov = covWith(2, [['Far Street', FAR], ['Other Street', FAR2]], [BOX, BOX]); // gen 2, same sizes, nothing touching Main
const r3 = ctx.crStreetParts('Main Street');
check('S3: replacement coverage under a new generation -> recomputed (back to 1 piece)', !!r3 && r3.parts.length === 1 && r3 !== g3);

// ---- Sequence 4 (the deliberate boundary): a live trim pins its record ----
// Two runs, no coverage: the record is one piece per run. The user picks
// run 0 only (a trim in force), THEN the extract arrives with cuts.
ctx.draft = freshDraft({ 'Main Street': [MAIN, MAIN_RUN2] });
ctx.crCov = null;
const t1 = ctx.crStreetParts('Main Street');
check('S4: two runs, no extract -> 2 pieces (one per run)', !!t1 && t1.parts.length === 2);
ctx.draft.sectors['Main Street'] = [0]; // the trim: run 0 only, indexed against t1
ctx.crCov = covWith(1, [['Cross Street', CROSS]], [BOX]);
const t2 = ctx.crStreetParts('Main Street');
check('S4: trimmed street keeps its record after coverage arrives (indexes keep their meaning)', t2 === t1 && t2.parts.length === 2);

// ---- Sequence 5 (Codex P2 on PR #75): the Cancel snapshot pins the record ----
// The street was trimmed at sector-mode entry, so the session snapshot holds
// indexes into t1. Mid-session the user taps Entire road (the live trim is
// stored as NO entry) while coverage has grown: the renders that follow must
// NOT recompute the record under the snapshot's feet, or Cancel would restore
// the snapshot's indexes against different pieces.
ctx.draft = freshDraft({ 'Main Street': [MAIN, MAIN_RUN2] });
ctx.crCov = null;
const p1 = ctx.crStreetParts('Main Street');
ctx.draft.sectors['Main Street'] = [1]; // the trim in force at entry: run 2 only
ctx.crSectorSession.street = 'Main Street';
ctx.crSectorSession.snapshot = [1]; // crOpenSectors' entry snapshot of that trim
ctx.crCov = covWith(1, [['Cross Street', CROSS]], [BOX]); // coverage arrives mid-session
delete ctx.draft.sectors['Main Street']; // Entire road: full set stores as no entry
const p2 = ctx.crStreetParts('Main Street'); // what renderDraft/renderSectorBar now read
check('S5: snapshot in flight -> record pinned despite the cleared trim + grown coverage', p2 === p1);
ctx.draft.sectors['Main Street'] = ctx.crSectorSession.snapshot.slice(); // Cancel restores the pick
const p3 = ctx.crStreetParts('Main Street');
check('S5: after Cancel the restored indexes still mean the same record', p3 === p1 && p3.parts.length === 2);
ctx.crSectorSession.street = null; ctx.crSectorSession.snapshot = undefined; // session closed
delete ctx.draft.sectors['Main Street']; // a later Entire-road state with no session
const p4 = ctx.crStreetParts('Main Street');
check('S5: pin lifts with the session -> untrimmed record recomputes (3 pieces)', !!p4 && p4 !== p1 && p4.parts.length === 3);

// ---- Sequence 6: an untrimmed session (snapshot null) does NOT pin ----
// This is the assessed defect's own shape - the trim view opened on a whole
// road before the extract lands. The snapshot is null (whole road at entry),
// so coverage arriving mid-session must still recompute the record.
ctx.draft = freshDraft({ 'Main Street': [MAIN] });
ctx.crCov = null;
const u1 = ctx.crStreetParts('Main Street');
ctx.crSectorSession.street = 'Main Street';
ctx.crSectorSession.snapshot = null; // entered on the whole road
ctx.crCov = covWith(1, [['Cross Street', CROSS]], [BOX]);
const u2 = ctx.crStreetParts('Main Street');
check('S6: whole-road session (snapshot null) -> record still recomputes to 2 pieces', !!u2 && u2 !== u1 && u2.parts.length === 2);
ctx.crSectorSession.street = null; ctx.crSectorSession.snapshot = undefined;

if (failures > 0) { console.log(failures + ' check(s) failed'); process.exit(1); }
console.log('All checks passed');
