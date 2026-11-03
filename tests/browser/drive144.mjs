import { readFileSync } from 'node:fs';
import { launchDrive, finish } from './harness.mjs';
const { proc, ev, consoleLog, sleep } = await launchDrive();



// drive144: Beta 1.73 audit fixes (deep audit of Beta 1.72, adjudicated 2026-11-02).
// C04: a session-marker write failure at clean start was SILENT in 1.71-1.72 -
// noteSessionStart dropped saveSess()'s result and startClean's warning covered
// saveAll() only. Now the start warns, the clean still starts, and the marker
// write is retried by flushAux until it lands.
// C05: Clear Trail claimed success from the trail write alone; the marker write
// is now checked the same way, with the same retry.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, !!cond]);
const src = readFileSync(new URL('../../src/tracker-source.html', import.meta.url), 'utf8');
ok('S1 shipped source wires the marker-save results into both callers + the flush retry', src.includes('const okSess = noteSessionStart()') && src.includes('const okSessClr = saveSess()') && src.includes('if (sessDirty && saveSess()) sessDirty = false;'));
const poll144 = async (expr, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 30000)) { const v = await ev(expr); if (v === true) return true; await sleep(300); } return false; };
ok('T0 app script is live', await poll144(`typeof startClean === 'function' && typeof noteSessionStart === 'function' && typeof flushAux === 'function'`, 90000));
await ev(`(() => { navigator.geolocation.watchPosition = () => 777; navigator.geolocation.clearWatch = () => {}; return true; })()`);
// ---- C04: break ONLY the marker key, then start a clean ----
await ev(`(() => { window.__realLsSet = lsSet; lsSet = (k, v) => k === 'snowroute.v5.sess' ? false : window.__realLsSet(k, v); return true; })()`);
await ev(`(() => { startClean(); return true; })()`);
const c04 = JSON.parse(await ev(`(() => JSON.stringify({ toast: $('toast').textContent, runStart, marker: Math.floor(runStart / 1000), dirty: sessDirty, stored: localStorage.getItem('snowroute.v5.sess') }))()`));
ok('C04a marker-save failure at clean start warns (no success claim), the clean still starts, retry armed | ' + JSON.stringify(c04), c04.runStart > 0 && c04.toast.indexOf('session marker could not be saved') >= 0 && c04.dirty === true && (c04.stored === null || c04.stored.indexOf(String(c04.marker)) < 0));
await ev(`(() => { lsSet = window.__realLsSet; flushAux(true); return true; })()`);
const c04b = JSON.parse(await ev(`(() => JSON.stringify({ dirty: sessDirty, stored: localStorage.getItem('snowroute.v5.sess') }))()`));
ok('C04b once storage recovers, the flush retry lands the marker | ' + JSON.stringify(c04b), c04b.dirty === false && (c04b.stored || '').indexOf(String(c04.marker)) >= 0);
await ev(`(() => { cancelStart(); return true; })()`);
// ---- C05: break ONLY the marker key, then clear a trail that has markers ----
await ev(`(() => { trail = [[43.82, -79.56, 1767650000], [43.821, -79.559, 1767650060]]; trailSessions = [1767650000]; saveTrail(); saveSess(); return true; })()`);
await ev(`(() => { if (!map) map = { getSource: () => null }; lsSet = (k, v) => k === 'snowroute.v5.sess' ? false : window.__realLsSet(k, v); return true; })()`);
await ev(`(() => { const b = document.getElementById('xClr'); b.click(); b.click(); return true; })()`);
await sleep(300);
const c05 = JSON.parse(await ev(`(() => JSON.stringify({ toast: $('toast').textContent, dirty: sessDirty, storedTrail: localStorage.getItem('snowroute.v4.trail'), storedSess: localStorage.getItem('snowroute.v5.sess') }))()`));
ok('C05a Clear Trail with the marker write broken does NOT claim a plain success | ' + JSON.stringify(c05), c05.toast.indexOf('session markers could not be saved') >= 0 && c05.storedTrail === '[]' && c05.storedSess === '[1767650000]' && c05.dirty === true);
await ev(`(() => { lsSet = window.__realLsSet; flushAux(true); return true; })()`);
const c05b = JSON.parse(await ev(`(() => JSON.stringify({ dirty: sessDirty, storedSess: localStorage.getItem('snowroute.v5.sess') }))()`));
ok('C05b the retry clears the stored markers once storage recovers | ' + JSON.stringify(c05b), c05b.dirty === false && c05b.storedSess === '[]');
R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION');
finish(R, proc);

