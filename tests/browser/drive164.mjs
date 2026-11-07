import { launchDrive, finish, PATTERNS_GITHUB_IO, bootThrough } from './harness.mjs';
const { proc, send, S, ev, consoleLog, sleep, poll: poll120, url, poll } = await launchDrive({ patterns: PATTERNS_GITHUB_IO });
await bootThrough(ev, poll); // boots end at the route menu - click through to a loaded route

// drive164: Beta 1.143 (Packages D+E) - DA-06 + DA-12, both in the create
// flow's city machinery.
// DA-06: the city cache's serialized write queue captured the city name for
// the record key, but its failure suppression read the GLOBAL cache note and
// its disclosure named the CURRENT city. Switch cities while a write is in
// flight, let the old city's write fail, and the failure was charged to the
// NEW city: the note named it and its own writes were suppressed for the
// session. The fix binds the failure state and the disclosure to the city
// that earned them (an owner alongside the note).
// DA-12: the city search's short-query branch returned BEFORE bumping its
// sequence counter and BEFORE aborting the in-flight request, so a late
// answer passed the guard and repopulated a cleared field; reopening the
// pane had the same hole. The fix invalidates + aborts on every input
// change and pane lifecycle change, short queries included.
// Seams: crIdbGet/crIdbPut are replaced in-page for the cache section (a
// gated put keeps city A's write genuinely in flight across the switch);
// window.fetch is replaced in-page for the search section (pending promises
// the drive resolves by hand - a response that LANDS despite any abort is
// exactly the hostile case the sequence guard exists for).
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
await sleep(3000);
ok('S0 app boots for the DA-06/DA-12 tests', await poll120(`!!window.maplibregl && !!document.querySelector('#map canvas')`, 45000));

const WAYS = [[101, 'Alpha Street', [[43.79, -79.6], [43.8, -79.6]]]];
const BOX_A = { s: 43.7, n: 43.9, w: -79.7, e: -79.5 };
const BOX_B = { s: 43.6, n: 43.8, w: -79.4, e: -79.2 };
const BOX_G = { s: 43.5, n: 43.7, w: -79.3, e: -79.1 };
const BOX_D = { s: 43.4, n: 43.6, w: -79.2, e: -79.0 };

// ---------- DA-06: a stale city's failure must not disable the new city ----------
const INSTALL_IDB = `(() => {
  window.__puts = []; window.__gate = null;
  window.__holdCities = new Set(['Alpha City']); window.__failCities = new Set();
  crIdbGet = async () => null;
  crIdbPut = (rec) => {
    window.__puts.push(rec.cityName);
    if (window.__holdCities.has(rec.cityName)) return new Promise(res => { window.__gate = res; });
    return Promise.resolve(!window.__failCities.has(rec.cityName));
  };
  return true;
})()`;
ok('D0 cache seam installed (gated put for Alpha City)', await ev(INSTALL_IDB) === true);
await ev(`(() => { crCacheNote = ''; crCity = { name: 'Alpha City', lat: 43.8, lon: -79.6, bbox: null }; crCacheSaveCell('Alpha City', ${JSON.stringify(BOX_A)}, 4, 'r0c0', ${JSON.stringify(WAYS)}); return true; })()`);
await sleep(400); // Alpha's queue step is now parked inside the gated put
ok('D0b Alpha write is genuinely in flight (one put attempted, gate held)', await ev(`window.__puts.length === 1 && !!window.__gate`) === true);
// The user switches cities while Alpha's write is in flight - the same
// reset crCityPrepare performs when the new city's preparation starts.
await ev(`(() => { crCity = { name: 'Beta City', lat: 43.7, lon: -79.3, bbox: null }; crCacheNote = ''; if (typeof crCacheNoteCity !== 'undefined') crCacheNoteCity = ''; if (typeof crCacheGen !== 'undefined') crCacheGen++; return true; })()`);
await ev(`(() => { window.__gate(false); return true; })()`); // Alpha's write now FAILS, after the switch
await ev(`(async () => { await crCacheSaveCell('Beta City', ${JSON.stringify(BOX_B)}, 4, 'r0c0', ${JSON.stringify(WAYS)}); return true; })()`); // awaiting the returned queue promise settles both steps
const dState = JSON.parse(await ev(`JSON.stringify({ puts: window.__puts, note: crCacheNote, noteCity: (typeof crCacheNoteCity !== 'undefined' ? crCacheNoteCity : null) })`));
ok('D1 DA-06: the NEW city\'s writes still PUT after the old city\'s in-flight write failed | ' + JSON.stringify(dState),
  dState.puts.filter(c => c === 'Beta City').length === 1);
