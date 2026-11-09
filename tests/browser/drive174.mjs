import { launchDrive, finish, bootThrough } from './harness.mjs';
const { proc, ev, consoleLog, sleep, poll } = await launchDrive();
await bootThrough(ev, poll);

// drive174: Beta 1.150 (security-audit fix round, finding
// covfromways-prototype-name-throw) - street names are external data, and
// the coverage name index was a plain object: a street named 'constructor'
// (or 'toString', '__proto__', ...) read Object.prototype members as if a
// run existed - crCovFromWays threw on .push, and the same plain-object
// reads in the picker (the draft-roads read and the pending read in
// pickStreet, the guard read in crOpenSectors) routed such a tap down the
// already-picked path for a street that was never picked. The fix builds
// the coverage index on a null-prototype object and makes the picker's
// name reads own-property checks (the cache fold's id index gets the same
// null-prototype treatment: a way id of '__proto__' silently set the
// prototype instead of an entry).
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };
const NAMES = ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf'];
const LINE = [[43.80, -79.50], [43.801, -79.501]];

try {
  // T1: the coverage builder itself - every prototype name indexes cleanly
  const t1 = await J(`(() => { const byId = {}; ${JSON.stringify(NAMES)}.forEach((n, i) => { byId[100 + i] = { name: n, pts: ${JSON.stringify(LINE)} }; });
    try { const cov = crCovFromWays(byId, [{ s: 43.7, w: -79.6, n: 43.9, e: -79.4 }]);
      return { threw: false, own: ${JSON.stringify(NAMES)}.map(n => Object.prototype.hasOwnProperty.call(cov.byName, n) && Array.isArray(cov.byName[n]) && cov.byName[n].length === 1) };
    } catch (e) { return { threw: true, err: String(e && e.message || e) }; } })()`);
  ok('T1 crCovFromWays indexes prototype-named streets as own properties, no throw | ' + JSON.stringify(t1),
    t1.threw === false && Array.isArray(t1.own) && t1.own.every(v => v === true));

  // T2: resolving a tap on a prototype-named street answers from the index
  const t2 = await J(`(() => { const cov = crCovFromWays({ 7: { name: 'constructor', pts: ${JSON.stringify(LINE)} } }, [{ s: 43.7, w: -79.6, n: 43.9, e: -79.4 }]);
    crCov = cov; try { const r = crResolve('constructor', { lat: 43.8005, lng: -79.5005 }); return { threw: false, status: r && r.status }; }
    catch (e) { return { threw: true, err: String(e && e.message || e) }; } })()`);
  ok('T2 crResolve answers a real status for a street named constructor | ' + JSON.stringify(t2),
    t2.threw === false && (t2.status === 'ok' || t2.status === 'edge'));

  // T3: the picker - an UNPICKED prototype-named street must not route down
  // the already-picked path (sectors door / pending) through prototype reads
  const t3 = await J(`(() => { window.__d174sectors = 0; window.__d174pend = 0;
    const osOrig = crOpenSectors; crOpenSectors = () => { window.__d174sectors++; };
    const psOrig = crPendStreet; crPendStreet = () => { window.__d174pend++; };
    draft = newDraft(); crCov = null; crPickBusy = false; crPrepState = 'idle';
    let threw = false, err = '';
    try { pickStreet('constructor', { lat: 43.8005, lng: -79.5005 }); } catch (e) { threw = true; err = String(e && e.message || e); }
    crOpenSectors = osOrig; crPendStreet = psOrig;
    return { threw, err, sectors: window.__d174sectors, pend: window.__d174pend, draftHas: Object.prototype.hasOwnProperty.call(draft.roads, 'constructor') }; })()`);
  ok('T3 pickStreet on an unpicked street named constructor takes neither the sectors door nor the pending path | ' + JSON.stringify(t3),
    t3.threw === false && t3.sectors === 0 && t3.pend === 0 && t3.draftHas === false);

  // T4: the sectors door's own guard read - for a street the draft does not
  // hold, the guard must refuse BEFORE any parts work: a prototype member
  // read as a held run would carry the call into crStreetParts
  const t4 = await J(`(() => { draft = newDraft(); window.__d174parts = 0;
    const spOrig = crStreetParts; crStreetParts = function () { window.__d174parts++; return spOrig.apply(null, arguments); };
    let threw = false, err = '';
    try { crOpenSectors('toString'); } catch (e) { threw = true; err = String(e && e.message || e); }
    crStreetParts = spOrig;
    return { threw, err, partsCalls: window.__d174parts, sectorStreet: crSectorStreet }; })()`);
  ok('T4 crOpenSectors refuses a prototype-named street at its guard (no parts work, no session) | ' + JSON.stringify(t4),
    t4.threw === false && t4.partsCalls === 0 && (t4.sectorStreet === null || t4.sectorStreet === ''));
} catch (e) {
  R.fatal = String(e && e.message || e);
}
R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String((c.args && c.args[0]) || c.text || '').slice(0, 220));
finish(R, proc);
