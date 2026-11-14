import { launchDrive, finish, bootThrough } from './harness.mjs';
const { proc, ev, consoleLog, sleep, poll } = await launchDrive();
await bootThrough(ev, poll);

// drive187: Beta 1.167 (run/pace fix round) - B3 honest durations, B4 legacy
// cleans, B5 trail-cap honesty, in a real page.
//   B3: a crafted clean whose streets took 30 min but whose Finish tap came
//      30 min later shows BOTH intervals under truthful labels ('Streets
//      done in' vs 'Total elapsed', RP-08) with the pace basis stated; a
//      whole-street mark reads 'marked in one go', not the previous street's
//      gap (RP-07); the stamp-less fallback reads 'Gap since previous
//      street'; and a skewed entry (startedAt after a completion) renders
//      no negative duration anywhere.
//   B4: a timestamp-less legacy clean (every item time null) is LISTED in
//      Saved cleans ('time not recorded'), opens, and deletes through
//      the same two-tap flow (RP-04).
//   B5: a run whose trail crosses the 8,000-point cap archives the counter's
//      TRUE distance (banked 50.0 km + the recorded fixes), not the
//      truncated path's figure, and carries pathShortened (RP-02); the
//      counter record is consumed at Finish. Control: an ordinary short run
//      archives exactly its trailKm figure and no flag.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };
const waitBoot = async () => { for (let i = 0; i < 40; i++) { try { if (await ev(`typeof restoreBackup === 'function' && !!document.getElementById('ver')`)) return true; } catch (e) {} await sleep(400); } return false; };
const toMenu = async () => { await ev(`localStorage.clear(); location.reload(); true`); await waitBoot(); await sleep(2200); };

