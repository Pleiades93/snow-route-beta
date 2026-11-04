import { launchDrive, finish, PATTERNS_GITHUB_IO, bootThrough } from './harness.mjs';
const { proc, send, S, ev, consoleLog, sleep, poll: poll120, url, poll } = await launchDrive({ patterns: PATTERNS_GITHUB_IO });
await bootThrough(ev, poll); // Beta 1.76: boots end at the route menu now - click through to a loaded route



// drive141: Beta 1.64 (deep-audit F05/F07/R01 + F08) - GPS/defensive round.
// F05: the ACTIVE trail display is scoped to the current clean (storage
// keeps every clean). R01: a GPS callback carrying an older timestamp
// than the last accepted fix is rejected. F07: malformed stored shapes
// (string instead of the times object; a nested string in the side
// timestamps) load without crashing and marking still works. F08: the
// compass lifecycle actually stops.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
await sleep(3000);
ok('G0 app boots for the GPS/defensive tests', await poll120(`typeof acceptFix === 'function' && !!map`, 30000));
// R01: fresh fix accepted, then a STALE-timestamp fix must be ignored.
const fix = (lat, lng, ts) => `acceptFix({ coords: { latitude: ${lat}, longitude: ${lng}, accuracy: 10, heading: null, speed: null }, timestamp: ${ts} })`;
await ev(`(() => { ${fix(43.8200, -79.5660, 1700000000000)}; return true; })()`); await sleep(200);
await ev(`(() => { ${fix(43.8201, -79.5661, 1700000060000)}; return true; })()`); await sleep(200);
const before = JSON.parse(await ev(`JSON.stringify({ ts: lastFixTs, pos: gpsPos })`));
await ev(`(() => { ${fix(43.8250, -79.5700, 1700000030000)}; return true; })()`); await sleep(200);
const after = JSON.parse(await ev(`JSON.stringify({ ts: lastFixTs, pos: gpsPos })`));
ok('R01 a stale-timestamp fix is rejected: lastFixTs and the estimate do not move backwards | ' + JSON.stringify({ before, after }), after.ts === 1700000060000 && JSON.stringify(after.pos) === JSON.stringify(before.pos));
// F05: seed a two-clean trail; only the current clean's points may draw.
await poll120(`!!(window.map && map.getSource && map.getSource('trail'))`, 30000);
const nowS = Math.floor(Date.now() / 1000);
await ev(`(() => { trail = [[43.8200, -79.5660, ${nowS - 7200}], [43.8201, -79.5661, ${nowS - 7140}], [43.8202, -79.5662, ${nowS - 60}], [43.8203, -79.5663, ${nowS - 30}]]; runStart = Date.now() - 90000; drawTrail(true); return true; })()`); await sleep(200);
const drawnPts = await ev(`(() => { const d = (map.getSource('trail') || {})._data || { features: [] }; return d.features.reduce((a, f) => a + f.geometry.coordinates.length, 0); })()`);
ok('F05 the active trail draws only the current clean (2 of 4 stored points) | drawn ' + drawnPts, drawnPts === 2);
const storedPts = await ev(`trail.length`);
ok('F05b the stored trail is untouched (the log keeps every clean) | stored ' + storedPts, storedPts === 4);
// F08: compass starts and STOPS with its lifecycle.
await ev(`(() => { try { DeviceOrientationEvent.requestPermission = undefined; } catch (e) {} startCompass(); return true; })()`); await sleep(100);
const cOn = await ev(`compassOn`);
await ev(`(() => { stopCompass(); return true; })()`); await sleep(100);
const cOff = await ev(`compassOn`);
ok('F08 compass lifecycle: on after start, off after stop | on ' + cOn + ' off ' + cOff, cOn === true && cOff === false);
// F07a: the completion-times record is a bare string - the boot used to
// die in the cleanup loop (strict-mode delete on a string).
await ev(`(() => { localStorage.setItem('snowroute.5w.v2.times', JSON.stringify('just-a-string')); return true; })()`);
await send('Page.navigate', { url: url }, S);
ok('F07a boot survives a string completion-times record', await poll120(`(function(){ if (typeof routeLoaded !== 'undefined' && !routeLoaded && typeof loadRoute === 'function') { try { loadRoute('5w'); } catch (e) {} } return typeof doneSet !== 'undefined' && typeof doneTimes === 'object' && !Array.isArray(doneTimes) && routeLoaded === true; })()`, 30000));
// F07b: a nested string inside the side timestamps - marking the street
// used to throw in applyPiece under strict mode.
const street = await ev(`(() => { const rec = { p: {}, t: {} }; rec.p.Boddy = pieces.Boddy.slice(); rec.t.Boddy = 'o'; localStorage.setItem('snowroute.5w.v5.sides', JSON.stringify(rec)); return 'Boddy'; })()`);
await send('Page.navigate', { url: url }, S);
await poll120(`(function(){ if (typeof routeLoaded !== 'undefined' && !routeLoaded && typeof loadRoute === 'function') { try { loadRoute('5w'); } catch (e) {} } return typeof togglePiece === 'function' && typeof routeLoaded !== 'undefined' && routeLoaded === true; })()`, 30000); // Beta 1.76: the sanitizer runs when the route loads
const markRes = await ev(`(() => { try { togglePiece(${JSON.stringify(street)}, 0, 0); return 'ok'; } catch (e) { return 'threw: ' + e.message; } })()`);
ok('F07b boot survives nested-string side timestamps and marking works | street ' + street + ' result ' + markRes, !!street && markRes === 'ok');
R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION');
finish(R, proc);

