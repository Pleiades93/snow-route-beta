import { launchDrive, finish, bootThrough, loadRoutePolled } from './harness.mjs';
const { proc, ev, consoleLog, sleep, poll } = await launchDrive();
await bootThrough(ev, poll);

// drive224: Beta 1.287 (issue #172) - the merge restore's own claims, in one
// place: a backup adds the records the resident lacks and nothing else;
// shared records keep the resident payload byte-for-byte; keys the backup
// does not carry keep their complete raw strings; a second import of the
// same backup writes nothing and reloads nothing; pre-ID history entries
// import by their full-stamp fingerprint (Andrew's ruling) while exact
// duplicates are skipped; a resident live run's cluster is held whole
// against a foreign cluster; a malformed carried value refuses the whole
// restore rather than losing a resident record; settings fill field by
// field; a trail carried alone does not land beside resident markers.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };
const RK = { done: 'snowroute.5w.v2', times: 'snowroute.5w.v2.times', hist: 'snowroute.5w.v2.history', notes: 'snowroute.5w.v4.notes', cov: 'snowroute.5w.v4.cov', trail: 'snowroute.5w.v4.trail', sess: 'snowroute.5w.v5.sess', start: 'snowroute.5w.v5.start', snap: 'snowroute.5w.v5.snap', settings: 'snowroute.v2.settings' };
const snap5w = async () => JSON.parse(await ev(`(() => { const o = {}; for (const k of Object.values(${JSON.stringify(RK)})) o[k] = localStorage.getItem(k); return JSON.stringify(o); })()`));
const T1 = '2026-01-05T12:00:00.000Z', T2 = '2026-01-05T12:20:00.000Z', T3 = '2026-01-06T09:00:00.000Z', T4 = '2026-01-07T09:00:00.000Z';

