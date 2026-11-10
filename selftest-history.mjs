// History retention fixtures. HISTORY: through Beta 1.166 this file proved
// the 10-entry CAP (Round 103, CG-103-01: isFullRun/trimHistory/
// trimHistoryForFinish extracted from parts/app1.js and driven against the
// eviction cases B1-B8/C1-C3). Beta 1.167 (run/pace fix round, B1 - Andrew's
// requirement, audit RP-03/RP-01) RETIRED the cap at all four enforcement
// points, so the fixture now proves the opposite contract: appendHistory
// retains EVERYTHING, in order, at any size - and the cap functions are
// ABSENT from the shipped sources (a re-introduced cap fails here, in plain
// Node, before any CI run consumes it). Page-level proof: drive177/drive186.
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../../parts/app1.js', import.meta.url), 'utf8');
const src3 = readFileSync(new URL('../../parts/app3.js', import.meta.url), 'utf8');
const src4 = readFileSync(new URL('../../parts/app4.js', import.meta.url), 'utf8');
function extract(name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error(name + ' not found in app1.js');
  let d = 0, j = src.indexOf('{', i);
  for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (!d) break; } }
  return src.slice(i, j + 1);
}
const api = new Function(extract('appendHistory') + '\nreturn { appendHistory };')();
let pass = 0, fail = 0;
const t = (name, cond) => { if (cond) pass++; else { fail++; console.log('FAIL', name); } };
const entry = (tag, nItems) => ({ at: 'T' + tag, items: Object.fromEntries(Array.from({ length: nItems }, (_, i) => ['S' + i, null])) });
const full = tag => entry(tag, 34);
const partial = (tag, n) => entry(tag, n || 3);
const tags = list => list.map(h => h.at).join(',');
// ---- retention: the append NEVER evicts, at any size ----
{ const old = Array.from({ length: 10 }, (_, i) => full(i)); const inc = partial('new');
  const out = api.appendHistory(old, inc);
  t('R1 10 full (the old cap) + incoming partial: 11 retained, incoming last, order kept', out.length === 11 && out[10] === inc && tags(out) === 'T0,T1,T2,T3,T4,T5,T6,T7,T8,T9,Tnew'); }
{ const old = Array.from({ length: 12 }, (_, i) => i === 3 ? partial(i) : full(i)); const inc = partial('new');
  const out = api.appendHistory(old, inc);
  t('R2 over the old cap already: 13 retained, nothing dropped - not even the non-full entry', out.length === 13 && out[12] === inc && tags(out).startsWith('T0,T1,T2,T3,')); }
{ const out = api.appendHistory([], partial('new'));
  t('R3 empty + incoming: 1', out.length === 1 && out[0].at === 'Tnew'); }
{ const old = [full(0), partial(1), full(2)]; const inc = partial('new');
  const out = api.appendHistory(old, inc);
  t('R4 short list: plain append', out.length === 4 && out[3] === inc && tags(out) === 'T0,T1,T2,Tnew'); }
{ const old = Array.from({ length: 10 }, (_, i) => full(i)); const inc = partial('new');
  const out = api.appendHistory(old, inc);
  t('R5 inputs are not mutated; a new array is returned', old.length === 10 && out !== old && inc.at === 'Tnew'); }
{ let list = []; for (let i = 0; i < 25; i++) list = api.appendHistory(list, full(i));
  t('R6 25 sequential finishes: 25 retained in order', list.length === 25 && tags(list) === Array.from({ length: 25 }, (_, i) => 'T' + i).join(',')); }
// ---- the cap is ABSENT from the shipped sources (all four enforcement points) ----
t('S1 app1: no trimHistory definition', !src.includes('function trimHistory('));
t('S2 app1: no trimHistoryForFinish definition', !src.includes('function trimHistoryForFinish('));
t('S3 app1: no capHistoryList definition', !src.includes('function capHistoryList('));
t('S4 app1: no isFullRun definition (the eviction judge is gone with the cap)', !src.includes('function isFullRun('));
t('S5 app3: finish no longer calls the finish trim', !src3.includes('trimHistoryForFinish('));
t('S6 app4: restore no longer calls the linear cap', !src4.includes('capHistoryList('));
t('S7 app1: saveHistory writes history whole (no trim call on the save path)', !/function saveHistory\(\) \{[^}]*trim/.test(src));
console.log(`history selftest: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
