// proof-1252.mjs - Beta 1.252 (fix_id: audit-r3-gps).
// R-01, GPS SESSION ACCOUNTING (cross-audit fix programme, round 3):
// the stale-GPS watchdog judged a watch's silence from lastFixAt alone,
// and neither stopGps nor startGps ever reset that stamp - it held the
// last accepted fix of an EARLIER session. A watch started more than
// GPS_STALE_MS after the previous session's last fix was judged stale
// at the watchdog's first 15 s tick and restarted, and again every
// tick, until a fix landed within one tick of a restart. The watchdog
// now measures silence from the LATER of the last accepted fix and the
// current watch's own start (watchStartedAt, recorded by every
// startGps that creates a watch). The rejected remedy - clearing
// lastFixAt on stop - stays rejected and is pinned absent below: the
// watchdog only fires on a non-zero stamp, so clearing it would leave
// a watch that never gets a fix with no watchdog at all. Restart
// semantics: a watchdog restart records a new session start, so each
// restart is a fresh acquisition attempt with a full stale window -
// restarts are bounded to one per window, never the 15 s tick cadence.
// One threshold by design: the first-fix window IS GPS_STALE_MS from
// the session start (the defect was the clock's origin, not the
// window's length); no second literal may appear in app3. The boundary
// behaviour is graded by drive207. On the Beta 1.251 tree the seams
// below do not exist and this proof fails.
// Run from the repo root:  node tests/proof/proof-1252.mjs
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const app1 = read('parts/app1.js');
const app3 = read('parts/app3.js');
const whatsnew = read('parts/whatsnew.js');
const changelog = read('CHANGELOG.md');

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };

function extractFn(src, name) {
  const at = src.indexOf('function ' + name);
  if (at < 0) return '';
  const open = src.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(at, i + 1); }
  }
  return '';
}

// ---------- the session stamp ----------
check('1: the session start is declared beside lastFixAt',
  app3.includes('lastFixAt = 0, watchStartedAt = 0,'));
check('2: every watch creation records its session start',
  app3.includes('watchStartedAt = Date.now(); // Beta 1.252'));
const startBody = extractFn(app3, 'startGps');
check('3: the stamp is recorded inside startGps, before the watch is created',
  startBody.includes('watchStartedAt = Date.now();')
  && startBody.indexOf('watchStartedAt = Date.now();') < startBody.indexOf('watchPosition('));

// ---------- the watchdog's clock ----------
check('4: silence is measured from the later of the last fix and the session start',
  app3.includes('const silentSince = Math.max(lastFixAt, watchStartedAt);')
  && app3.includes('Date.now() - silentSince > GPS_STALE_MS'));
check('5: the old cross-session form is gone',
  !app3.includes('Date.now() - lastFixAt > GPS_STALE_MS'));
check('6: the watchdog still restarts through startGps with the restart flag (a fresh window per attempt)',
  app3.includes('stopGps(true); startGps(wasRunGps, true);'));

// ---------- the rejected remedy stays rejected ----------
const stopBody = extractFn(app3, 'stopGps');
check('7: stopGps clears neither stamp (no lastFixAt reset, no session-start reset)',
  stopBody.length > 0 && !stopBody.includes('lastFixAt = 0') && !stopBody.includes('watchStartedAt = 0'));

// ---------- one threshold, one home ----------
check('8: GPS_STALE_MS is unchanged at 45000 in app1',
  app1.includes('const GPS_STALE_MS = 45000;'));
check('9: no second stale literal in app3',
  !app3.includes('45000'));

// ---------- the release editorial ----------
check('10: the CHANGELOG top entry is Beta 1.252', changelog.includes('## Beta 1.252'));
check('11: What\'s New carries the 1.252 bullet, short and dash-free',
  whatsnew.includes('Turning location back on no longer restarts it while it waits for a first fix.')
  && 'Turning location back on no longer restarts it while it waits for a first fix.'.length <= 108
  && !whatsnew.includes('—'));

console.log(`proof-1252: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
