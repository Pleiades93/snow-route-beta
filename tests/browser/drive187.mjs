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

  // ---- B5: trail-cap honesty ----
  await toMenu();
  await ev(`loadRoute('5w'); true`); await sleep(600);
  await J(`(() => {
    runStart = Date.now() - 3 * 3600000; saveStart();
    const runSec = Math.floor(runStart / 1000);
    trail = []; for (let i = 0; i < 7999; i++) trail.push([+(43.8 + i * 0.000001).toFixed(6), -79.4, runSec + i]);
    localStorage.setItem(LS.rundist, JSON.stringify({ run: runStart, m: 50000, capped: false }));
    runDist = { run: 0, m: 0, capped: false };
    gpsFromRun = true;
    markDone('Velmar', 'tap'); markDone('Mellings', 'tap'); markDone('Astona', 'tap');
    return true;
  })()`);
  for (let k = 0; k < 3; k++) { await ev(`acceptFix({ coords: { latitude: ${43.80801 + k * 0.00001}, longitude: -79.4, accuracy: 5, speed: 3, heading: 90 }, timestamp: Date.now() }); true`); await sleep(150); }
  const pre = await J(`({ m: runDist.m, capped: runDist.capped, trailLen: trail.length })`);
  ok('B5a during the run the trail pins at the 8000 cap while the counter keeps the banked 50 km and flags the truncation | ' + JSON.stringify(pre),
    pre.trailLen === 8000 && pre.capped === true && pre.m >= 50000);
  await ev(`finishRun(); true`); await sleep(500);
  const post = await J(`(() => { const e = history[history.length - 1] || {}; return { km: e.km, flag: e.pathShortened === true, wantKm: +(${(pre.m || 0)} / 1000).toFixed(1), trailKmNow: +trailKm(runStart || 1).toFixed(1), rundist: localStorage.getItem(routeKeys('5w').rundist) }; })()`);
  ok('B5b the archive km is the counter TRUE total, not the truncated path figure | ' + JSON.stringify(post),
    post.km === post.wantKm && post.km > post.trailKmNow + 10);
  ok('B5c the entry carries the truncation flag, and the counter record is consumed at Finish',
    post.flag === true && post.rundist === null);
  const ctl = await J(`(() => { runStart = Date.now() - 600000; saveStart(); trail = []; runDist = { run: 0, m: 0, capped: false }; localStorage.removeItem(routeKeys('5w').rundist); gpsFromRun = true; markDone('Velmar', 'tap'); markDone('Mellings', 'tap'); markDone('Astona', 'tap'); return true; })()`);
  for (let k = 0; k < 3; k++) { await ev(`acceptFix({ coords: { latitude: ${43.81 + k * 0.0001}, longitude: -79.41, accuracy: 5, speed: 3, heading: 90 }, timestamp: Date.now() }); true`); await sleep(150); }
  const ctlPre = await J(`({ m: runDist.m, tk: +trailKm(runStart).toFixed(1), capped: runDist.capped })`);
  await ev(`finishRun(); true`); await sleep(500);
  const ctlPost = await J(`(() => { const e = history[history.length - 1] || {}; return { km: e.km, hasFlag: 'pathShortened' in e }; })()`);
  ok('B5d control: an ordinary short run archives exactly its trail figure, counter and trail agree, and NO flag is carried | ' + JSON.stringify({ ctlPre, ctlPost }),
    ctlPre.capped === false && ctlPost.km === ctlPre.tk && ctlPost.km === +(ctlPre.m / 1000).toFixed(1) && ctlPost.hasFlag === false);

  // ---- P2 (Beta 1.186, storage fix round): the counter can no longer come back
  // stale from a mid-run reload. Through 1.185 (i) flushAux's forced flush never
  // banked the counter, so inside the 30 s / 25 m throttle window the banked
  // record lagged the run, and (ii) adoptRunDist believed a matching banked
  // record verbatim, so buildSnap archived the stale figure while the
  // fully-flushed trail measured more. The fixes: a forced flush banks the
  // counter past its throttle (app1), and adoption reconciles an UNCAPPED
  // record against the surviving trail (app3) - a CAPPED record keeps the
  // counter as sole authority, its trail being truncated by design.
  await toMenu();
  await ev(`loadRoute('5w'); true`); await sleep(600);
  const p2adopt = await J(`(() => {
    runStart = Date.now() - 600000; saveStart();
    const runSec = Math.floor(runStart / 1000);
    trail = []; for (let i = 0; i <= 10; i++) trail.push([+(43.8 + i * 0.0001).toFixed(6), -79.4, runSec + i * 60]);
    trailSessions = [runSec];
    const tm = trailKm(runStart) * 1000;
    localStorage.setItem(LS.rundist, JSON.stringify({ run: runStart, m: tm - 20, capped: false }));
    runDist = { run: 0, m: 0, capped: false };
    adoptRunDist();
    return { adopted: runDist.m, tm };
  })()`);
  ok('P2a adoption reconciles a stale UNCAPPED bank against the surviving trail (adopts the trail measure, not the stale bank) | ' + JSON.stringify(p2adopt),
    p2adopt.tm > 100 && Math.abs(p2adopt.adopted - p2adopt.tm) < 0.01);
  const p2cap = await J(`(() => {
    const tm = trailKm(runStart) * 1000;
    const banked = tm - 20;
    localStorage.setItem(LS.rundist, JSON.stringify({ run: runStart, m: banked, capped: true }));
    runDist = { run: 0, m: 0, capped: false };
    adoptRunDist();
    return { adopted: runDist.m, banked, capped: runDist.capped };
  })()`);
  ok('P2b control: a CAPPED bank stays the sole authority (the truncated trail must not outvote it) | ' + JSON.stringify(p2cap),
    p2cap.adopted === p2cap.banked && p2cap.capped === true);
  const p2flush = await J(`(() => {
    const tm = trailKm(runStart) * 1000;
    runDist = { run: runStart, m: tm - 20, capped: false };
    persistRunDist(true); // bank the stale figure; the throttle window opens now
    const afterBank = JSON.parse(localStorage.getItem(LS.rundist)).m;
    runDist.m = tm; // +20 m lands inside the window (delta < 25 m, seconds later)
    persistRunDist(false); // throttled: must NOT write (pre-existing behaviour, unchanged by the fix)
    const afterThrottle = JSON.parse(localStorage.getItem(LS.rundist)).m;
    flushAux(true); // the pagehide-equivalent forced flush
    const afterForce = JSON.parse(localStorage.getItem(LS.rundist)).m;
    return { tm, afterBank, afterThrottle, afterForce };
  })()`);
  ok('P2c a FORCED flush banks the counter past its throttle (the figure a mid-run reload resumes is the true one) | ' + JSON.stringify(p2flush),
    Math.abs(p2flush.afterBank - (p2flush.tm - 20)) < 0.01 && Math.abs(p2flush.afterThrottle - (p2flush.tm - 20)) < 0.01 && Math.abs(p2flush.afterForce - p2flush.tm) < 0.01);
  // P2d (Beta 1.186 gate round, Codex finding): the forced flush must never bank
  // an UN-ADOPTED counter. After a mid-run reload, runStart is restored at boot
  // but runDist still boots as { run: 0, m: 0, capped: false } - adoption is lazy
  // (buildSnap, the first recorded fix). A pagehide in that window fired P2c's
  // forced bank with the zero counter and overwrote the stored record; for a
  // CAPPED run the loss was permanent (the truncated trail cannot reproduce the
  // banked total, and re-derivation also cleared the capped flag). persistRunDist
  // now adopts before it writes, so the bank lands as the adopted record itself.
  const p2zero = await J(`(() => {
    const banked = 4321; // a capped total the truncated trail cannot reproduce
    localStorage.setItem(LS.rundist, JSON.stringify({ run: runStart, m: banked, capped: true }));
    runDist = { run: 0, m: 0, capped: false }; runDistWrote = { at: 0, m: 0, capped: false }; // the post-reload boot state
    flushAux(true); // the pagehide-equivalent forced flush, before any fix or buildSnap
    const rec = JSON.parse(localStorage.getItem(LS.rundist));
    return { rec, banked, rs: runStart };
  })()`);
  ok('P2d a forced flush in the reload window cannot zero an un-adopted CAPPED bank (adoption precedes the write) | ' + JSON.stringify(p2zero),
    p2zero.rec.run === p2zero.rs && p2zero.rec.m === p2zero.banked && p2zero.rec.capped === true);
} catch (e) {
  R.fatal = String(e && e.message || e);
}
R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String((c.args && c.args[0]) || c.text || '').slice(0, 220));
finish(R, proc);
