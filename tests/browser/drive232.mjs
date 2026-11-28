import { launchDrive, finish, bootThrough } from './harness.mjs';
const { proc, send, S, ev, consoleLog, sleep, poll } = await launchDrive();
await bootThrough(ev, poll); // boots end at the route menu - click through to a loaded route

// drive232: the state-models round's new behavioural checks
// (docs/STATE-MODELS.md): C3-C5, C7 partial, F1, F3, F6.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`);
return typeof raw === 'string' ? JSON.parse(raw) : {}; };

const base = JSON.parse(await ev(`(() => { const part = STRETCH.Velmar.parts[0]; const mid = part[Math.floor(part.length / 2)]; return JSON.stringify({ lat: mid[0], lng: mid[1] }); })()`));
const STUB = `(() => { window.__wpCalls = 0; window.__wpOk = null; navigator.geolocation.watchPosition = (ok2) => { window.__wpCalls++; window.__wpOk = ok2; return 4242; };
navigator.geolocation.clearWatch = () => {}; window.__feed = { on: false, lat: ${base.lat}, lng: ${base.lng} };
window.__feedTimer = setInterval(() => { const f = window.__feed; if (!f.on || !window.__wpOk) return;
window.__wpOk({ coords: { latitude: f.lat, longitude: f.lng, accuracy: 8, speed: 2, heading: 90 }, timestamp: Date.now() }); }, 1000); return true; })()`;
await ev(STUB);

// ---- C3: follow suspension preserves recording ----
await ev(`(() => { startClean(); window.__feed.on = true; return true; })()`);
ok('C3 setup: the clean is running and GPS took a fix', await poll(`lastFixAt > 0`, 20000) === true && await J(`!!runStart`));
const t0 = await J(`trail.length`);
await ev(`(() => { map.fire('dragstart'); return true; })()`);
const paused = await J(`({ fp: followPaused, w: watchId !== null, rec: gpsFromRun, run: runStart !== 0 })`);
ok('C3 dragstart pauses following; watch, recording ownership and clean all remain',
  paused.fp === true && paused.w === true && paused.rec === true && paused.run === true);
ok('C3 fixes keep recording the trail while following is paused',
  await poll(`trail.length > ${t0}`, 10000) === true);

// ---- C4: hidden page flushes and preserves the clean ----
await ev(`(() => { window.__feed.on = false; settings.awake = true; syncWake(); return true; })()`);
await sleep(1400); // let any in-flight fix land before the trail snapshot
const runBefore = await J(`runStart`);
const heldBefore = await J(`wakeLock !== null`);
const trailNow = await J(`({ n: trail.length, last: trail.length ? trail[trail.length - 1][2] : 0 })`);
await ev(`(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); return true; })()`);
await sleep(400);
const afterHide = await J(`({ run: runStart, lock: wakeLock !== null, stored: (() => { try { const t = JSON.parse(localStorage.getItem(LS.trail) || '[]');`
  + ` return { n: t.length, last: t.length ? t[t.length - 1][2] : 0 }; } catch (e) { return { n: -1, last: -1 }; } })() })`);
ok('C4 hiding the page leaves the clean identity untouched', afterHide.run === runBefore && runBefore !== 0);
ok('C4 hiding the page flushes the pending trail to storage', afterHide.stored.n === trailNow.n && afterHide.stored.last === trailNow.last);
ok('C4 a held wake lock is released while hidden', heldBefore === false || afterHide.lock === false);
await ev(`(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); return true; })()`);

// ---- C5: a reload loses the pending gap flag, keeps the clean ----
const trueStart = await J(`+localStorage.getItem(LS.start)`);
await ev(`(() => { runStart = Date.now() - 120000; lastFixAt = Date.now() - 60000; watchStartedAt = Date.now() - 120000; return true; })()`); // the run is two minutes old and its watch has been silent a minute
const calls0 = await J(`window.__wpCalls`);
ok('C5 setup: the watchdog stamps the pending gap on this clean',
  await poll(`window.__wpCalls > ${calls0}`, 30000) === true && await J(`gpsGapRuns.get(LS.start) === runStart`));
const boot0 = await J(`window.__bootAt || 0`);
await ev(`location.reload(); true`);
for (let i = 0; i < 75; i++) { try { if (await ev(`!!window.__bootAt && window.__bootAt > ${boot0}`)) break; } catch (e) {} await sleep(400); } // the terminal signal: a NEW boot stamp, not an element both pages carry
await sleep(3200);
await ev(`loadRoute('5w'); true`);
ok('C5 the clean resumes from its start key after reload', await poll(`runStart === ${trueStart}`, 20000) === true);
ok('C5 the pending gap flag does not survive the reload', await J(`gpsGapRuns.size === 0`));
await ev(`(() => { const ns = STREETNAMES.slice(0, 3); for (const n of ns) markStreet(n, true); return true; })()`);
const snap = await J(`(() => { const s = finishRun(); return s ? { gap: s.gpsGap === true } : null; })()`);
const storedHist = await J(`(() => { try { const h = JSON.parse(localStorage.getItem(LS.hist) || '[]'); return h.length ? { gap: h[h.length - 1].gpsGap === true } : null; } catch (e) { return null; } })()`);
ok('C5 the finish archives, and the pre-reload gap never reaches the record',
  snap !== null && snap.gap === false && storedHist !== null && storedHist.gap === false);
