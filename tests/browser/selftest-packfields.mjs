// Beta 1.131 (maintainability programme A) test-change gate fixtures:
// normalizePack is the pack format's judging logic - the one validator
// every route that enters the app must survive (draft import, save,
// backup restore, boot merge). Before 1.131 it rebuilt packs from a
// hand-written field literal: a field that joined the format but not the
// literal was silently dropped on every created/imported route. 1.131
// builds the pack by walking the ONE list, PACK_FIELDS (parts/app1.js).
// Proven here in plain Node: (1) the outputs for written cases are
// IDENTICAL to the pristine Beta 1.130 validator's - the expected values
// in fixtures/packfields-cases.json were captured from the 1.130 code
// before the change (field-name re-base, 2026-11-15: the stored field
// was renamed main -> primaries at Andrew's direction, completing Beta
// 1.205 at the storage layer; the cases' input and expected keys were
// renamed in place - values and key order untouched, so the identity
// claim stands modulo the field's name); (2) the list is genuinely the source - a field name
// appended to it (here only) is carried through, and the same field is
// dropped while unlisted; (3) the fences hold - 'snap' is a storage-slot
// field, never a pack field, before and after.
// Beta 1.259 adaptation (deliberate, per the codex review gate on PR #151):
// the format gained ONE optional field, 'ends' (the road-end feather's
// boundary records). The 1.130 identity claim is preserved exactly for the
// 1.130 field set: 'ends' is LAST in construction order, so a pack minus
// its ends key serializes byte-identically to the 1.130 fixture - the I-
// checks compare that form, and assert the new field separately ({} for
// the 1.130 inputs, which carry no ends). T4/T5 pin the new field's own
// lenient-cleaner contract. The fixtures file is NOT edited: its values
// stay what the pristine 1.130 code produced.
import { readFileSync } from 'node:fs';
const app1src = readFileSync(new URL('../../parts/app1.js', import.meta.url), 'utf8');
const createSrc = readFileSync(new URL('../../parts/create-packs.js', import.meta.url), 'utf8'); // Beta 1.134: normalizePack lived in create.js since the app4 split; Tranche 3 B1: normalizePack now lives in create-packs.js
const cases = JSON.parse(readFileSync(new URL('./fixtures/packfields-cases.json', import.meta.url), 'utf8'));
function extract(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error(name + ' not found');
  let d = 0, j = src.indexOf('{', i);
  for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (!d) break; } }
  return src.slice(i, j + 1);
}
function constArray(src, name) { // the literal of `const NAME = [ ... ];`
  const i = src.indexOf('const ' + name + ' =');
  if (i < 0) throw new Error(name + ' not found');
  let d = 0, j = src.indexOf('[', i);
  for (; j < src.length; j++) { if (src[j] === '[') d++; else if (src[j] === ']') { d--; if (!d) break; } }
  return new Function('return ' + src.slice(src.indexOf('[', i), j + 1))();
}
const PACK_FIELDS = constArray(app1src, 'PACK_FIELDS');
const ROUTE_FIELDS = constArray(app1src, 'ROUTE_FIELDS');
function constNum(src, name) { // the value of a numeric const (Beta 1.136: the validator's caps live in app1's rule-constants block, so the sandbox receives them like PACK_FIELDS). The block declares several caps per line (`const A = 60, B = 60`), so a name may be introduced by `const` OR by the chain's comma - matching only `const NAME` silently misses every chained name after the first (fix cycle 2: CI caught PACK_AREA_MAX not found).
  const m = src.match(new RegExp('(?:const |, )' + name + ' = (\\d+)'));
  if (!m) throw new Error(name + ' not found');
  return Number(m[1]);
}
const CAP_NAMES = ['PACK_NAME_MAX', 'PACK_AREA_MAX', 'PACK_STREET_NAME_MAX', 'PACK_STREETS_MAX', 'PACK_SEGS_MAX', 'PACK_SEG_PTS_MAX', 'PACK_POINTS_MAX', 'PACK_TILENAME_MAX', 'PACK_TILENAMES_MAX', 'PACK_BOX_MAX_DEG', 'PACK_LENGTH_MAX_M']; // Beta 1.152 (NV round): the validator gained the extent and total-length ceilings - the sandbox receives them like the other caps
const CAPS = {}; for (const n of CAP_NAMES) CAPS[n] = constNum(app1src, n);
const api = new Function('MLAT', 'MLNG', 'ROADS', 'PACK_FIELDS', ...CAP_NAMES,
  extract(app1src, 'distM') + '\n' + extract(app1src, 'computeRouteBox') + '\n' + extract(createSrc, 'normalizePack') + '\nreturn { normalizePack };')(111320, 80386, {}, PACK_FIELDS, ...CAP_NAMES.map(n => CAPS[n]));
