// proof-1249.mjs - Beta 1.249 (fix_id: packstall-1249).
// THE PACK STALL (Andrew's ruling, 2026-11-19): the city pack download
// was the one create-flow download with no byte-level stall rule - its
// fetch carried no timeout, so a wedged connection pended crPackLoad's
// promise forever and only the preparation watchdogs' 180 s LANDING
// bound ever surfaced it, as a failed preparation. The pack attempt
// (crPackDownload) now carries a silence timer in crOverpassFetch's
// shape (1.246) on the pack's own two windows: packFirstByteMs (120 s)
// until the first body byte - the static host spends real time
// producing a big city's file before the first byte moves, so early
// silence is not yet a wedge - then packStallMs (60 s, the attempt
// rule's own value) between bytes once they flow. A silence kill is
// TAGGED (err.packStall) and retries INSIDE crPackLoad's cached
// promise, invisible to callers, so nothing already landed (committed
// cells, coverage, the preparation's state) is discarded; only the
// killed attempt's in-flight bytes restart - bytes in flight were
// never landed progress, the pack being one JSON document adapted
// whole. The retry stands down when the load stops being the session's
// cached one (the grid watchdog's delete, a superseding force load -
// the abandonment signals that orphaned the wedged promise through
// 1.248) and once the load is older than CR_TIMING.stallMs, referenced
// not restated: inside a preparation the 180 s watch fires first (its
// clock starts before the load does, and nothing can land while the
// pack wedges), so preparation behaviour stays bounded by it exactly
// as before. Real failures (HTTP, parse, shape, network) reject at
// once, untagged, as through 1.248. The behaviour is graded by
// drive206 (a silent host measured killed at the first-byte bound
// with the retry's answer committed; a late first byte inside the
// window followed by flowing bytes completing unkilled; a mid-flow
// silence killed on the flowing window with the retry completing and
// the committed state intact; a killed attempt's poison never in the
// result; a healthy load identical to 1.248) - its timing assertions
// fail on the 1.248 tree, where the seams below do not exist and the
// silent load pends past every bound.
// Run from the repo root:  node tests/proof/proof-1249.mjs
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const fetchJs = read('parts/create-fetch.js');
const cache = read('parts/create-cache.js');
const citydata = read('parts/create-citydata.js');
const whatsnew = read('parts/whatsnew.js');
const changelog = read('CHANGELOG.md');

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };

// ---------- the seams ----------
const timingLine = (fetchJs.match(/const CR_TIMING = \{[^}]*\}/) || [''])[0];
const num = (k) => { const m = timingLine.match(new RegExp(k + ': (\\d+)')); return m ? +m[1] : NaN; };
check('1: the pack windows are CR_TIMING seams beside the other stall rules, at the locked values',
  timingLine.includes('packFirstByteMs: 120000') && timingLine.includes('packStallMs: 60000'));
check('2: the flowing window equals the attempt rule\'s value (60000) - one 60 s silence standard once bytes move',
  num('packStallMs') === 60000 && num('attemptStallMs') === 60000 && num('packStallMs') === num('attemptStallMs'));
check('3: the first-byte window is the generous one (120000) and sits below the preparation bound (180000), so a pre-first-byte wedge recovers inside the backstop',
  num('packFirstByteMs') === 120000 && num('stallMs') === 180000 && num('packFirstByteMs') < num('stallMs'));
check('4: the preparation bound itself stands at 180000 (the watchdogs did not move)',
  timingLine.includes('stallMs: 180000'));

// ---------- the attempt: seat, windows, tag ----------
check('5: one watched attempt helper exists and reads the body as a stream',
  citydata.includes('async function crPackDownload(slug)')
  && citydata.includes('r.body.getReader()'));
check('6: the silence timer picks its window by whether a byte has landed - first-byte window before, flowing window after',
  citydata.includes('sawByte ? CR_TIMING.packStallMs : CR_TIMING.packFirstByteMs'));
check('7: a landed chunk re-arms the timer (the flowing window restarts per chunk)',
  citydata.includes('armStall(); // a landed chunk is progress'));
check('8: the kill is tagged for the retry loop, and only the kill is',
  citydata.includes("const err = new Error('pack stall'); err.packStall = true; throw err;")
  && citydata.includes("throw new Error('pack HTTP ' + r.status)")
  && citydata.includes("throw new Error('pack shape')"));

// ---------- the retry: inside the cached promise, with its stand-downs ----------
check('9: the retry stands inside crPackLoad on the tagged kill only',
  citydata.includes('if (e && e.packStall && crPackLoads[slug] === p && Date.now() - t0 < CR_TIMING.stallMs) continue;'));
check('10: the loop\'s age bound REFERENCES stallMs (no second 180 s literal in the pack loader)',
  (citydata.match(/180000/g) || []).length === 0);
check('11: the old unbounded form is gone - no whole-body r.json() pack read survives',
  !citydata.includes('const pack = await r.json();'));
check('12: the adaptation stands verbatim below the loop (same elements, same negative ids, same geometry mapping)',
  citydata.includes("els.push({ type: 'way', id: -(++idc), tags: { name: nm }, geometry: seg.map(pt => ({ lat: pt[0], lon: pt[1] })) })")
  && citydata.includes("if (!els.length) throw new Error('pack empty');"));

// ---------- the preparation watchdogs are untouched ----------
check('13: the grid watchdog still tests its progress clock against stallMs',
  cache.includes('if (Date.now() - (g.lastProgressAt || g.startedAt) < CR_TIMING.stallMs) return;'));
check('14: the fallback watchdog still tests its start clock against stallMs',
  citydata.includes('if (Date.now() - prep.startedAt < CR_TIMING.stallMs) return;'));
check('15: the grid stall still drops the cached pack promise (the abandonment signal the retry reads)',
  cache.includes('delete crPackLoads[g.fromPack]'));

// ---------- the release editorial ----------
check('16: the CHANGELOG top entry is Beta 1.251', changelog.includes('## Beta 1.251'));
check('17: What\'s New carries the 1.251 bullet, short and dash-free',
  whatsnew.includes('Street names now show everywhere while you create a route.')
  && 'Street names now show everywhere while you create a route.'.length <= 108
  && !whatsnew.includes('—'));

// ---------- the first byte must be RECORDED, not just read about ----------
// /correct Phase 2, C1 proof-pin half (cross-audit R-04, 2026-11-20):
// checks 6-7 pin the ternary that READS sawByte and the re-arm that a
// landed chunk triggers, but through this round nothing pinned the
// assignment that SETS the flag. Deleting `sawByte = true;` from the
// read loop leaves the timer on the 120 s first-byte window forever -
// the 60 s between-bytes rule dies - and every check above stayed
// green (mutation run in the Phase 2 record: 17/17 under the deletion).
// Check 18 pins the behaviour-level anchor: the assignment stands
// inside the streaming read loop (between the reader's creation and
// the chunk concatenation), and it stands exactly once in the file,
// so a copy planted elsewhere cannot satisfy it while the loop loses
// its own. Mutation-proven: red under the deletion, green restored.
const loopSlice = citydata.slice(citydata.indexOf('const reader = r.body.getReader()'), citydata.indexOf('const buf = new Uint8Array(total)'));
check('18: a landed chunk SETS the flag the timer reads - sawByte = true stands inside the streaming read loop, and exactly once in the file',
  loopSlice.length > 0
  && loopSlice.includes('sawByte = true;')
  && (citydata.match(/sawByte = true;/g) || []).length === 1);

console.log(`proof-1249: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
