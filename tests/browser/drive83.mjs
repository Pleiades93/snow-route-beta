import { launchDrive, finish, bootThrough } from './harness.mjs';
const { proc, ev, consoleLog, sleep, poll } = await launchDrive();
await bootThrough(ev, poll); // Beta 1.76: boots end at the route menu now - click through to a loaded route


// drive83: v5.47 external-audit fix battery (SEC-2, 3, 4, 6a, 9a, 9b)
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const exc = () => consoleLog.filter(c => c.type === 'EXCEPTION').length;
const seedReload = async (obj) => {
  await ev(`(() => { for (const k in ${JSON.stringify(obj)}) localStorage.setItem(k, ${JSON.stringify(obj)}[k]); location.reload(); return true; })()`);
  await sleep(3000);
  await ev(`loadRoute('5w'); true`); await sleep(600); // Beta 1.76: a reload lands on the route menu
};
await sleep(3000);
// P1 SEC-3: prototype names must not enter doneSet / doneTimes
await seedReload({ 'snowroute.5w.v2': '["constructor","Velmar"]', 'snowroute.5w.v2.times': '{"Velmar":"2026-01-05T12:00:00.000Z","constructor":"2026-01-05T12:00:00.000Z"}' });
let A = JSON.parse(await ev(`(() => JSON.stringify({ n: doneSet.size, hdr: $('count').textContent, tc: Object.keys(doneTimes).length }))()`));
ok('SEC-3 doneSet excludes "constructor" (size 1)', A.n === 1);
ok('SEC-3 header reads 1 of 34', /1 of 34/.test(A.hdr));
ok('SEC-3 doneTimes excludes "constructor"', A.tc === 1);
// P2 SEC-9b: numeric time is dropped
await seedReload({ 'snowroute.5w.v2': '["Velmar"]', 'snowroute.5w.v2.times': '{"Velmar": 12345}' });
A = JSON.parse(await ev(`(() => JSON.stringify({ tc: Object.keys(doneTimes).length }))()`));
ok('SEC-9b numeric doneTimes dropped', A.tc === 0);
// P3 SEC-2: malformed notes cannot kill the export panel
await seedReload({ 'snowroute.5w.v2': '["Angie","Velmar"]', 'snowroute.5w.v4.notes': '{"Velmar":"x","Angie":[{"k":"deep","at":"2026-01-05T12:00:00.000Z"}]}' });
const e0 = exc();
await ev(`(() => { openExport(); return true; })()`); // Beta 1.88: the export surface is the settings takeover's backup pane now (Summary mode is gone with the old Snow log)
await sleep(500);
A = JSON.parse(await ev(`(() => { const bb = buildBackup(); return JSON.stringify({ open: $('setMenu').classList.contains('open') && $('setBackupPane').classList.contains('on'), hasFlag: !!bb && bb.includes('deep'), velmarNotes: notes.Velmar }); })()`)); // Beta 1.89: the backup is no longer rendered into a box - the builder itself is the read
ok('SEC-2 export panel opens despite poisoned notes', A.open);
ok('SEC-2 valid flag still in the backup', A.hasFlag);
ok('SEC-2 string notes entry deleted at load', A.velmarNotes === undefined);
ok('SEC-2 no exception from the backup open', exc() === e0);
// P4 SEC-9a: absurd trail timestamp dropped, GPX export survives
await seedReload({ 'snowroute.5w.v4.trail': '[[43.81,-79.56,1767225600],[43.82,-79.57,1e300]]' });
A = JSON.parse(await ev(`(() => JSON.stringify({ tl: trail.length }))()`));
ok('SEC-9a out-of-range trail point dropped', A.tl === 1);
const e1 = exc();
await ev(`(() => { document.__gpx188 = buildGpx(); return true; })()`); // Beta 1.88: no GPX button anymore - the export builder itself is what SEC-9a protects, so it is exercised directly
await sleep(400);
A = JSON.parse(await ev(`(() => JSON.stringify({ gpx: (document.__gpx188 || '').includes('<trkpt') }))()`));
ok('SEC-9a GPX export still builds with trkpt', A.gpx);
ok('SEC-9a no exception from GPX export', exc() === e1);
// P5 SEC-4: restore survives its own pagehide flush
await ev(`(() => { localStorage.clear(); location.reload(); return true; })()`); await sleep(3000);
await ev(`(() => { trail.push([43.9, -79.9, 1767225600]); trailDirty = true; $('xText').value = JSON.stringify({ app: 'snowroute-backup', v: 1, data: { 'snowroute.v4.trail': '[[43.8,-79.5,1767225600]]' } }); doRestore(); flushAux(true); return true; })()`);
await sleep(300);
A = JSON.parse(await ev(`(() => JSON.stringify({ ls: localStorage.getItem('snowroute.5w.v4.trail') }))()`));
ok('SEC-4 flush after restore does NOT clobber restored trail', A.ls === '[[43.8,-79.5,1767225600]]');
await sleep(1500);   // the restore's reload lands
// Beta 1.76 hardening: poll-with-load - a single loadRoute after a fixed sleep can land in the
// pre-reload page (its routeLoaded guard then leaves the fresh page unloaded and the read races).
for (let i = 0; i < 40; i++) { await ev(`(function(){ if (typeof routeLoaded !== 'undefined' && !routeLoaded && typeof loadRoute === 'function') { try { loadRoute('5w'); } catch (e) {} } return true; })()`); try { A = JSON.parse(await ev(`(() => JSON.stringify({ tl: trail.length, lat: trail.length ? trail[0][0] : null }))()`)); } catch (e) { A = { tl: 0, lat: null }; } if (A.tl === 1 && A.lat === 43.8) break; await sleep(300); } // Beta 1.88 hardening: an ev landing mid-navigation can return a non-string and the bare parse killed the drive (seen twice locally in the 1.88 round) - a bad read is just a poll that missed, the loop's own deadline still bounds it
ok('SEC-4 after reload, trail is the restored one', A.tl === 1 && A.lat === 43.8);
// P6 SEC-6a (rewritten Beta 1.48, audit B06): the old check called
// prepOfflineMaps() - a function that no longer exists - so it passed while
// testing nothing, and asserted an unrelated key. This drives the REAL
// preload (the Snow log panel's Download button) with every fetch failing,
// and asserts the app reports the failure honestly: zero saved, the full
// list counted, no exception.
const e6 = exc();
await ev(`(() => { localStorage.removeItem('snowroute.5w.v5.preload'); window.__realFetch83 = window.fetch; window.fetch = () => Promise.reject(new Error('offline')); $('xPre').click(); return true; })()`);
let stat83 = '';
for (let i = 0; i < 60; i++) { stat83 = await ev(`$('xPreStat').textContent`); if (/Offline maps: saved/.test(stat83)) break; await sleep(250); }
await ev(`(() => { window.fetch = window.__realFetch83; return true; })()`);
A = JSON.parse(await ev(`(() => { const rec = JSON.parse(localStorage.getItem('snowroute.5w.v5.preload') || 'null'); return JSON.stringify({ stat: $('xPreStat').textContent, saved: rec && rec.saved, total: rec && rec.total }); })()`));
ok('SEC-6a real preload on a dead network reports saved 0 of the full list | ' + JSON.stringify(A), A.saved === 0 && A.total > 800 && /saved 0 of/.test(A.stat));
ok('SEC-6a failed preload raised no exception', exc() === e6);
// P7 (Beta 1.48, audit B04): a backup must fail CLOSED when a key cannot be
// read - a valid-looking backup with a piece silently missing is worse than
// none. One key's read is made to throw; buildBackup must return null.
const e7 = exc();
await ev(`(() => { const orig = Storage.prototype.getItem; Storage.prototype.getItem = function (k) { if (k === 'snowroute.5w.v2') throw new Error('read fail'); return orig.call(this, k); }; window.__bb = buildBackup(); Storage.prototype.getItem = orig; return true; })()`);
A = JSON.parse(await ev(`(() => JSON.stringify({ bb: window.__bb }))()`));
ok('B04 backup fails closed when a key cannot be read', A.bb === null);
ok('B04 the failed read raises no stray exception', exc() === e7);
R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String((c.args && c.args[0]) || c.text || '').slice(0, 220));
finish(R, proc);