ok('D2 DA-06: the old city\'s late failure is never charged to the current city (no Beta note, no Beta owner) | ' + JSON.stringify(dState),
  !dState.note.includes('Beta City') && dState.noteCity !== 'Beta City');
// Control: the CURRENT city's own failure still discloses and still
// suppresses its own later writes (the fix binds the state; it does not
// abolish it). The note pair is reset by hand exactly as crCityPrepare
// resets it for a fresh preparation.
await ev(`(() => { crCacheNote = ''; if (typeof crCacheNoteCity !== 'undefined') crCacheNoteCity = ''; crCity = { name: 'Gamma City', lat: 43.6, lon: -79.2, bbox: null }; window.__holdCities.clear(); window.__failCities.add('Gamma City'); window.__puts = []; return true; })()`);
await ev(`(async () => { await crCacheSaveCell('Gamma City', ${JSON.stringify(BOX_G)}, 4, 'r0c0', ${JSON.stringify(WAYS)}); await crCacheSaveCell('Gamma City', ${JSON.stringify(BOX_G)}, 4, 'r0c1', ${JSON.stringify(WAYS)}); return true; })()`);
const gState = JSON.parse(await ev(`JSON.stringify({ puts: window.__puts, note: crCacheNote })`));
ok('D3 control: the current city\'s failure still discloses (naming it) and suppresses its OWN later writes | ' + JSON.stringify(gState),
  gState.puts.filter(c => c === 'Gamma City').length === 1 && gState.note.includes('Gamma City'));

// Session binding (Codex verify cycle 1 repro): a write commissioned
// BEFORE a reset fails LATE, after a fresh preparation of the SAME city -
// its completion must not reinstate failure state over the new
// preparation: the fresh write still PUTs and no note stands.
await ev(`(() => { window.__puts = []; window.__holdCities = new Set(['Delta City']); window.__failCities = new Set(); crCacheNote = ''; if (typeof crCacheNoteCity !== 'undefined') crCacheNoteCity = ''; crCity = { name: 'Delta City', lat: 43.5, lon: -79.1, bbox: null }; return true; })()`);
await ev(`(() => { crCacheSaveCell('Delta City', ${JSON.stringify(BOX_D)}, 4, 'r0c0', ${JSON.stringify(WAYS)}); return true; })()`); // W1, commissioned by the old preparation
const d4held = await poll(`window.__puts.length === 1 && !!window.__gate`, 8000);
await ev(`(() => { crCacheNote = ''; if (typeof crCacheNoteCity !== 'undefined') crCacheNoteCity = ''; if (typeof crCacheGen !== 'undefined') crCacheGen++; crCity = { name: 'Delta City', lat: 43.5, lon: -79.1, bbox: null }; window.__holdCities.clear(); return true; })()`); // the reset + fresh preparation; W2's put will not be held
await ev(`(async () => { const p = crCacheSaveCell('Delta City', ${JSON.stringify(BOX_D)}, 4, 'r0c1', ${JSON.stringify(WAYS)}); window.__gate(false); await p; return true; })()`); // W2 queued behind W1; W1's failure lands; awaiting the queue settles both steps
const d4 = JSON.parse(await ev(`JSON.stringify({ puts: window.__puts, note: crCacheNote })`));
ok('D4 DA-06 session binding: a stale write failing after a reset cannot suppress the new preparation\'s writes | ' + JSON.stringify(d4),
  d4held === true && d4.puts.filter(c => c === 'Delta City').length === 2 && d4.note === '');

