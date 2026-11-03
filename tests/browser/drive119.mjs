import { sleep, launch, closeBrowser, until, waitBoot, allExceptions, FIX } from './harness-http.mjs';
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, !!cond]);
const okS = (n, v) => ok(n, v === true);
const loadRouteWait = async (ev) => { await until(async () => { const r = await ev(`(function(){ if (typeof routeLoaded === 'undefined') return false; if (!routeLoaded && typeof loadRoute === 'function') { try { loadRoute('5w'); } catch (e) {} } return routeLoaded === true && !!window.__bootAt; })()`); return r === true; }, 30000); }; // Beta 1.76: boots end at the route menu - load 5W, retrying across the boot

// ---- Session 1: online boot, worker control, style cached, seed one marked side ----
let b = await launch(false);
okS('S1 app boots online', await waitBoot(b.ev));
okS('S1 worker registered, activated and controlling', await until(async () => await b.ev(`(async () => { const r = await navigator.serviceWorker.getRegistration(); return !!(r && r.active && r.active.state === 'activated' && navigator.serviceWorker.controller); })()`), 30000));
okS('S1 map activates online (style fetched)', await until(async () => await b.ev(`typeof glOk !== 'undefined' && glOk === true`), 30000));
const warmState = await b.ev(`window.__warm || 'unset'`);
okS('S1 basemap styles are embedded in the shell (Beta 1.33: nothing to fetch - the styles arrive with the page) | warm=' + warmState, await until(async () => await b.ev(`window.__warm === 'embedded'`), 25000));
await loadRouteWait(b.ev); // Beta 1.76
const seed = JSON.parse(await b.ev(`(() => { const n = STREETNAMES.find(x => STRETCH[x].parts.length === 1); togglePiece(n, 0, 0); return JSON.stringify({ n, v: pieces[n][0], stored: (JSON.parse(localStorage.getItem(LS.sides))).p[n][0] }); })()`));
ok('S1 seeded side marked and stored', seed.v === 1 && seed.stored === 1);
await sleep(2500); // let the storage commit land before shutdown
await closeBrowser(b);

// ---- Session 2: same profile, network OFF - boot from cache, read progress, mark offline ----
b = await launch(true);
okS('S2 app boots fully offline after browser restart', await waitBoot(b.ev, 45000));
await loadRouteWait(b.ev);
let A = JSON.parse(await b.ev(`(() => JSON.stringify({ v: pieces[${JSON.stringify(seed.n)}][0], complete: streetComplete(${JSON.stringify(seed.n)}) }))()`));
ok('S2 seeded progress visible offline', A.v === 1 && A.complete === false);
await b.ev(`(() => { togglePiece(${JSON.stringify(seed.n)}, 0, 1); return true; })()`);
A = JSON.parse(await b.ev(`(() => JSON.stringify({ complete: streetComplete(${JSON.stringify(seed.n)}), stored: (JSON.parse(localStorage.getItem(LS.sides))).p[${JSON.stringify(seed.n)}][0] }))()`));
ok('S2 street can be completed offline and the mark persists to storage', A.complete === true && A.stored === 3);
await sleep(2500);
await closeBrowser(b);

// ---- Session 3: offline again - the offline-made mark must survive another restart ----
b = await launch(true);
okS('S3 app boots offline again', await waitBoot(b.ev, 45000));
await loadRouteWait(b.ev);
A = JSON.parse(await b.ev(`(() => JSON.stringify({ complete: streetComplete(${JSON.stringify(seed.n)}) }))()`));
ok('S3 offline-made completion survives the second restart', A.complete === true);
await closeBrowser(b);

R.exceptions = allExceptions;
console.log(JSON.stringify(R, null, 1));
process.exit(0);