let pass = 0, fail = 0;
const t = (name, cond) => { if (cond) pass++; else { fail++; console.log('FAIL', name); } };
const clone = o => JSON.parse(JSON.stringify(o));
// ---- the list itself ----
t('P1 PACK_FIELDS is exactly the pack format, in construction order',
  JSON.stringify(PACK_FIELDS) === JSON.stringify(['name', 'area', 'primaries', 'spot', 'tileNames', 'box', 'roads', 'reference', 'ends'])); // Beta 1.259: 'ends' joined the format (last, matching the cleaned literal's construction order)
t('P2 fence: snap is in neither PACK_FIELDS nor ROUTE_FIELDS (a slot field, hand-carried at restore scope by design)',
  !PACK_FIELDS.includes('snap') && !ROUTE_FIELDS.includes('snap') &&
  JSON.stringify(ROUTE_FIELDS) === JSON.stringify(['done', 'times', 'hist', 'notes', 'via', 'trail', 'cov', 'start', 'flip', 'sides', 'sess']));
t('P3 the validator caps hold their product values (Beta 1.136: named in app1\'s rule block - a change here is a product decision, never a drift)',
  CAPS.PACK_NAME_MAX === 60 && CAPS.PACK_AREA_MAX === 60 && CAPS.PACK_STREET_NAME_MAX === 60 && CAPS.PACK_STREETS_MAX === 300 && CAPS.PACK_SEGS_MAX === 80 && CAPS.PACK_SEG_PTS_MAX === 4000 && CAPS.PACK_POINTS_MAX === 150000 && CAPS.PACK_TILENAME_MAX === 80 && CAPS.PACK_TILENAMES_MAX === 400);
// ---- identity against the pristine 1.130 outputs ----
const stripEnds = (pack) => { const p = clone(pack); delete p.ends; return p; }; // Beta 1.259: 'ends' is last in construction order, so the stripped form is the 1.130 serialization byte for byte
for (const c of cases) {
  const got = api.normalizePack(clone(c.raw), clone(c.opts));
  t('I-' + c.id + ' ok flag matches 1.130', got.ok === c.expected.ok);
  if (c.expected.ok && got.ok) {
    t('I-' + c.id + ' pack is serialized-identical to 1.130 on the 1.130 field set (values AND key order)', JSON.stringify(stripEnds(got.pack)) === JSON.stringify(c.expected.pack));
    t('I-' + c.id + ' ends defaults to {} (the 1.130 inputs carry no ends)', JSON.stringify(got.pack.ends) === '{}');
  }
  if (!c.expected.ok) t('I-' + c.id + ' error matches 1.130', got.error === c.expected.error);
}
// ---- the trap is dead: the list, not the raw object, decides ----
{ const raw = clone(cases[0].raw); raw.zzzTestField = 'sentinel-1131'; raw.snap = 'must-stay-dropped';
  const before = api.normalizePack(clone(raw), {});
  t('T1 unlisted test field is dropped (and snap stays dropped)', before.ok && !('zzzTestField' in before.pack) && !('snap' in before.pack));
  PACK_FIELDS.push('zzzTestField');
  const after = api.normalizePack(clone(raw), {});
  t('T2 the same field, once listed, is carried through - the list is the source', after.ok && after.pack.zzzTestField === 'sentinel-1131' && !('snap' in after.pack));
  PACK_FIELDS.pop();
  const restored = api.normalizePack(clone(cases[0].raw), clone(cases[0].opts));
  t('T3 list restored: the standard case is identical again (on the 1.130 field set)', JSON.stringify(stripEnds(restored.pack)) === JSON.stringify(cases[0].expected.pack));
}
// ---- Beta 1.259: the ends field's own cleaner contract (lenient by design) ----
{ const raw = clone(cases[0].raw); raw.ends = { Alpha: [[43.8152174, -79.5535312, 43.8151871, -79.5536773]], NotAStreet: [[43.8, -79.55, 43.8, -79.55]], Beta: [['x', -79.55, 43.8, -79.55]] };
  const got = api.normalizePack(clone(raw), {});
  t('T4 ends: a valid record for a cleaned road survives, rounded to 1e-6; records for unknown roads and malformed records drop silently', got.ok && JSON.stringify(got.pack.ends) === JSON.stringify({ Alpha: [[43.815217, -79.553531, 43.815187, -79.553677]] }));
  const raw2 = clone(cases[0].raw); raw2.ends = 'not-an-object';
  const got2 = api.normalizePack(clone(raw2), {});
  t('T5 ends: a non-object ends value cleans to {} and never blocks the pack', got2.ok && JSON.stringify(got2.pack.ends) === '{}');
}
console.log(`packfields selftest: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
