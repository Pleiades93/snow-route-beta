// Phase 4 (C3) test-change gate fixtures: the transaction coordinator decides
// whether a multi-step save committed, rolled back, or degraded - judging logic,
// proven here in plain Node against written cases BEFORE any CI run consumes it.
// Extracts the SHIPPED storeOk/storeFail/txSet/txDel/runTx/finishReconcileAction
// from parts/app1.js by balanced-brace extraction and drives them with FAKE
// storage primitives (the app functions close over lsSet/lsDel/lsGet; the fakes
// are injected through the Function scope, mirroring the app's bool/null contract).
//
// Beta 1.141 (Package A / DA-03): the failing step joins the rollback. txSet/txDel
// tag failures with failKind - 'write' (the write call itself failed: nothing
// landed, the step's prior state stands, no undo is needed) vs 'verify' (the
// write landed or may have, but the read-back disagreed: the step MUST be undone
// and the undo verified, or the outcome is 'degraded'). Cases below pin: the
// failing step undone at first/middle/last position with the REAL primitives
// against a storage whose read-back lies ONCE (the DA-03 repro shape); an
// unverifiable failing-step undo degrading; a 'write'-kind failure consuming no
// undo write. Four pre-1.141 abstract-step expectations changed with the
// contract (a failing step whose failure carries no failKind is treated as
// 'verify' and IS undone) - each is marked inline.
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../../parts/app1.js', import.meta.url), 'utf8');
function extract(name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error(name + ' not found in app1.js');
  let d = 0, j = src.indexOf('{', i);
  for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (!d) break; } }
  return src.slice(i, j + 1);
}
let pass = 0, fail = 0;
const t = (name, cond) => { if (cond) pass++; else { fail++; console.log('FAIL', name); } };
// ---- fake storage: modes per case ----
// setThrows / delThrows: the write call itself fails (globally).
// corrupt: every set stores value+'X' (read-back disagrees, persistently).
// corruptKeys: [k] - only those keys' sets are corrupted.
// setThrowsKeys: [k] - only those keys' set calls fail.
// delLies: delete reports success but the key survives.
// getLiesOnce: [k] - the NEXT read of k lies once (a stored value reads back
//   altered; an absent key reads back a phantom), then reads are honest -
//   the transient read-back failure behind DA-03.
// getThrowsOnNth: { k: n } - the nth raw read (1-based) of k THROWS. The two
//   readers model app1 exactly: lsGet swallows a throw into null (absent),
//   rawRead returns the RAW_READ_FAILED sentinel instead.
function makeFake(mode) {
  const m = new Map();
  const sets = {};
  const lieBudget = {};
  const reads = {};
  for (const k of mode.getLiesOnce || []) lieBudget[k] = 1;
  const RAW_READ_FAILED = {};
  const raw = k => { reads[k] = (reads[k] || 0) + 1; if ((mode.getThrowsOnNth || {})[k] === reads[k]) throw new Error('injected read failure'); if (lieBudget[k]) { lieBudget[k]--; return m.has(k) ? m.get(k) + 'LIE' : 'PHANTOM'; } return m.has(k) ? m.get(k) : null; };
  const lsSet = (k, v) => { sets[k] = (sets[k] || 0) + 1; if (mode.setThrows || (mode.setThrowsKeys || []).includes(k)) return false; m.set(k, (mode.corrupt || (mode.corruptKeys || []).includes(k)) ? v + 'X' : v); return true; };
  const lsDel = k => { if (mode.delThrows) return false; if (!mode.delLies) m.delete(k); return true; };
  const lsGet = k => { try { return raw(k); } catch (e) { return null; } };
  const rawRead = k => { try { return raw(k); } catch (e) { return RAW_READ_FAILED; } };
  return { m, sets, lsSet, lsDel, lsGet, rawRead, RAW_READ_FAILED };
}
function build(mode) {
  const f = makeFake(mode);
  const api = new Function('lsSet', 'lsDel', 'lsGet', 'rawRead', 'RAW_READ_FAILED',
    extract('storeOk') + '\n' + extract('storeFail') + '\n' + extract('txSet') + '\n' + extract('txDel') + '\n' + extract('runTx') + '\n' + extract('finishReconcileAction') + '\n' + extract('finishBoardMatch') + '\n' + extract('finishReconcileNoRunAction') + '\nreturn { txSet, txDel, runTx, finishReconcileAction, finishBoardMatch, finishReconcileNoRunAction };')(f.lsSet, f.lsDel, f.lsGet, f.rawRead, f.RAW_READ_FAILED);
  return { f, api };
}
// ---- txSet / txDel verification semantics ----
{ const { api } = build({}); t('txSet ok when write+readback agree', api.txSet('k', 'v').ok === true); }
{ const { api } = build({ setThrows: true }); const r = api.txSet('k', 'v'); t('txSet fails when the write fails', r.ok === false && r.failedKey === 'k'); }
{ const { api } = build({ corrupt: true }); t('txSet fails when read-back disagrees', api.txSet('k', 'v').ok === false); }
{ const { f, api } = build({}); f.m.set('k', 'v'); t('txDel ok when delete+absence agree', api.txDel('k').ok === true); }
{ const { api } = build({ delThrows: true }); t('txDel fails when the delete fails', api.txDel('k').ok === false); }
{ const { f, api } = build({ delLies: true }); f.m.set('k', 'v'); t('txDel fails when the key survives', api.txDel('k').ok === false); }
// ---- failKind: read-failure identity is preserved (Beta 1.141, DA-03) ----
{ const { api } = build({ setThrows: true }); t("failKind: a failed set call is 'write'", api.txSet('k', 'v').failKind === 'write'); }
{ const { api } = build({ corrupt: true }); t("failKind: a disagreeing read-back is 'verify'", api.txSet('k', 'v').failKind === 'verify'); }
{ const { api } = build({ delThrows: true }); t("failKind: a failed delete call is 'write'", api.txDel('k').failKind === 'write'); }
{ const { f, api } = build({ delLies: true }); f.m.set('k', 'v'); t("failKind: a surviving key after delete is 'verify'", api.txDel('k').failKind === 'verify'); }
{ const { f, api } = build({ getLiesOnce: ['k'] }); f.m.set('k', 'old'); t("failKind: a transiently lying read-back is 'verify'", api.txSet('k', 'new').failKind === 'verify'); }
// ---- runTx ordering + outcomes (abstract steps; a failure with no failKind
// is treated as 'verify', so the failing step's undo RUNS - Beta 1.141) ----
function steps(spec, log) { return spec.map(s => ({ name: s[0], write: () => { log.push('w:' + s[0]); return s[1] ? { ok: true, failedKey: null, retryPending: false } : { ok: false, failedKey: s[0], retryPending: true, ...(s[3] ? { failKind: s[3] } : {}) }; }, undo: () => { log.push('u:' + s[0]); return s[2] ? { ok: true, failedKey: null, retryPending: false } : { ok: false, failedKey: s[0], retryPending: true }; } })); }
{ const { api } = build({}); const log = []; const r = api.runTx(steps([['a', 1, 1], ['b', 1, 1]], log)); t('runTx all commit', r.outcome === 'committed' && r.failedStep === null && log.join() === 'w:a,w:b'); }
{ const { api } = build({}); const log = []; const r = api.runTx(steps([['a', 1, 1], ['b', 0, 1], ['c', 1, 1]], log)); t('runTx failure at b undoes b then a, c never runs (1.141: was w:a,w:b,u:a)', r.outcome === 'rolled-back' && r.failedStep === 'b' && log.join() === 'w:a,w:b,u:b,u:a'); }
{ const { api } = build({}); const log = []; const r = api.runTx(steps([['a', 1, 1], ['b', 1, 1], ['c', 0, 1]], log)); t('runTx rollback order is reverse, failing step first (1.141: was u:b,u:a)', r.outcome === 'rolled-back' && log.join() === 'w:a,w:b,w:c,u:c,u:b,u:a'); }
{ const { api } = build({}); const log = []; const r = api.runTx(steps([['a', 1, 1], ['b', 1, 0], ['c', 0, 1]], log)); t('runTx an undo failure degrades but later undos still run (1.141: failing step undone first)', r.outcome === 'degraded' && r.failedStep === 'c' && log.join() === 'w:a,w:b,w:c,u:c,u:b,u:a'); }
{ const { api } = build({}); const log = []; const r = api.runTx(steps([['a', 0, 1]], log)); t('runTx first-step failure undoes the failing step (1.141: was "rolls nothing back", w:a)', r.outcome === 'rolled-back' && r.failedStep === 'a' && log.join() === 'w:a,u:a'); }
{ const { api } = build({}); const log = []; const r = api.runTx(steps([['a', 1, 1], ['b', 0, 1, 'write']], log)); t("runTx a 'write'-kind failure consumes no undo for the failing step (nothing landed)", r.outcome === 'rolled-back' && r.failedStep === 'b' && r.failKind === 'write' && log.join() === 'w:a,w:b,u:a'); }
{ const { api } = build({}); const r = api.runTx([]); t('runTx empty commits', r.outcome === 'committed'); }
// ---- DA-03 with the REAL primitives: the write lands, the read-back lies
// once, the failing step must be restored to its captured prior and verified.
// Steps mirror finishRun's shapes: undo restores the prior raw (or deletes). ----
function txSteps(api, spec) { return spec.map(s => ({ name: s[0], write: () => s[2] === null ? api.txDel(s[1]) : api.txSet(s[1], s[2]), undo: () => s[3] === null ? api.txDel(s[1]) : api.txSet(s[1], s[3]) })); }
// spec rows: [name, key, writeValue (null = delete), priorValue (null = was absent)]
{ const { f, api } = build({ getLiesOnce: ['b'] }); f.m.set('a', 'A0'); f.m.set('b', 'B0');
  const r = api.runTx(txSteps(api, [['a', 'a', 'A1', 'A0'], ['b', 'b', 'B1', 'B0'], ['c', 'c', 'C1', null]]));
  t('DA-03 middle: rolled-back, failing step restored to its prior, later step never ran', r.outcome === 'rolled-back' && r.failedStep === 'b' && r.failKind === 'verify' && f.m.get('a') === 'A0' && f.m.get('b') === 'B0' && !f.m.has('c')); }
{ const { f, api } = build({ getLiesOnce: ['a'] }); f.m.set('a', 'A0');
  const r = api.runTx(txSteps(api, [['a', 'a', 'A1', 'A0'], ['b', 'b', 'B1', null]]));
  t('DA-03 first: rolled-back, the landed write is put back', r.outcome === 'rolled-back' && r.failedStep === 'a' && f.m.get('a') === 'A0' && !f.m.has('b')); }
{ const { f, api } = build({ getLiesOnce: ['start'] }); f.m.set('start', '123');
  const r = api.runTx(txSteps(api, [['a', 'a', 'A1', null], ['start', 'start', null, '123']]));
  t('DA-03 last (delete): rolled-back, the landed delete is restored', r.outcome === 'rolled-back' && r.failedStep === 'start' && r.failKind === 'verify' && f.m.get('start') === '123' && !f.m.has('a')); }
{ const { f, api } = build({ corruptKeys: ['b'] }); f.m.set('b', 'B0');
  const r = api.runTx(txSteps(api, [['a', 'a', 'A1', null], ['b', 'b', 'B1', 'B0']]));
  t('DA-03 unverifiable undo: outcome is degraded, never a clean rolled-back', r.outcome === 'degraded' && r.failedStep === 'b' && r.failKind === 'verify'); }
{ const { f, api } = build({ setThrowsKeys: ['b'] }); f.m.set('b', 'B0');
  const r = api.runTx(txSteps(api, [['a', 'a', 'A1', null], ['b', 'b', 'B1', 'B0']]));
  t("DA-03 'write'-kind: rolled-back, prior untouched, no undo write consumed", r.outcome === 'rolled-back' && r.failedStep === 'b' && r.failKind === 'write' && f.m.get('b') === 'B0' && f.sets['b'] === 1); }
