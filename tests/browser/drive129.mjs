import { launchDrive, finish, PATTERNS_GITHUB_IO, bootThrough } from './harness.mjs';
const { proc, ev, consoleLog, sleep, poll: poll120, poll } = await launchDrive({ patterns: PATTERNS_GITHUB_IO });
await bootThrough(ev, poll); // Beta 1.76: boots end at the route menu now - click through to a loaded route



// drive129: the facing beam (Beta 1.28 cone; Beta 1.49 gradient fan symbol -
// Andrew's reference image). No beam until a facing is known; the beam's
// rotation follows the facing (compass funnel); while moving, the GPS course
// takes over the funnel; GPS off removes the beam.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, !!cond]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };
await sleep(3000);
ok('F0 app boots with the map active', await poll120(`typeof glOk !== 'undefined' && glOk === true`, 30000));

const base = JSON.parse(await ev(`(() => { const part = STRETCH.Velmar.parts[0]; const mid = part[Math.floor(part.length / 2)]; return JSON.stringify({ lat: mid[0], lng: mid[1] }); })()`));
const gpsData = async () => JSON.parse(await ev(`(() => { const d = (map.getSource('gps') || {})._data || { features: [] }; return JSON.stringify(d.features.map(f => f.properties.k)); })()`));
const coneBearing = async () => ev(`(() => { const d = (map.getSource('gps') || {})._data || { features: [] }; const b = d.features.find(f => f.properties.k === 'beam'); return b ? Math.round(b.properties.rot) : -1; })()`); // Beta 1.49: the beam is a symbol whose rotation rides the feature's rot property - read it directly
const bangDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

await ev(`(() => { watchId = 4242; followPaused = false; return true; })()`);
await ev(`acceptFix({ coords: { latitude: ${base.lat}, longitude: ${base.lng}, accuracy: 10, speed: 0, heading: null }, timestamp: Date.now() })`);
// Waits-hardened (Beta 1.49): the GPS layers land on a style restack that can
// still be settling right after boot - poll for the dot instead of reading
// once at 500 ms and mistaking a settling style for a missing dot.
let K = [];
for (let i = 0; i < 40; i++) { K = await gpsData(); if (K.includes('dot')) break; await sleep(250); }
ok('C1 a dot with no known facing carries no beam | kinds ' + JSON.stringify(K), K.includes('dot') && !K.includes('beam'));

await ev(`setFacing(90, 1)`); await sleep(200);
K = await gpsData(); const B1 = await coneBearing();
ok('C2 facing east draws the beam pointing east | kinds ' + JSON.stringify(K) + ' bearing ' + B1, K.includes('beam') && bangDiff(B1, 90) <= 7);

await ev(`setFacing(350, 1)`); await sleep(200);
const B2 = await coneBearing();
ok('C3 the beam swings to 350 across the north wrap | bearing ' + B2, bangDiff(B2, 350) <= 7);

for (let i = 0; i < 4; i++) { await ev(`acceptFix({ coords: { latitude: ${base.lat}, longitude: ${base.lng}, accuracy: 9, speed: 6, heading: 90 }, timestamp: Date.now() })`); await sleep(150); }
await sleep(400);
const B3 = await coneBearing();
ok('C4 while moving, the GPS course takes over the beam | bearing ' + B3, bangDiff(B3, 90) <= 20);

let LP = {};
for (let i = 0; i < 40; i++) { LP = JSON.parse(await ev(`(() => JSON.stringify({ beam: !!map.getLayer('gps-beam'), img: map.getLayer('gps-beam') && map.getLayoutProperty('gps-beam', 'icon-image'), cone: !!map.getLayer('gps-cone'), shadow: !!map.getLayer('gps-shadow') }))()`)); if (LP.beam) break; await sleep(250); } // poll: a restack can be mid-flight at any single read
await ev(`(() => { watchId = null; pushGps(); return true; })()`); await sleep(200);
K = await gpsData();
ok('C5 GPS off removes the beam; the beam is the gradient fan symbol and the cone layer is retired | kinds ' + JSON.stringify(K) + ' layers ' + JSON.stringify(LP), !K.includes('beam') && LP.beam === true && LP.img === 'beam-img' && LP.cone === false && LP.shadow === true);

R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String(c.text || '').slice(0, 200));
finish(R, proc);