try {
  // ---- M1: the union lands; resident payloads and untouched keys are byte-exact ----
  const histA = { at: T2, runId: 1767650100000, via: 'manual', items: { Astona: T1 }, notes: {}, km: 3.1 };
  const histB = { at: T3, runId: 1767740100000, via: 'gps', items: { Mellings: T3 }, notes: {}, km: 5.2 };
  await ev(`(() => { const rk = routeKeys('5w');
    localStorage.setItem(rk.done, '["Astona"]');
    localStorage.setItem(rk.times, ${JSON.stringify(JSON.stringify({ Astona: T1 }))});
    localStorage.setItem(rk.notes, ${JSON.stringify(JSON.stringify({ Astona: [{ k: 'note', at: T1, text: 'resident note' }] }))});
    localStorage.setItem(rk.hist, ${JSON.stringify(JSON.stringify([histA]))});
    localStorage.setItem(rk.cov, ${JSON.stringify(JSON.stringify({ Astona: [0, 1] }))});
    return true; })()`);
  const bk1 = { app: 'snowroute-backup', v: 2, at: T4, routes: { '5w': {
    done: '["Mellings"]', times: JSON.stringify({ Mellings: T3 }),
    notes: JSON.stringify({ Mellings: [{ k: 'note', at: T3, text: 'backup note' }] }),
    hist: JSON.stringify([histB]) } } };
  await ev(`(() => { window.__d224probe = 1; restoreBackup(${JSON.stringify(bk1)}); return true; })()`);
  await sleep(2500);
  const gone1 = await ev(`typeof window.__d224probe === 'undefined'`);
  ok('M1 a writing merge reloads', gone1 === true);
  await loadRoutePolled(ev, sleep);
  const m1 = await snap5w();
  ok('M1 done is the union, resident first | ' + m1[RK.done], m1[RK.done] === '["Astona","Mellings"]');
  ok('M1 times is the union with the resident payload intact | ' + m1[RK.times], m1[RK.times] === JSON.stringify({ Astona: T1, Mellings: T3 }));
  ok('M1 notes is the union with the resident entry intact | ' + m1[RK.notes], m1[RK.notes] === JSON.stringify({ Astona: [{ k: 'note', at: T1, text: 'resident note' }], Mellings: [{ k: 'note', at: T3, text: 'backup note' }] }));
  ok('M1 history gains the backup entry, the resident entry byte-identical | ' + m1[RK.hist], m1[RK.hist] === JSON.stringify([histA, histB]));
  ok('M1 a key the backup does not carry keeps its complete raw string', m1[RK.cov] === JSON.stringify({ Astona: [0, 1] }));

  // ---- M2: the same backup again writes nothing and reloads nothing ----
  const before2 = await snap5w();
  const toast2 = await ev(`(() => { window.__d224probe = 1; restoreBackup(${JSON.stringify(bk1)}); return $('toast').textContent; })()`);
  await sleep(1500);
  const same2 = await ev(`typeof window.__d224probe !== 'undefined'`);
  const after2 = await snap5w();
  ok('M2 double import reports added-nothing, does not reload, and every key is byte-identical | ' + toast2,
    toast2.includes('Backup added nothing') && same2 === true && JSON.stringify(after2) === JSON.stringify(before2));

  // ---- M3: pre-ID history imports by fingerprint; exact duplicates are skipped ----
  const legA = { at: T2, via: 'manual', items: { Velmar: T1 }, notes: {}, km: 2.4 };
  const legB = { at: T4, via: 'manual', items: { Velmar: T4, Astona: T4 }, notes: {}, km: 6.8 };
  await ev(`(() => { localStorage.setItem(routeKeys('5w').hist, ${JSON.stringify(JSON.stringify([legA]))}); return true; })()`);
  const bk3 = { app: 'snowroute-backup', v: 2, at: T4, routes: { '5w': { hist: JSON.stringify([legA, legB]) } } };
  await ev(`(() => { restoreBackup(${JSON.stringify(bk3)}); return true; })()`);
  await sleep(2500); await loadRoutePolled(ev, sleep);
  const m3raw = await J(`localStorage.getItem(routeKeys('5w').hist)`);
  const m3 = JSON.parse(m3raw || '[]');
  ok('M3 a pre-ID entry imports into a populated history by fingerprint; its exact duplicate is skipped | n=' + m3.length,
    m3.length === 2 && JSON.stringify(m3[0]) === JSON.stringify(legA) && JSON.stringify(m3[1]) === JSON.stringify(legB));

  // ---- M4: a resident live run's cluster is held whole against a foreign cluster ----
  const snapR = JSON.stringify({ at: 1767650300000, pieces: { Velmar: [3] }, pieceTimes: { Velmar: [[T1, null]] }, done: [], times: {}, via: {}, cov: {} });
  await ev(`(() => { const rk = routeKeys('5w');
    localStorage.setItem(rk.start, '1767650300000'); localStorage.setItem(rk.snap, ${JSON.stringify(snapR)});
    localStorage.setItem(rk.trail, '[[43.82,-79.567,1767650400]]'); localStorage.setItem(rk.sess, '[1767650300]');
    return true; })()`);
  const clusterBefore = await snap5w();
  const snapF = JSON.stringify({ at: 1767740300000, pieces: { Velmar: [0] }, pieceTimes: { Velmar: [[null, null]] }, done: [], times: {}, via: {}, cov: {} });
  const bk4 = { app: 'snowroute-backup', v: 2, at: T4, routes: { '5w': {
    start: '1767740300000', snap: snapF, trail: '[[43.9,-79.6,1767740400]]', sess: '[1767740300]',
    notes: JSON.stringify({ Galloway: [{ k: 'note', at: T4, text: 'cluster-era note' }] }) } } };
  await ev(`(() => { restoreBackup(${JSON.stringify(bk4)}); return true; })()`);
  await sleep(2500); await loadRoutePolled(ev, sleep);
  const m4 = await snap5w();
  ok('M4 the resident cluster (start, snapshot, trail, markers) is byte-identical after a foreign cluster backup',
    m4[RK.start] === clusterBefore[RK.start] && m4[RK.snap] === clusterBefore[RK.snap] && m4[RK.trail] === clusterBefore[RK.trail] && m4[RK.sess] === clusterBefore[RK.sess]);
  ok('M4 the rest of that backup still merges (its note landed)', (m4[RK.notes] || '').includes('cluster-era note'));

  // ---- M5: a malformed carried value refuses the whole restore; nothing is lost ----
  const before5 = await snap5w();
  const bk5 = { app: 'snowroute-backup', v: 2, at: T4, routes: { '5w': { notes: '{"Velmar": [broken', done: '["Galloway"]' } } };
  const toast5 = await ev(`(() => { window.__d224probe = 1; restoreBackup(${JSON.stringify(bk5)}); return $('toast').textContent; })()`);
  await sleep(1200);
  const same5 = await ev(`typeof window.__d224probe !== 'undefined'`);
  const after5 = await snap5w();
  ok('M5 a malformed carried value refuses the restore whole - no reload, no key changes, the addable record in the same file does not land either | ' + toast5,
    same5 === true && /not valid JSON|Restore stopped/.test(toast5) && JSON.stringify(after5) === JSON.stringify(before5));

  // ---- M6: settings fill field by field; the resident field wins ----
  await ev(`(() => { localStorage.setItem('${RK.settings}', '{"vib":true}'); return true; })()`);
  const bk6 = { app: 'snowroute-backup', v: 2, at: T4, routes: {}, settings: '{"vib":false,"chime":true}' };
  await ev(`(() => { restoreBackup(${JSON.stringify(bk6)}); return true; })()`);
  await sleep(2500); await loadRoutePolled(ev, sleep);
  const m6raw = await J(`localStorage.getItem('${RK.settings}')`);
  const m6 = JSON.parse(m6raw || '{}');
  ok('M6 settings merge by field: the absent chime fills, the resident vib stands | ' + JSON.stringify(m6), m6.vib === true && m6.chime === true);

  // ---- M7: a trail carried alone does not land beside resident markers ----
  await ev(`(() => { const rk = routeKeys('5w'); localStorage.removeItem(rk.trail); localStorage.setItem(rk.sess, '[1762000000]'); localStorage.removeItem(rk.start); return true; })()`);
  const bk7 = { app: 'snowroute-backup', v: 2, at: T4, routes: { '5w': { trail: '[[43.8,-79.5,1762000100]]' } } };
  const toast7 = await ev(`(() => { window.__d224probe = 1; restoreBackup(${JSON.stringify(bk7)}); return $('toast').textContent; })()`);
  await sleep(1200);
  const m7 = await snap5w();
  ok('M7 a trail-only backup adds nothing beside resident markers (markers stand, no trail lands) | ' + toast7,
    toast7.includes('Backup added nothing') && m7[RK.sess] === '[1762000000]' && m7[RK.trail] === null);
  // ---- M13: an imported run's Cancel baseline keeps resident marks ----
  // Build a genuine running backup in-page: Velmar marked before Start,
  // unmarked mid-run (its snapshot holds the mark, its board does not).
  await ev(`(() => { localStorage.clear(); location.reload(); return true; })()`); await sleep(1500);
  await loadRoutePolled(ev, sleep);
  await ev(`togglePiece('Velmar', 0, 0); true`); await sleep(250);
  await ev(`startClean(); true`); await sleep(250);
  await ev(`togglePiece('Velmar', 0, 0); true`); await sleep(250);
  const bkRun = JSON.parse(JSON.parse(JSON.stringify(await ev(`buildBackup()`))));
  await ev(`cancelStart(); true`); await sleep(300);
  // Resident phone: a Mellings mark, no run records at all.
  await ev(`(() => { localStorage.clear(); location.reload(); return true; })()`); await sleep(1500);
  await loadRoutePolled(ev, sleep);
  await ev(`togglePiece('Mellings', 0, 0); true`); await sleep(250);
  const residentStart = await ev(`localStorage.getItem(routeKeys('5w').start)`);
  await ev(`(() => { restoreBackup(${JSON.stringify(bkRun)}); return true; })()`);
  await sleep(2500); await loadRoutePolled(ev, sleep);
  await poll(`typeof cancelStart === 'function' && runStart > 0`, 30000);
  const pre13 = JSON.parse(await ev(`(() => JSON.stringify({ run: runStart, mellings: pieces.Mellings[0], velmar: pieces.Velmar[0] }))()`));
  ok('M13 setup: resident had no run; the imported run is active and the resident mark survived the merge | ' + JSON.stringify(pre13),
    residentStart === null && pre13.run > 0 && (pre13.mellings & 1) === 1 && (pre13.velmar & 1) === 0);
  await ev(`cancelStart(); true`); await sleep(300);
  const post13 = JSON.parse(await ev(`(() => JSON.stringify({ run: runStart, mellings: pieces.Mellings[0], velmar: pieces.Velmar[0] }))()`));
  ok('M13 Cancel of the imported run keeps the resident mark (the baseline is the union, not the foreign snapshot alone) | ' + JSON.stringify(post13),
    post13.run === 0 && (post13.mellings & 1) === 1);
  ok('M13 Cancel still restores the snapshot own pre-Start mark | ' + JSON.stringify(post13),
    post13.run === 0 && (post13.velmar & 1) === 1);
} catch (e) {
  R.fatal = String(e && e.message || e);
}
R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String((c.args && c.args[0]) || c.text || '').slice(0, 220));
finish(R, proc);
