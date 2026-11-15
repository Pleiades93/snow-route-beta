import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Fixlog runV guard proof (fix_id: load-sanitizer-a01a02-b02, 2026-11-15) —
// finding B-02 of the 2026-11-15 Carbon sweep, graded PARTLY REAL by the
// human assessment round (denylist-mediums-assessment): the mechanism is
// code-accurate, the input unreachable in any shipped flow.
//
// The defect: _fxEncEntry (parts/app3.js) derives
//     const runV = _fxFin(e[7]) ? e[7] : 0;
// and later writes `w.uv(BigInt(runV))` when the run changes. _fxFin
// accepts any finite number, so a fractional e[7] makes BigInt() throw a
// RangeError, and a negative e[7] is pushed into the byte stream as a
// negative "byte", silently corrupting the unsigned varint stream (the
// decoder reads run as an unsigned varint, so it can never round-trip).
// e[7] has exactly two sources — `runStart || 0` at live construction
// (always a non-negative integer) and the decoder's unsigned varint — so
// neither input can occur today; the guard is defence in depth, the
// parity fix the assessment named:
//     runV = (_fxFin(e[7]) && Number.isInteger(e[7]) && e[7] >= 0) ? e[7] : 0
//
// This proof extracts the shipped codec block verbatim (from the _fxDv
// DataView through _fxDecEntry) and checks three things:
//   1. BYTE IDENTITY: a corpus of reachable-shaped entry sequences
//      encodes to exactly the bytes the unmodified encoder produced
//      (pinned below, captured from main 9ad40713) — the guard changes
//      output for no reachable input. Passes before AND after the fix.
//   2. ROUND TRIP: the corpus decodes back to the original entries,
//      run values included. Passes before AND after.
//   3. THE GUARD: fractional and negative runV entries encode without
//      throwing, emit only valid bytes, and decode as run 0.
//      FAILS on unmodified main; passes with the fix.

const src = readFileSync('parts/app3.js', 'utf8');
const startAt = src.indexOf('const _fxDv = new DataView');
const endAt = src.indexOf('function _fxEncodeEntry(e, prev)');
if (startAt < 0 || endAt < 0 || endAt <= startAt) throw new Error('fixlog codec block anchors not found in parts/app3.js');
const block = src.slice(startAt, endAt) + '\n;globalThis.__fx = { _FxWriter, _FxReader, _fxEncEntry, _fxDecEntry };';
if (!block.includes('function _fxEncEntry') || !block.includes('function _fxDecEntry')) {
  throw new Error('extracted block does not contain the encoder/decoder');
}
const ctx = vm.createContext({});
vm.runInContext(block, ctx);
const { _FxWriter, _FxReader, _fxEncEntry, _fxDecEntry } = ctx.__fx;

const CORPUS = [
  // S1: steady drive, run 0 throughout, out present/absent, null scalars mixed
  [
    [1762800000000, 43.850001, -79.550001, 5.0, 0.0, null, [43.850001, -79.550001, 43.850101, -79.550101, 90.0], 0],
    [1762800001000, 43.850011, -79.550009, 4.5, 1.25, 91.2, [43.850011, -79.550009, 43.850111, -79.550109, 91.2], 0],
    [1762800002000, 43.850021, -79.550017, null, 2.5, 92.4, null, 0],
    [1762800003000, 43.850031, -79.550025, 6.25, null, null, [43.850031, -79.550025, 43.850131, -79.550125, null], 0]
  ],
  // S2: run transitions 0 -> epoch -> epoch -> 0, plus a backwards-ts keyframe
  [
    [1762800000000, 43.86, -79.56, 10.0, 8.5, 180.0, null, 0],
    [1762800001000, 43.8601, -79.56005, 9.0, 8.75, 181.5, null, 1762800000000],
    [1762800002000, 43.8602, -79.5601, 9.5, 9.0, 183.0, null, 1762800000000],
    [1762799999000, 43.8603, -79.56015, 9.5, 9.0, 183.0, null, 0]
  ],
  // S3: single entry, run = its own start from the first entry
  [
    [1762900000000, 43.870123, -79.570123, 3.5, 0.5, 359.9, [43.870123, -79.570123, 43.870223, -79.570223, 359.9], 1762900000000]
  ]
];

