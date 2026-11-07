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
// before the change; (2) the list is genuinely the source - a field name
// appended to it (here only) is carried through, and the same field is
// dropped while unlisted; (3) the fences hold - 'snap' is a storage-slot
// field, never a pack field, before and after.
import { readFileSync } from 'node:fs';
const app1src = readFileSync(new URL('../../parts/app1.js', import.meta.url), 'utf8');
const createSrc = readFileSync(new URL('../../parts/create.js', import.meta.url), 'utf8'); // Beta 1.134: normalizePack lives in create.js since the app4 split
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
const api = new Function('MLAT', 'MLNG', 'ROADS', 'PACK_FIELDS',
  extract(app1src, 'distM') + '\n' + extract(app1src, 'computeRouteBox') + '\n' + extract(createSrc, 'normalizePack') + '\nreturn { normalizePack };')(111320, 80386, {}, PACK_FIELDS);
let pass = 0, fail = 0;
const t = (name, cond) => { if (cond) pass++; else { fail++; console.log('FAIL', name); } };
const clone = o => JSON.parse(JSON.stringify(o));
// ---- the list itself ----
t('P1 PACK_FIELDS is exactly the pack format, in construction order',
  JSON.stringify(PACK_FIELDS) === JSON.stringify(['name', 'area', 'main', 'spot', 'tileNames', 'box', 'roads', 'reference']));
t('P2 fence: snap is in neither PACK_FIELDS nor ROUTE_FIELDS (a slot field, hand-carried at restore scope by design)',
  !PACK_FIELDS.includes('snap') && !ROUTE_FIELDS.includes('snap') &&
  JSON.stringify(ROUTE_FIELDS) === JSON.stringify(['done', 'times', 'hist', 'notes', 'via', 'trail', 'cov', 'start', 'flip', 'sides', 'sess']));
// ---- identity against the pristine 1.130 outputs ----
for (const c of cases) {
  const got = api.normalizePack(clone(c.raw), clone(c.opts));
  t('I-' + c.id + ' ok flag matches 1.130', got.ok === c.expected.ok);
  if (c.expected.ok && got.ok) t('I-' + c.id + ' pack is serialized-identical to 1.130 (values AND key order)', JSON.stringify(got.pack) === JSON.stringify(c.expected.pack));
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
  t('T3 list restored: the standard case is identical again', JSON.stringify(restored.pack) === JSON.stringify(cases[0].expected.pack));
}
console.log(`packfields selftest: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
