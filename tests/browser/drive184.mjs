import { launchDrive, finish, PATTERNS_GITHUB_IO, bootThrough } from './harness.mjs';
const { proc, send, S, ev, consoleLog, sleep, poll, url } = await launchDrive({ patterns: PATTERNS_GITHUB_IO });

// drive184: Beta 1.166 - the backup promise, proven by round-trip. The
// v2 envelope's one user-meaningful gap was the Settings toggles; 1.166
// carries them ADDITIVELY (a new top-level `settings` field). Claims:
//   R1 a backup of a full realistic state (two routes with progress,
//      two created routes, non-default settings, a theme override)
//      carries settings + created-route definitions + the night pair.
//   R2 after a TOTAL wipe (localStorage cleared, the userdata
//      database deleted), restoring that backup reproduces the seed
//      FIELD-FOR-FIELD: every slot raw, the settings record byte-exact,
//      the night pair, and every created-route definition in the store.
//   R3 the restored created routes actually LOAD with their progress.
//   R4 a PRE-1.166 backup (no settings field, definitions in the
//      envelope) restores into 1.166 identically: definitions land in
//      the store, route state lands, NO legacy record is resurrected,
//      and the device's own settings are left byte-untouched (the
//      missing-key rule).
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const UPKEY = 'snowroute.v2.userpacks';
const SETKEY = 'snowroute.v2.settings';
const PACK = (name, street) => ({ name, area: 'Vaughan', mains: [], roads: { [street]: [[[43.8, -79.57], [43.801, -79.571]]] }, reference: {} });
const canon = v => { if (v === null || typeof v !== 'object') return JSON.stringify(v); if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']'; return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}'; };
const valEq = (a, b) => { if (a === b) return true; try { return canon(JSON.parse(a)) === canon(JSON.parse(b)); } catch (e) { return false; } }; // slot values compare semantically when they are JSON (a restore writes some records re-serialized), byte-exact otherwise
const navigate = async () => { await send('Page.navigate', { url }, S); await sleep(3000); };
// A snapshot of everything the backup promises, taken in a FRESH session
// (post-reload, at the menu, no route loaded) so the seed and restored
// snapshots are symmetric. Store records are compared through
// normalizePack - the validated form is what a restore installs, and it
// is the app's own definition of two records being the same route (the
// drain keeps legacy values verbatim; the restore writes the validated
// form, exactly as every restore before 1.166 wrote it into the record).
const snapshot = async () => JSON.parse(await ev(`(async () => { const slots = {}; for (const id of ['5w', 'rt-alpha', 'rt-beta']) { const rk = routeKeys(id); const o = {}; for (const k of Object.values(rk)) { const v = localStorage.getItem(k); if (v !== null && !k.endsWith('.v5.preload')) o[k] = v; } slots[id] = o; } const rawStore = await upGetAll(); const store = {}; for (const id of Object.keys(rawStore || {})) { const v = normalizePack(rawStore[id], {}); store[id] = v.ok ? { ...v.pack, id } : { __invalid: id }; } return JSON.stringify({ slots, settings: localStorage.getItem('${SETKEY}'), night: localStorage.getItem('snowroute.v2.night'), nightExp: localStorage.getItem('snowroute.v2.nightExp'), store }); })()`));
const slotsEq = (a, b) => { const ids = new Set([...Object.keys(a), ...Object.keys(b)]); for (const id of ids) { const ka = a[id] || {}, kb = b[id] || {}; const keys = new Set([...Object.keys(ka), ...Object.keys(kb)]); for (const k of keys) { if (!(k in ka) || !(k in kb) || !valEq(ka[k], kb[k])) return false; } } return true; };

await bootThrough(ev, poll); // 5w loaded
ok('S0 app boots for the round-trip tests', await poll(`!!window.maplibregl && !!document.querySelector('#map canvas')`, 45000));

// ---------- seed: created routes via the legacy record, migrated ----------
await ev(`(() => { localStorage.setItem('${UPKEY}', JSON.stringify({ 'rt-alpha': ${JSON.stringify(PACK('Route Alpha', 'Alpha Street'))}, 'rt-beta': ${JSON.stringify(PACK('Route Beta', 'Beta Street'))} })); return true; })()`);
await navigate();
await ev(`window.__userPacksReady`);
const seeded = JSON.parse(await ev(`(async () => { const m = await upGetAll(); return JSON.stringify({ storeKeys: m ? Object.keys(m).sort() : null, legacy: localStorage.getItem('${UPKEY}') }); })()`));
ok('S1 setup: the seeded created routes migrated into the store and the legacy record is gone | ' + JSON.stringify(seeded),
  JSON.stringify(seeded.storeKeys) === JSON.stringify(['rt-alpha', 'rt-beta']) && seeded.legacy === null);

// ---------- seed: progress, settings, theme ----------
await ev(`(() => { loadRoute('5w'); return true; })()`); await sleep(800);
await ev(`(() => { markDone('Velmar', 'tap'); markDone('Mellings', 'tap'); saveAll(); return true; })()`); await sleep(300);
await ev(`(() => { loadRoute('rt-alpha'); return true; })()`); await sleep(800);
await ev(`(() => { markDone('Alpha Street', 'tap'); saveAll(); return true; })()`); await sleep(300);
await ev(`(() => { settings.vib = true; settings.chime = true; settings.chimeSound = 'bell'; saveSettings(); setThemeOverride(true); loadRoute('5w'); return true; })()`); await sleep(800);
await navigate(); // the export + seed snapshot are taken in a FRESH session (at the menu), symmetric with the post-restore snapshot - no loaded-route session state may leak into either
const bakStr = await ev(`buildBackup()`);
const bak = bakStr ? JSON.parse(bakStr) : null;
ok('R1 the backup carries the settings record, both created-route definitions, and the night pair | settings=' + (bak && bak.settings) + ' userpacks=' + (bak && bak.userpacks ? Object.keys(bak.userpacks).sort().join(',') : 'ABSENT'),
  !!bak && bak.settings === '{"vib":true,"chime":true,"chimeSound":"bell"}' && !!bak.userpacks && JSON.stringify(Object.keys(bak.userpacks).sort()) === JSON.stringify(['rt-alpha', 'rt-beta']) && typeof bak.night === 'string' && typeof bak.nightExp === 'string');