// ---------- DA-12: a cleared / reopened city search must stay cleared ----------
const INSTALL_FETCH = `(() => {
  window.__pend = [];
  window.fetch = (u, opts) => new Promise(res => { window.__pend.push({ url: String(u), res, signal: opts ? opts.signal : null }); });
  return true;
})()`;
ok('E0 search seam installed (hand-resolved fetch)', await ev(INSTALL_FETCH) === true);
const NOMI = [{ display_name: 'Vaughan, Ontario, Canada', category: 'place', type: 'city', lat: '43.7942', lon: '-79.4532', address: { city: 'Vaughan', state: 'Ontario', country: 'Canada', country_code: 'ca' } }];
const resolveNomi = i => ev(`(() => { const p = window.__pend.filter(x => x.url.includes('nominatim'))[${i}]; if (p) p.res({ ok: true, json: async () => ${JSON.stringify(NOMI)} }); return !!p; })()`);
// Case 1: search in flight, the field is CLEARED, the answer lands late.
await ev(`(() => { const i = $('crCityInput'); i.value = 'Vaugh'; $('crCityResults').innerHTML = ''; crRunCitySearch(); return true; })()`);
ok('E0b first search is in flight', await poll(`window.__pend.filter(x => x.url.includes('nominatim')).length === 1`, 8000) === true);
await ev(`(() => { $('crCityInput').value = ''; crRunCitySearch(); return true; })()`); // what the debounce timer calls after the field is cleared
await resolveNomi(0);
await sleep(500);
const e1 = JSON.parse(await ev(`JSON.stringify({ kids: $('crCityResults').children.length, aborted: (() => { const p = window.__pend.filter(x => x.url.includes('nominatim'))[0]; return !!(p && p.signal && p.signal.aborted); })() })`));
ok('E1 DA-12: clearing the field invalidates + aborts the in-flight search - its late answer renders NOTHING | ' + JSON.stringify(e1),
  e1.kids === 0 && e1.aborted === true);
// Case 2: search in flight, the pane is REOPENED, the answer lands late.
await ev(`(() => { const i = $('crCityInput'); i.value = 'Vaugh'; $('crCityResults').innerHTML = ''; crRunCitySearch(); return true; })()`);
ok('E2a second search is in flight', await poll(`window.__pend.filter(x => x.url.includes('nominatim')).length === 2`, 8000) === true);
await ev(`(() => { crOpenCityPane('doors'); return true; })()`);
await resolveNomi(1);
await sleep(500);
const e2kids = await ev(`$('crCityResults').children.length`);
ok('E2 DA-12: reopening the pane invalidates the in-flight search - its late answer renders NOTHING | kids ' + e2kids, e2kids === 0);
// Guard: an ordinary search still renders its results (no over-invalidation).
await ev(`(() => { const i = $('crCityInput'); i.value = 'Vaugh'; $('crCityResults').innerHTML = ''; crRunCitySearch(); return true; })()`);
ok('E3a third search is in flight', await poll(`window.__pend.filter(x => x.url.includes('nominatim')).length === 3`, 8000) === true);
await resolveNomi(2);
const e3 = await poll(`$('crCityResults').children.length === 1 && $('crCityResults').textContent.includes('Vaughan')`, 8000);
ok('E3 guard: a normal city search still renders its row', e3 === true);

// Case 3 (Codex verify cycle 1): through the REAL input handler - a
// search started by typing, then the field is CLEARED: invalidation must
// happen at the input event itself, not when the 500 ms debounce would
// next run the search. A response landing inside that window renders
// nothing, and the request is already aborted at clear time.
await ev(`(() => { const i = $('crCityInput'); i.value = 'Vaug'; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
await sleep(750); // the debounce fires; the search is in flight
const e1bStart = await poll(`window.__pend.filter(x => x.url.includes('nominatim')).length === 4`, 8000);
await ev(`(() => { const i = $('crCityInput'); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`); // the clear - invalidation must be immediate
const e1bAborted = await ev(`(() => { const p = window.__pend.filter(x => x.url.includes('nominatim'))[3]; return !!(p && p.signal && p.signal.aborted); })()`);
await resolveNomi(3);
await sleep(300);
const e1bKids = await ev(`$('crCityResults').children.length`);
ok('E1b DA-12: clearing through the input handler aborts IMMEDIATELY - a response landing in the debounce window renders NOTHING | kids ' + e1bKids + ' abortedAtClear ' + e1bAborted,
  e1bStart === true && e1bAborted === true && e1bKids === 0);

R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION');
finish(R, proc);