// ---- thrown verification reads (1.141 verify cycle 1): lsGet reads a thrown
// read as absent, so a delete verified through lsGet could claim success with
// no evidence - txDel verifies through rawRead, where a thrown read is the
// sentinel: a 'verify' failure, never a silent pass. ----
{ const { f, api } = build({ getThrowsOnNth: { k: 1 } }); f.m.set('k', 'v'); const r = api.txDel('k');
  t("thrown read: txDel's verification read throws - failure ('verify'), not success", r.ok === false && r.failKind === 'verify'); }
{ const { f, api } = build({ getLiesOnce: ['b'], getThrowsOnNth: { a: 2 } }); f.m.set('b', 'B0');
  const r = api.runTx(txSteps(api, [['a', 'a', 'A1', null], ['b', 'b', 'B1', 'B0']]));
  t('thrown read: an undo delete whose verification read throws degrades the rollback', r.outcome === 'degraded' && r.failedStep === 'b' && r.failKind === 'verify' && !f.m.has('a') && f.m.get('b') === 'B0'); }
// ---- finishReconcileAction truth table ----
{ const { api } = build({}); const A = api.finishReconcileAction;
  t('reconcile: no start -> none', A(0, 111, false) === 'none' && A(0, 111, true) === 'none');
  t('reconcile: no archive -> none', A(111, 0, false) === 'none');
  t('reconcile: different run -> none', A(222, 111, false) === 'none' && A(222, 111, true) === 'none');
  t('reconcile: match + live board -> rollback', A(111, 111, false) === 'rollback');
  t('reconcile: match + empty board -> complete', A(111, 111, true) === 'complete');
  // Round 103 (CG-103-02): the second argument is now the archive entry's
  // dedicated run identity (runId), no longer its startedAt - strictness is
  // the whole fix: a near-miss or a previous run's identity must NEVER match
  // (the <= alternative was rejected in debate - it could delete a legitimate
  // archive mid-run), and an entry carrying no identity matches nothing.
  t('reconcile: near-miss identity -> none (no tolerance)', A(111, 112, false) === 'none' && A(112, 111, true) === 'none');
  t('reconcile: previous run identity vs new start -> none', A(999999, 111, false) === 'none' && A(999999, 111, true) === 'none');
  t('reconcile: entry without identity -> none', A(111, 0, false) === 'none' && A(111, 0, true) === 'none'); }
