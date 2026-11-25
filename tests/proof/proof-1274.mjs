// proof-1274 - Beta 1.295 startup version check (spin-out 6d-3).
// Pins the boot probe's shape: bounded, strictly-newer, one reload per session, silent.
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const app4 = read('parts/app4.js');
const app5 = read('parts/app5.js');
// the Settings update handler, bounded so the sharing pin cannot borrow text
const updHandler = app4.slice(app4.indexOf("$('updBtn').addEventListener"),
  app4.indexOf('// updnav is stripped'));

let failures = 0;
function check(name, cond) {
  if (cond) { console.log('PASS', name); }
  else { failures++; console.log('FAIL', name); }
}
const has = (s, n) => s.includes(n);
const before = (s, a, b) => { const i = s.indexOf(a), j = s.indexOf(b); return i !== -1 && j !== -1 && i < j; };

// the boot block, bounded by its own markers so pins cannot borrow text
// from the Settings handler or the persist call that follows
const block = app5.slice(app5.indexOf('void (async () => {'),
  app5.indexOf('navigator.storage.persist'));

check('1 the boot check sits beside the registration, before the persist ask',
  before(app5, "navigator.serviceWorker.register('sw.js')", 'snowroute.bootUpdateReloaded'));
check('2 the one-reload guard key is the session key', has(block, "const reloadKey = 'snowroute.bootUpdateReloaded';"));
check('3 the guard is read before any probe fires', before(block, 'sessionStorage.getItem(reloadKey)', 'probeServedVer(probe.signal)'));
check('4 a missing registration skips the check (benign first launch)', has(block, 'if (!reg) return;'));
check('5 the worker update is kicked in the background, never awaited',
  has(block, 'reg.update().catch(() => {});') && !has(block, 'await reg.update()'));
check('6 the probe is the one shared helper, abort-bound at 1500 ms',
  has(block, 'probeServedVer(probe.signal)')
  && has(block, 'setTimeout(() => probe.abort(), 1500)')
  && has(app4, "fetch(location.pathname + '?updprobe=1&v=' + Date.now(), { cache: 'no-store', signal })"));
check('7 the served label is scraped by the helper and parsed with the shared parser',
  has(app4, 'id="ver">([^<]+)') && has(block, 'parseVerLabel(await probeServedVer(probe.signal))')
  && has(block, "parseVerLabel($('ver').textContent)"));
check('11 the Settings check calls the same helper (one probe, two callers)',
  has(updHandler, 'const served = await probeServedVer();'));
check('8 strictly newer is the only firing condition',
  has(block, 'served[0] > running[0] || (served[0] === running[0] && served[1] > running[1])'));
check('9 the guard is set before the updnav reload, so it can never loop',
  before(block, "sessionStorage.setItem(reloadKey, '1');", "location.replace(location.pathname + '?updnav=1&v=' + Date.now())"));
check('10 the block is silent: no toast, no banner, no modal, errors swallowed',
  !has(block, 'toast(') && !has(block, 'showBanner(') && !has(block, 'showConfirm(') && has(block, '} catch (e) {}'));

console.log(failures === 0 ? 'proof-1274: ALL PASS' : `proof-1274: ${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
