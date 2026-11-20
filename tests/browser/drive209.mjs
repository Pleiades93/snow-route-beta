import { launchDrive, finish, bootThrough } from './harness.mjs';
const { proc, send, S, ev, consoleLog, sleep, poll: poll120, poll } = await launchDrive();
await bootThrough(ev, poll); // boots end at the route menu - click through to a loaded route

// drive209: Beta 1.254 small-defects batch - the two items whose
// behaviour is a whole-app property, graded in the real app:
// (U1) O-07: a boot that lands on the update reload's '?updnav='
//   marker strips it from the address once the navigation has been
//   routed, so later reloads take the early cached serve instead of
//   the worker's network path. Through 1.253 the marker stayed for
//   the whole session and this check fails on the surviving query.
// (U2) O-02: a crafted backup whose created route carries a street
//   literally named '__proto__' restores, registers and builds its
//   geometry with the street ON the board and Object.prototype
//   untouched. Through 1.253 ROADS was a plain object and
//   buildGeometry's Object.assign ran the __proto__ setter: the
//   street vanished and the map's prototype was swapped.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };

await sleep(2500);

// ---- U1: boot on an updnav URL, watch the marker die ----
const href = await J(`location.href`);
const base = typeof href === 'string' ? href.split('?')[0].split('#')[0] : '';
await send('Page.navigate', { url: base + '?updnav=1&v=999' }, S);
await sleep(3000); // the navigate lands on the route menu (the drive136 pattern)
const rebooted = await poll120(`typeof restoreBackup === 'function'`, 45000).catch(() => false); // app4 has evaluated - the strip lives there, so its verdict is readable from here
await ev(`loadRoute('5w'); true`); await sleep(600);
const afterNav = await J(`({ search: location.search })`);
ok('U1 the updnav boot completes | rebooted ' + rebooted, rebooted === true);
ok('U1 the address carries no query after the updnav boot (the marker was stripped at boot) | search ' + JSON.stringify(afterNav.search), afterNav.search === '');

// ---- U2: the __proto__ street survives a crafted backup ----
await ev(`(() => {
  const roads = JSON.parse('{"__proto__": [[[43.8,-79.575],[43.81,-79.575]]], "Alpha Street": [[[43.8,-79.56],[43.81,-79.56]]]}');
  restoreBackup({ app: 'snowroute-backup', v: 2, routes: { 'proto-test': { done: '[]' } }, userpacks: { 'proto-test': { name: 'Proto Test', area: 'Test', roads, reference: {} } } });
  return true;
})()`); // the bare call + poll pattern (drive118): the restore's completion is observed, not awaited. The backup carries the route's own state slot like every genuine backup - a definitions-only backup is refused as "nothing to restore" (the entries gate), and a geometry-carrying restore ends in a reload that re-registers the pack at boot, which the poll rides through
const registered = await poll(`typeof ROUTE_PACKS !== 'undefined' && ROUTE_PACKS.some(p => p.id === 'proto-test')`, 30000).catch(() => false);
await sleep(800); // the reloaded document settles before its geometry is built below
const toastAfter = await J(`$('toast') ? $('toast').textContent : ''`);
ok('U2 the crafted pack restores and registers (the validator accepts the street) | registered ' + registered + ', toast ' + JSON.stringify(toastAfter), registered === true);
const built = await J(`(() => { const pk = ROUTE_PACKS.find(p => p.id === 'proto-test'); buildGeometry(pk); return {
  has: Object.prototype.hasOwnProperty.call(ROADS, '__proto__'),
  protoNull: Object.getPrototypeOf(ROADS) === null,
  refNull: Object.getPrototypeOf(REFERENCE) === null,
  inSet: STREETSET.has('__proto__'),
  alphaOk: !!ROADS['Alpha Street'],
  objProtoClean: Object.keys(Object.prototype).length === 0
}; })()`);
ok('U2 the __proto__ street is on the board as an entry, beside the normal street | ' + JSON.stringify(built), built.has === true && built.inSet === true && built.alphaOk === true);
ok('U2 the live maps are null-prototype and Object.prototype is untouched | ' + JSON.stringify(built), built.protoNull === true && built.refNull === true && built.objProtoClean === true);

R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String(c.text || '').slice(0, 200));
finish(R, proc);