try {
  // ---- B3: honest durations ----
  const b3 = await J(`(() => {
    const T0 = Date.now() - 86400000, iso = ms => new Date(ms).toISOString();
    const P = (n, v) => STRETCH[n].parts.map(() => v);
    const entryA = { at: iso(T0 + 3600000), startedAt: iso(T0), km: 1.2, via: {}, notes: {},
      items: { Astona: iso(T0 + 1500000), Velmar: iso(T0 + 1800000), Mellings: iso(T0 + 1800000) },
      sides: { p: { Astona: P('Astona', 0), Velmar: P('Velmar', 3), Mellings: P('Mellings', 3) },
               t: { Astona: STRETCH.Astona.parts.map(() => [null, null]), Velmar: STRETCH.Velmar.parts.map(() => [iso(T0 + 600000), iso(T0 + 1200000)]), Mellings: STRETCH.Mellings.parts.map(() => [iso(T0 + 1800000), iso(T0 + 1800000)]) } } };
    const entryB = { at: iso(T0 + 7200000), startedAt: iso(T0 + 3600000), km: 0, via: {}, notes: {},
      items: { Velmar: iso(T0 + 600000) }, sides: { p: {}, t: {} } };
    history = [entryA, entryB]; saveHistory();
    openClean(0);
    const rowFor = nm => [...document.querySelectorAll('.cvRow')].find(x => { const n = x.querySelector('.cvNm'); return n && n.textContent === nm; });
    const read = nm => { const r = rowFor(nm); if (!r) return { tm: '', det: '' }; r.click(); return { tm: r.querySelector('.cvTm').textContent, det: r.querySelector('.cvDet').textContent }; };
    const aA = read('Astona'), aV = read('Velmar'), aM = read('Mellings');
    const metaA = document.querySelector('.cvMeta').textContent;
    openClean(1);
    const bV = read('Velmar');
    const metaB = document.querySelector('.cvMeta').textContent;
    return { metaA, metaB, aA, aV, aM, bV, f30: fmtDur(1800000), f60: fmtDur(3600000), f10: fmtDur(600000), f25: fmtDur(1500000) };
  })()`);
  ok('B3a the detail shows BOTH intervals, labelled: streets done in ' + b3.f30 + ', total elapsed ' + b3.f60 + ' | ' + (b3.metaA || '').slice(0, 120),
    (b3.metaA || '').includes('Streets done in ' + b3.f30) && (b3.metaA || '').includes('Total elapsed ' + b3.f60));
  ok('B3b the pace is shown with its basis stated (work / total elapsed)', (b3.metaA || '').includes('Pace ') && (b3.metaA || '').includes('(work / total elapsed)'));
  ok('B3c a street with real side stamps keeps its span | ' + b3.aV.tm, (b3.aV.tm || '').includes('span ' + b3.f10));
  ok('B3d a whole-street mark (all sides at one moment) reads marked-in-one-go, in the row AND the detail | ' + b3.aM.tm,
    (b3.aM.tm || '').includes('marked in one go') && (b3.aM.det || '').includes('Marked in one go'));
  ok('B3e the stamp-less fallback is a truthfully-labelled gap | ' + b3.aA.det.slice(0, 80),
    (b3.aA.det || '').includes('Gap since previous street: ' + b3.f25));
  ok('B3f a skewed entry (startedAt after the completion) renders NO negative duration: no gap in the row, no gap line in the detail | ' + JSON.stringify(b3.bV),
    !(b3.bV.tm || '').includes('gap') && !(b3.bV.det || '').includes('Gap since') && (b3.metaB || '').includes('Total elapsed'));

  // ---- B4: the legacy clean is listed, opens, and deletes ----
  const b4seed = await J(`(() => { const iso = new Date(Date.now() - 86400000).toISOString(); history = [{ at: iso, items: { Velmar: null, Mellings: null }, via: {}, notes: {}, sides: { p: {}, t: {} }, km: 0, startedAt: null }]; saveHistory(); histOpen = true; renderPace(); const rows = [...document.querySelectorAll('.histRow')]; return { n: rows.length, text: rows.length ? rows[0].textContent : '' }; })()`);
  ok('B4a the timestamp-less legacy clean is LISTED in Saved cleans as time-not-recorded | ' + JSON.stringify(b4seed),
    b4seed.n === 1 && (b4seed.text || '').includes('time not recorded'));
  await ev(`document.querySelector('.histRow').click(); true`); await sleep(400);
  const b4open = await J(`({ ttl: (document.querySelector('.cvTtl') || {}).textContent || '', sub: (document.querySelector('.cvSub') || {}).textContent || '', want: fmtDate3(history[0].at), del: !!document.querySelector('.cvDel') })`);
  ok('B4b the legacy clean OPENS in the detail view (Beta 1.184 header: the date + a streets/finished sub-line) with its delete button | ' + JSON.stringify(b4open),
    (b4open.ttl || '') === b4open.want && (b4open.sub || '').includes('2 streets · finished') && b4open.del === true);
  await ev(`document.querySelector('.cvDel').click(); true`); await sleep(200);
  const b4arm = await J(`(document.querySelector('.cvDel') || {}).textContent || ''`);
  await ev(`document.querySelector('.cvDel').click(); true`); await sleep(400);
  const b4done = await J(`({ n: history.length, stored: localStorage.getItem(routeKeys('5w').hist) })`);
  ok('B4c the two-tap delete removes the legacy clean from memory AND storage | armed="' + b4arm + '" ' + JSON.stringify(b4done),
    (b4arm || '').includes('Tap again to confirm') && b4done.n === 0 && b4done.stored === '[]');

  // ---- B5: window honesty (Beta 1.193 re-derivation: was trail-cap honesty) ----
  await toMenu();
  await ev(`loadRoute('5w'); true`); await sleep(600);
  await J(`(() => {
    runStart = Date.now() - 3 * 3600000; saveStart();
    const runSec = Math.floor(runStart / 1000);
    trail = []; for (let i = 0; i < 7999; i++) trail.push([+(43.8 + i * 0.000001).toFixed(6), -79.4, runSec + i]);
    localStorage.setItem(LS.rundist, JSON.stringify({ run: runStart, m: 50000, capped: false })); // a 1.190-shape banked record: the retired capped field rides along and must be tolerated (read for run + m, ignored)
    runDist = { run: 0, m: 0 };
    gpsFromRun = true;
    markDone('Velmar', 'tap'); markDone('Mellings', 'tap'); markDone('Astona', 'tap');
    return true;
  })()`);
  for (let k = 0; k < 3; k++) { await ev(`acceptFix({ coords: { latitude: ${43.80801 + k * 0.00001}, longitude: -79.4, accuracy: 5, speed: 3, heading: 90 }, timestamp: Date.now() }); true`); await sleep(150); }
  const pre = await J(`({ m: runDist.m, hasCapped: 'capped' in runDist, trailLen: trail.length })`);
  ok('B5a (Beta 1.193) at the first appends the planted 2.2 h trail collapses to the 60-minute window (about 800 points, not the 8000 cap) while the counter keeps the banked 50 km - and carries no capped field | ' + JSON.stringify(pre),
    pre.trailLen > 700 && pre.trailLen < 900 && pre.hasCapped === false && pre.m >= 50000);
  await ev(`finishRun(); true`); await sleep(500);
  await ev(`flushAux(true); true`); // the page-death flush lands the cleared trail's buffered write before storage is read
  const post = await J(`(() => { const e = history[history.length - 1] || {}; return { km: e.km, flag: e.pathShortened === true, hasPath: 'path' in e, wantKm: +(${(pre.m || 0)} / 1000).toFixed(1), trailKmNow: +trailKm(runStart || 1).toFixed(1), rundist: localStorage.getItem(routeKeys('5w').rundist), rundist2: localStorage.getItem(routeKeys('5w').rundist2), trailStored: localStorage.getItem(routeKeys('5w').trail) }; })()`);
  ok('B5b the archive km is the counter TRUE total, not the window figure | ' + JSON.stringify(post),
    post.km === post.wantKm && post.km > post.trailKmNow + 10);
  ok('B5c (Beta 1.193) the entry carries NO truncation flag and NO archived path (both retired with the capped trail), both counter records are consumed at Finish, and the stored trail is cleared with the run',
    post.flag === false && post.hasPath === false && post.rundist === null && post.rundist2 === null && post.trailStored === '[]');
  const ctl = await J(`(() => { runStart = Date.now() - 600000; saveStart(); trail = []; runDist = { run: 0, m: 0 }; localStorage.removeItem(routeKeys('5w').rundist); localStorage.removeItem(routeKeys('5w').rundist2); gpsFromRun = true; markDone('Velmar', 'tap'); markDone('Mellings', 'tap'); markDone('Astona', 'tap'); return true; })()`);
  for (let k = 0; k < 3; k++) { await ev(`acceptFix({ coords: { latitude: ${43.81 + k * 0.0001}, longitude: -79.41, accuracy: 5, speed: 3, heading: 90 }, timestamp: Date.now() }); true`); await sleep(150); }
  const ctlPre = await J(`({ m: runDist.m, tk: +trailKm(runStart).toFixed(1) })`);
  await ev(`finishRun(); true`); await sleep(500);
  const ctlPost = await J(`(() => { const e = history[history.length - 1] || {}; return { km: e.km, hasFlag: 'pathShortened' in e, hasPath: 'path' in e }; })()`);
  ok('B5d control: an ordinary short run archives exactly its trail figure, counter and trail agree, and NO flag and NO path are carried | ' + JSON.stringify({ ctlPre, ctlPost }),
    ctlPost.km === ctlPre.tk && ctlPost.km === +(ctlPre.m / 1000).toFixed(1) && ctlPost.hasFlag === false && ctlPost.hasPath === false);

  // ---- P2 (Beta 1.186, storage fix round): the counter can no longer come back
  // stale from a mid-run reload. Through 1.185 (i) flushAux's forced flush never
  // banked the counter, so inside the 30 s / 25 m throttle window the banked
  // record lagged the run, and (ii) adoptRunDist believed a matching banked
  // record verbatim, so buildSnap archived the stale figure while the
  // fully-flushed trail measured more. The fixes: a forced flush banks the
  // counter past its throttle (app1), and adoption reconciles an UNCAPPED
  // record against the surviving trail (app3) - a CAPPED record keeps the
  // counter as sole authority, its trail being truncated by design.
  // Beta 1.193 (trail redesign + counter hardening) restates the family: the
  // throttle is GONE (the bank lands on every fix), the capped flag is retired
  // (under the window, adoption is a plain max() over lower bounds - primary,
  // mirror, trail derivation - which can raise a stale bank but never reduce
  // one), and a second copy rides LS.rundist2. P2a keeps its shape (a stale
  // bank reconciles UP to the trail measure); P2b now proves the other
  // direction (a bank ABOVE the trail measure is never reduced); P2c proves
  // the unforced bank lands immediately; P2d keeps the zero-clobber guard.
  await toMenu();
  await ev(`loadRoute('5w'); true`); await sleep(600);
  const p2adopt = await J(`(() => {
    runStart = Date.now() - 600000; saveStart();
    const runSec = Math.floor(runStart / 1000);
    trail = []; for (let i = 0; i <= 10; i++) trail.push([+(43.8 + i * 0.0001).toFixed(6), -79.4, runSec + i * 60]);
    trailSessions = [runSec];
    const tm = trailKm(runStart) * 1000;
    localStorage.setItem(LS.rundist, JSON.stringify({ run: runStart, m: tm - 20, capped: false })); // a 1.190-shape record: capped rides along, tolerated and ignored
    localStorage.removeItem(LS.rundist2);
    runDist = { run: 0, m: 0 };
    adoptRunDist();
    return { adopted: runDist.m, tm };
  })()`);
  ok('P2a adoption reconciles a stale bank against the surviving trail (adopts the trail measure, not the stale bank) | ' + JSON.stringify(p2adopt),
    p2adopt.tm > 100 && Math.abs(p2adopt.adopted - p2adopt.tm) < 0.01);
  const p2cap = await J(`(() => {
    const tm = trailKm(runStart) * 1000;
    const banked = tm + 5000; // a bank ABOVE anything the window's trail can measure
    localStorage.setItem(LS.rundist, JSON.stringify({ run: runStart, m: banked, capped: true })); // the 1.190 CAPPED shape: its exemption is retired, the max() must still never reduce it
    localStorage.removeItem(LS.rundist2);
    runDist = { run: 0, m: 0 };
    adoptRunDist();
    return { adopted: runDist.m, banked, hasCapped: 'capped' in runDist };
  })()`);
  ok('P2b (Beta 1.193) a bank above the trail measure is NEVER reduced by derivation (the max only raises; the retired capped exemption is moot under the window) | ' + JSON.stringify(p2cap),
    p2cap.adopted === p2cap.banked && p2cap.hasCapped === false);
  const p2flush = await J(`(() => {
    const tm = trailKm(runStart) * 1000;
    runDist = { run: runStart, m: tm - 20 };
    runDistWrote = { run: 0, m: 0 };
    persistRunDist(true); // bank the stale figure
    const afterBank = JSON.parse(localStorage.getItem(LS.rundist)).m;
    runDist.m = tm; // +20 m lands (through 1.190 this sat inside the 30 s / 25 m throttle window)
    persistRunDist(false); // Beta 1.193: NO throttle - the unforced bank lands on the fix, like every fix
    const afterUnforced = JSON.parse(localStorage.getItem(LS.rundist)).m;
    flushAux(true); // the pagehide-equivalent forced flush: keeps the true figure, and lands the mirror copy with it
    const afterForce = JSON.parse(localStorage.getItem(LS.rundist)).m;
    const mirror = JSON.parse(localStorage.getItem(LS.rundist2) || 'null');
    return { tm, afterBank, afterUnforced, afterForce, mirrorM: mirror && mirror.m, mirrorRun: mirror && mirror.run, rs: runStart };
  })()`);
  ok('P2c (Beta 1.193) an UNFORCED bank lands immediately (the throttle is gone), the forced flush keeps it, and the mirror copy lands with the flush | ' + JSON.stringify(p2flush),
    Math.abs(p2flush.afterBank - (p2flush.tm - 20)) < 0.01 && Math.abs(p2flush.afterUnforced - p2flush.tm) < 0.01 && Math.abs(p2flush.afterForce - p2flush.tm) < 0.01 && Math.abs(p2flush.mirrorM - p2flush.tm) < 0.01 && p2flush.mirrorRun === p2flush.rs);
  // P2d (Beta 1.186 gate round, Codex finding): the forced flush must never bank
  // an UN-ADOPTED counter. After a mid-run reload, runStart is restored at boot
  // but runDist still boots as { run: 0, m: 0 } - adoption is lazy
  // (buildSnap, the first recorded fix). A pagehide in that window fired P2c's
  // forced bank with the zero counter and overwrote the stored record; through
  // 1.190 the loss was permanent for a capped run (the truncated trail could not
  // reproduce the banked total). persistRunDist adopts before it writes, so the
  // bank lands as the adopted record itself. (Beta 1.193: the planted record
  // keeps its 1.190 capped field - tolerated, ignored, and NOT carried into the
  // rewritten record; the mirror lands the same adopted figure beside it.)
  const p2zero = await J(`(() => {
    const banked = 4321; // a total the surviving trail cannot reproduce
    localStorage.setItem(LS.rundist, JSON.stringify({ run: runStart, m: banked, capped: true }));
    localStorage.removeItem(LS.rundist2);
    runDist = { run: 0, m: 0 }; runDistWrote = { run: 0, m: 0 }; runDistMirrorWrote = ''; // the post-reload boot state
    flushAux(true); // the pagehide-equivalent forced flush, before any fix or buildSnap
    const rec = JSON.parse(localStorage.getItem(LS.rundist));
    const mir = JSON.parse(localStorage.getItem(LS.rundist2) || 'null');
    return { rec, mir, banked, rs: runStart };
  })()`);
  ok('P2d a forced flush in the reload window cannot zero an un-adopted bank (adoption precedes the write; the mirror lands the adopted figure too) | ' + JSON.stringify(p2zero),
    p2zero.rec.run === p2zero.rs && p2zero.rec.m === p2zero.banked && !('capped' in p2zero.rec) && p2zero.mir && p2zero.mir.m === p2zero.banked && p2zero.mir.run === p2zero.rs);
} catch (e) {
  R.fatal = String(e && e.message || e);
}
R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String((c.args && c.args[0]) || c.text || '').slice(0, 220));
finish(R, proc);