// ---- Beta 1.146 (census C1): the NO-RUN interrupted finish. finishRun stamps
// a run-less archive entry's runId with the finclean marker's at (one finish,
// one identity), and reconcile's no-run branch removes the phantom ONLY on
// the full signature: marker run 0, entry runId === marker at (truthy), the
// board non-empty and still equalling the entry's own snapshot exactly. ----
{ const { api } = build({}); const N = api.finishReconcileNoRunAction, M = api.finishBoardMatch;
  const NAMES = ['Velmar', 'Astona'];
  const entry = { runId: 555, sides: { p: { Velmar: [3, 1], Astona: [0, 0] }, t: { Velmar: [['2026-11-08T10:00:00.000Z', null], [null, '2026-11-08T10:05:00.000Z']], Astona: [] } } };
  const boardP = { Velmar: [3, 1], Astona: [0, 0] };
  const boardT = { Velmar: [['2026-11-08T10:00:00.000Z', null], [null, '2026-11-08T10:05:00.000Z']], Astona: [] };
  t('norun board: the loaded board equals the entry snapshot exactly', M(entry, boardP, boardT, NAMES) === true);
  t('norun board: a sparse in-memory stamp array matches its stored (JSON) twin - holes read as null', M(entry, boardP, { Velmar: [['2026-11-08T10:00:00.000Z', null], [, '2026-11-08T10:05:00.000Z']], Astona: [] }, NAMES) === true);
  t('norun board: one differing piece value -> no match', M(entry, { Velmar: [3, 0], Astona: [0, 0] }, boardT, NAMES) === false);
  t('norun board: one differing stamp -> no match', M(entry, boardP, { Velmar: [['2026-11-08T10:00:00.000Z', null], [null, '2026-11-08T10:06:00.000Z']], Astona: [] }, NAMES) === false);
  t('norun board: an entry without a sides snapshot -> no match (fail-closed)', M({ runId: 555 }, boardP, boardT, NAMES) === false && M(null, boardP, boardT, NAMES) === false);
  t('norun: interrupted (marker run 0, runId === at, board live + matching) -> rollback (entry removed)', N(0, 555, 555, false, true) === 'rollback');
  t('norun: completed finish (board empty) -> none (the entry stands)', N(0, 555, 555, true, false) === 'none' && N(0, 555, 555, true, true) === 'none');
  t('norun: marker absent -> none', N(null, 0, 555, false, true) === 'none' && N(undefined, 0, 555, false, true) === 'none');
  t('norun: marker of a RUN finish (run !== 0) -> none', N(444, 555, 555, false, true) === 'none');
  t('norun: entry/board mismatch -> none (nothing removed)', N(0, 555, 555, false, false) === 'none');
  t('norun: marker/runId mismatch -> none (nothing removed)', N(0, 555, 556, false, true) === 'none' && N(0, 556, 555, false, true) === 'none');
  t('norun: entry without runId -> none', N(0, 555, 0, false, true) === 'none'); }
console.log(`tx selftest: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
