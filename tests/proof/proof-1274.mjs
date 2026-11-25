// proof-1274 - Beta 1.295 startup version check (spin-out 6d-3).
// Pins the boot probe's shape: bounded, strictly-newer, one reload per session, silent.
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const app5 = read('parts/app5.js');

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
check('3 the guard is read before any probe fires', before(block, 'sessionStorage.getItem(reloadKey)', '?updprobe=1'));
check('4 a missing registration skips the check (benign first launch)', has(block, 'if (!reg) return;'));
check('5 the worker update is kicked in the background, never awaited',
  has(block, 'reg.update().catch(() => {});') && !has(block, 'await reg.update()'));
check('6 the probe is the Settings updprobe, network-only, abort-bound at 1500 ms',
  has(block, "fetch(location.pathname + '?updprobe=1&v=' + Date.now(), { cache: 'no-store', signal: probe.signal })")
  && has(block, 'setTimeout(() => probe.abort(), 1500)'));
check('7 the served label is scraped and parsed with the shared parser, both sides',
  has(block, 'id="ver">([^<]+)') && has(block, 'parseVerLabel(match && match[1])')
  && has(block, "parseVerLabel($('ver').textContent)"));
check('8 strictly newer is the only firing condition',
  has(block, 'served[0] > running[0] || (served[0] === running[0] && served[1] > running[1])'));
check('9 the guard is set before the updnav reload, so it can never loop',
  before(block, "sessionStorage.setItem(reloadKey, '1');", "location.replace(location.pathname + '?updnav=1&v=' + Date.now())"));
check('10 the block is silent: no toast, no banner, no modal, errors swallowed',
  !has(block, 'toast(') && !has(block, 'showBanner(') && !has(block, 'showConfirm(') && has(block, '} catch (e) {}'));

console.log(failures === 0 ? 'proof-1274: ALL PASS' : `proof-1274: ${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