await ev(STUB); // stub again: the reload restored the real (silent) geolocation

// ---- C7 partial arm: under three streets clears without an archive ----
const h0 = await J(`history.length`);
await ev(`(() => { startClean(); const ns = STREETNAMES.slice(0, 2); for (const n of ns) markStreet(n, true); return true; })()`);
const c7 = await J(`(() => { const r = finishRun(); return { ret: r === null, h: history.length, run: runStart, done: doneSet.size }; })()`);
ok('C7 a partial clean under three streets clears without an archive',
  c7.ret === true && c7.h === h0 && c7.run === 0 && c7.done === 0);

// ---- F1: the flow raises nothing of its own while finModal waits ----
await ev(`(() => { startClean(); const ns = STREETNAMES.slice(0, 3); for (const n of ns) markStreet(n, true); gpsGapRuns.set(LS.start, runStart); return true; })()`);
await poll(`!$('banner').classList.contains('show')`, 9000); // isolation: unrelated boot banners clear first; F1 grades the flow's own emissions only
await ev(`(() => { $('resetBtn').click(); return true; })()`);
await poll(`!$('finModal').classList.contains('hidden')`, 10000);
const modalWait = await J(`({ show: $('banner').classList.contains('show'), vis: getComputedStyle($('banner')).visibility, head: $('bannerHead').textContent })`);
ok('F1 with a gap pending, no banner stands while the Finish confirmation waits | sampled ' + JSON.stringify(modalWait),
  modalWait.show === false && modalWait.vis === 'hidden');
await ev(`(() => { $('finNo').click(); return true; })()`);
await poll(`$('finModal').classList.contains('hidden')`, 10000);

// ---- F6: a failed save with a gap pending releases no advisory ----
await ev(`(() => { window.__origSI = Storage.prototype.setItem; Storage.prototype.setItem = function(k, v) { if (k === LS.hist) throw new Error('quota'); return window.__origSI.call(this, k, v); }; return true; })()`);
const hF = await J(`history.length`);
await ev(`(() => { $('resetBtn').click(); return true; })()`);
await poll(`!$('finModal').classList.contains('hidden')`, 10000);
await ev(`(() => { $('finYes').click(); return true; })()`);
await sleep(900);
const f6 = await J(`({ head: $('bannerHead').textContent, line: $('bannerLine').textContent, show: $('banner').classList.contains('show'), run: runStart !== 0, h: history.length, done: doneSet.size })`);
await ev(`(() => { Storage.prototype.setItem = window.__origSI; return true; })()`);
ok('F6 the failed finish reports Finish stopped, never the gap advisory',
  f6.show === true && f6.head === 'Finish stopped' && /clean is intact/.test(f6.line || ''));
ok('F6 the clean stays intact after the stopped finish', f6.run === true && f6.h === hF && f6.done === 3);
await ev(`(() => { cancelStart(); return true; })()`);

// ---- F3: one carrier, replacement restarts the lifecycle ----
await ev(`(() => { showBanner('F3-FIRST', 'one'); return true; })()`);
await sleep(2000);
const f3a = await J(`({ show: $('banner').classList.contains('show'), head: $('bannerHead').textContent, n: document.querySelectorAll('#banner').length })`);
await ev(`(() => { showBanner('F3-SECOND', 'two'); return true; })()`);
await sleep(2600); // past the first banner's exit end; the replacement is mid-stay
const f3b = await J(`({ show: $('banner').classList.contains('show'), vis: getComputedStyle($('banner')).visibility, head: $('bannerHead').textContent, n: document.querySelectorAll('#banner').length })`);
ok('F3 a re-fire replaces the content on the one carrier', f3a.show === true && f3a.head === 'F3-FIRST' && f3a.n === 1 && f3b.head === 'F3-SECOND' && f3b.n === 1);
ok('F3 the superseded banner exit cannot hide its replacement', f3b.show === true && f3b.vis === 'visible');
ok('F3 the replacement leaves on its own', await poll(`!$('banner').classList.contains('show') && getComputedStyle($('banner')).visibility === 'hidden'`, 5000) === true);
await send('Emulation.setEmulatedMedia', { media: '', features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, S);
await ev(`(() => { showBanner('F3-RM-ONE', 'one'); return true; })()`);
await sleep(1200);
await ev(`(() => { showBanner('F3-RM-TWO', 'two'); return true; })()`);
await sleep(2100); // past the first banner's 3000 ms timer; the replacement's still runs
const f3c = await J(`({ show: $('banner').classList.contains('show'), head: $('bannerHead').textContent })`);
ok('F3 under reduced motion the superseded timer cannot hide its replacement', f3c.show === true && f3c.head === 'F3-RM-TWO');
ok('F3 the reduced-motion replacement leaves on its own timer', await poll(`!$('banner').classList.contains('show')`, 4000) === true);
await send('Emulation.setEmulatedMedia', { media: '', features: [] }, S);
await ev(`(() => { window.__feed.on = false; stopGps(); return true; })()`);

R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String(c.text || '').slice(0, 200));
finish(R, proc);
