// proof-1273.mjs - Beta 1.295 (spin-out 6d-2): GPS gap surfacing.
// A silent GPS watch mid-clean is a gap on that clean: the stale-watch
// watchdog records it against the run, buildSnap stamps gpsGap onto the
// archived record, and the finYes handler advises with the shared
// notification banner (showBanner, app1) ONLY after finishRun returns -
// the finish flow (save, teardown, feedback) completes first, so the
// advisory can never sit between Finish and the save. The banner is the
// one advisory surface (Andrew, 2026-11-25: all notifications are the
// banner now); the draft's confirm-pill surface stays absent. The
// boundary behaviour is graded by drive225. On the Beta 1.294 tree the
// seams below do not exist and this proof fails.
// Run from the repo root:  node tests/proof/proof-1273.mjs
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const app1 = read('parts/app1.js');
const app3 = read('parts/app3.js');
const head = read('parts/head.html');

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };

// ---------- detection: the watchdog records the gap ----------
check('1: the gap ledger is declared', app3.includes('const gpsGapRuns = new Map();'));
check('2: a watchdog restart on a run-owned watch records the gap',
  app3.includes('if (wasRunGps && runStart && Date.now() - runStart > GPS_STALE_MS) gpsGapRuns.set(LS.start, runStart);'));
check('3: run transitions clear the ledger entry',
  app3.includes('gpsGapRuns.delete(LS.start);'));

// ---------- the record: buildSnap stamps the archive ----------
check('4: buildSnap stamps gpsGap for the matching run',
  app3.includes('if (gpsGapRuns.get(LS.start) === runStart) snap.gpsGap = true;'));
check('5: finishRun returns the archived snap on the committed path only',
  app3.includes('return archiving ? snap : null;'));

// ---------- the advisory: banner, after the finish completes ----------
const finAt = app3.indexOf("$('finYes').addEventListener");
const finEnd = finAt >= 0 ? app3.indexOf('});', finAt) : -1;
const finBody = finAt >= 0 && finEnd > finAt ? app3.slice(finAt, finEnd) : '';
const runAt = finBody.indexOf('finishRun()');
const bannerAt = finBody.indexOf('showBanner(');
check('6: the finYes handler exists and calls finishRun', finBody.length > 0 && runAt >= 0);
check('7: the banner fires after finishRun returns, never before',
  bannerAt >= 0 && runAt >= 0 && runAt < bannerAt);
check('8: the advisory is gated on the returned record carrying the gap',
  finBody.includes('finished && finished.gpsGap'));
check('9: the decided wording is the shipped wording',
  finBody.includes("showBanner('GPS gap in this clean', 'Part of this clean was not tracked', 'gps')"));
check('10: the superseded pill surface stays absent',
  !app3.includes("showConfirm({ title: 'GPS gap'"));

// ---------- the banner owner ----------
check('11: showBanner is the one banner owner in app1',
  app1.includes('function showBanner(head, line, icon)'));
check('12: the banner markup ships in head.html',
  head.includes('id="banner"') && head.includes('id="bannerHead"') && head.includes('id="bannerLine"'));
check('13: the recoil drop and the exit are the sampled keyframes',
  head.includes('@keyframes bannerDrop') && head.includes('@keyframes bannerExit')
  && head.includes('bannerDrop .55s cubic-bezier(.3,1.2,.4,1) both, bannerExit .4s ease-in 3.55s forwards'));

console.log(`proof-1273: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