// Bytes the UNMODIFIED encoder (main 9ad40713) produces for CORPUS,
// captured 2026-11-15 before the fix. The guard must reproduce them
// exactly — it changes output for no reachable input.
const PINNED = [[15,1,128,128,128,174,145,222,233,188,66,1,157,145,193,169,205,153,251,162,64,1,155,226,147,187,179,230,248,169,192,1,2,128,128,128,128,128,128,128,138,64,2,0,0,0,162,228,232,41,225,216,238,75,234,229,232,41,169,218,238,75,1,136,14,0,2,232,7,200,216,150,190,10,132,189,239,152,4,1,255,255,255,255,255,255,255,1,2,128,128,128,128,128,128,128,250,63,2,205,153,179,230,204,153,179,171,64,20,15,20,15,1,24,0,232,7,198,216,150,190,10,130,189,239,152,4,0,1,128,128,128,128,128,128,128,16,1,154,179,230,204,153,179,38,6,232,7,200,216,150,190,10,132,189,239,152,4,2,128,128,128,128,128,128,192,140,64,0,0,0,222,228,232,41,145,217,238,75,166,230,232,41,217,218,238,75,0],[9,1,128,128,128,174,145,222,233,188,66,1,174,143,133,215,199,194,251,162,64,1,164,225,245,209,240,250,248,169,192,1,2,128,128,128,128,128,128,128,146,64,2,128,128,128,128,128,128,192,144,64,2,128,128,128,128,128,128,160,179,64,0,8,232,7,200,245,226,237,104,178,221,184,155,26,1,255,255,255,255,255,255,255,1,1,128,128,128,128,128,128,64,1,128,128,128,128,128,128,24,128,184,197,248,166,51,0,232,7,198,245,226,237,104,178,221,184,155,26,1,128,128,128,128,128,128,128,1,1,128,128,128,128,128,128,64,1,128,128,128,128,128,128,24,9,1,128,128,134,172,145,222,233,188,66,1,217,191,217,251,228,195,251,162,64,1,174,237,138,251,151,251,248,169,192,1,1,0,1,0,1,0,0],[15,1,128,128,192,158,135,234,233,188,66,1,171,255,136,134,131,236,251,162,64,1,162,217,183,169,206,143,249,169,192,1,2,128,128,128,128,128,128,128,134,64,2,128,128,128,128,128,128,128,240,63,2,230,204,153,179,230,204,159,187,64,0,214,158,235,41,149,147,241,75,158,160,235,41,221,148,241,75,1,158,56,128,250,156,168,167,51]];

function encodeSeq(seq) {
  const w = _FxWriter();
  let st = null;
  for (const e of seq) st = _fxEncEntry(w, e, st);
  return w.b;
}
function decodeSeq(bytes, n) {
  const r = _FxReader(bytes);
  let st = null;
  const out = [];
  for (let i = 0; i < n; i++) { const d = _fxDecEntry(r, st); out.push(d.e); st = d.st; }
  return out;
}
function entriesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    if (Array.isArray(x) || Array.isArray(y)) {
      if (!Array.isArray(x) || !Array.isArray(y) || x.length !== y.length) return false;
      for (let k = 0; k < x.length; k++) if (x[k] !== y[k]) return false;
    } else if (x !== y) return false;
  }
  return true;
}

let failures = 0;
function check(desc, ok) {
  console.log((ok ? 'PASS: ' : 'FAIL: ') + desc);
  if (!ok) failures++;
}

// 1 + 2: byte identity and round trip over the reachable corpus
CORPUS.forEach((seq, i) => {
  const bytes = encodeSeq(seq);
  check('S' + (i + 1) + ': encoding is byte-identical to the unmodified encoder', JSON.stringify(bytes) === JSON.stringify(PINNED[i]));
  let rt = null;
  try { rt = decodeSeq(bytes, seq.length); } catch (e) { /* round-trip failure is a failed check below */ }
  check('S' + (i + 1) + ': round trip returns the original entries (run values included)',
    !!rt && rt.every((e, k) => entriesEqual(e, seq[k])));
});

// 3: the guard — hostile runV values
function hostile(seq) {
  // returns { bytes } or { threw: true }
  try { return { bytes: encodeSeq(seq) }; } catch (e) { return { threw: true, err: e }; }
}
const base = [1762800000000, 43.85, -79.55, 5.0, 1.0, 90.0, null, 0];

// fractional runV on the first entry (runCh against no state)
{
  const r = hostile([[...base.slice(0, 7), 1.5]]);
  check('fractional runV (first entry) encodes without throwing', !r.threw);
  let run = null;
  if (!r.threw) { try { run = decodeSeq(r.bytes, 1)[0][7]; } catch (e) { /* failed check below */ } }
  check('fractional runV decodes as run 0', run === 0);
}
// fractional runV mid-chain (runCh against a live state)
{
  const r = hostile([base, [1762800001000, 43.85001, -79.55001, 5.0, 1.0, 90.0, null, 2.5]]);
  check('fractional runV (mid-chain) encodes without throwing', !r.threw);
  let run = null;
  if (!r.threw) { try { run = decodeSeq(r.bytes, 2)[1][7]; } catch (e) { /* failed check below */ } }
  check('fractional runV (mid-chain) decodes as run 0', run === 0);
}
// negative runV after a real run start (runCh writes the value)
{
  const first = [...base.slice(0, 7), 1762800000000];
  const r = hostile([first, [1762800001000, 43.85001, -79.55001, 5.0, 1.0, 90.0, null, -5]]);
  check('negative runV encodes without throwing', !r.threw);
  check('negative runV emits only valid bytes (0..255)', !!r.bytes && r.bytes.every(b => Number.isInteger(b) && b >= 0 && b <= 255));
  let run = null;
  if (!r.threw) { try { run = decodeSeq(r.bytes, 2)[1][7]; } catch (e) { /* failed check below */ } }
  check('negative runV decodes as run 0', run === 0);
}

if (failures > 0) process.exit(1);