const seed1 = await snapshot();
ok('R1b the seed state is non-trivial (5w progress, created-route progress, store populated) | 5w keys=' + Object.keys(seed1.slots['5w']).length + ' alpha keys=' + Object.keys(seed1.slots['rt-alpha']).length,
  Object.keys(seed1.slots['5w']).length >= 3 && Object.keys(seed1.slots['rt-alpha']).length >= 2 && !!seed1.store && Object.keys(seed1.store).length === 2);

// ---------- wipe the origin clean ----------
await ev(`(async () => { await new Promise(res => { const rq = indexedDB.deleteDatabase('snowroute-userdata'); rq.onsuccess = () => res(true); rq.onerror = () => res(false); rq.onblocked = () => res(false); }); localStorage.clear(); return true; })()`);
await navigate();
const pristine = JSON.parse(await ev(`(async () => { const m = await upGetAll(); return JSON.stringify({ packs: ROUTE_PACKS.map(p => p.id), vib: settings.vib, chimeSound: settings.chimeSound, storeKeys: m ? Object.keys(m) : null, settingsRaw: localStorage.getItem('${SETKEY}') }); })()`));
ok('R2a the wipe is total: only the shipped route remains, settings are the defaults, the store is empty | ' + JSON.stringify(pristine),
  JSON.stringify(pristine.packs) === JSON.stringify(['5w']) && pristine.vib === false && pristine.chimeSound === 'two' && JSON.stringify(pristine.storeKeys) === '[]' && pristine.settingsRaw === null);

// ---------- restore and compare field-for-field ----------
await ev(`(async () => { await restoreBackup(JSON.parse(${JSON.stringify(JSON.stringify(bak))})); return true; })()`);
await sleep(3500); // the restore reloads
const seed2 = await snapshot();
ok('R2 the restored state matches the seed FIELD-FOR-FIELD (every slot value, the night pair, every store record through the validator) | slotsEq=' + slotsEq(seed1.slots, seed2.slots) + ' storeEq=' + (canon(seed1.store) === canon(seed2.store)),
  slotsEq(seed1.slots, seed2.slots) && canon(seed1.store) === canon(seed2.store) && seed1.night === seed2.night && seed1.nightExp === seed2.nightExp);
ok('R2b the settings record is BYTE-exact after the round-trip | ' + seed2.settings, seed2.settings === '{"vib":true,"chime":true,"chimeSound":"bell"}' && seed1.settings === seed2.settings);
await ev(`(() => { loadRoute('rt-alpha'); return true; })()`); await sleep(1200);
const r3 = JSON.parse(await ev(`JSON.stringify({ loaded: typeof routeLoaded !== 'undefined' && routeLoaded === true && !!activeRoute && activeRoute.id === 'rt-alpha', complete: typeof streetComplete === 'function' ? streetComplete('Alpha Street') : null, vib: settings.vib, chime: settings.chime, chimeSound: settings.chimeSound })`));
ok('R3 the restored created route loads WITH its progress, and the restored settings are live in memory | ' + JSON.stringify(r3),
  r3.loaded === true && r3.complete === true && r3.vib === true && r3.chime === true && r3.chimeSound === 'bell');

// ---------- R4: a pre-1.166 backup restores into 1.166 ----------
await ev(`(() => { settings.vib = false; settings.chime = false; settings.chimeSound = 'pop'; saveSettings(); return true; })()`);
const deviceSettings = await ev(`localStorage.getItem('${SETKEY}')`);
const oldBak = { app: 'snowroute-backup', v: 2, at: new Date().toISOString(), routes: { 'rt-old': { done: '["Old Street"]' } }, userpacks: { 'rt-old': PACK('Old Route', 'Old Street') }, night: '1' }; // no settings field, no nightExp - the pre-1.166 shape
await ev(`(async () => { await restoreBackup(JSON.parse(${JSON.stringify(JSON.stringify(oldBak))})); return true; })()`);
await sleep(3500); // the restore reloads
const r4 = JSON.parse(await ev(`(async () => { const rec = await upGet('rt-old'); return JSON.stringify({ inStore: !!rec && !!rec.roads && !!rec.roads['Old Street'], done: localStorage.getItem(routeKeys('rt-old').done), legacy: localStorage.getItem('${UPKEY}'), settings: localStorage.getItem('${SETKEY}'), night: localStorage.getItem('snowroute.v2.night') }); })()`));
ok('R4 a pre-1.166 backup restores into 1.166: the definition lands in the STORE, its state lands, no legacy record is resurrected | ' + JSON.stringify(r4),
  r4.inStore === true && r4.done === '["Old Street"]' && r4.legacy === null);
ok('R4b the old backup leaves the device settings byte-untouched (missing-key rule) while its own night value lands | settings=' + r4.settings,
  r4.settings === deviceSettings && r4.night === '1');

R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION');
finish(R, proc);
