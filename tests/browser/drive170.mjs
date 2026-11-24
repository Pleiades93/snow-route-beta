import { launchDrive, finish, bootThrough } from './harness.mjs';
const { proc, send, S, ev, consoleLog, sleep, poll } = await launchDrive();
await bootThrough(ev, poll);

// drive170: forced door clicks verify first-pick preservation and
// replacement discard behaviour independently of pane reachability.
// The manual door keeps its own askDiscard wrap (B2/A3).
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);

const ROADS = { 'H2 Alpha Street': [[[43.845, -79.575], [43.845, -79.565]]], 'H2 Beta Street': [[[43.855, -79.575], [43.855, -79.565]]] };
const DRAFT = { name: 'D170 Probe Route', area: 'Vaughan', primaries: ['H2 Alpha Street'], roads: ROADS };
const CITY = [{ display_name: 'Vaughan, Ontario, Canada', category: 'place', type: 'city', lat: '43.8367', lon: '-79.4982', boundingbox: ['43.7256', '43.9538', '-79.6120', '-79.3858'], address: { city: 'Vaughan', state: 'Ontario', country: 'Canada' } }];

const installStub = async () => {
  await ev(`window.__d170cities = ${JSON.stringify(CITY)}; true`);
  await ev(`(() => { const orig = window.fetch.bind(window); window.fetch = (u, o) => { const s = String(u);
    if (s.includes('nominatim.openstreetmap.org')) return Promise.resolve(new Response(JSON.stringify(window.__d170cities || []), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    if (s.endsWith('packs/index.json')) return Promise.resolve(new Response(JSON.stringify({ v: 1, cities: [{ slug: 'vaughan', name: 'Vaughan', province: 'Ontario', bbox: [43.7498436, -79.7106948, 43.9243511, -79.4200471], streets: 4477 }, { slug: 'barrie', name: 'Barrie', province: 'Ontario', bbox: [44.3400, -79.7800, 44.4500, -79.6200], streets: 2100 }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    return orig(u, o); }; return true; })()`);
  await ev(`crPackIndexP = null; true`); // the boot warm cached a pre-stub catalogue promise (driveH2's rig lesson)
};
const snap = async () => JSON.parse(await ev(`JSON.stringify({ creating, stage: crStage, pane: (['rmMain','rmListPane','rmCreatePane','rmCityListPane','rmNamePane','rmCityPane'].find(p => $(p).classList.contains('on')) || null), menuOpen: $('routeMenu').classList.contains('open'), menuShow: $('routeMenu').classList.contains('show'), modal: !$('crModal').classList.contains('hidden'), modalTitle: $('crModalTitle').textContent, tag: !!(typeof draft !== 'undefined' && draft && draft.__d170tag), streets: (typeof draft !== 'undefined' && draft) ? draftStreets().slice().sort() : null, primaries: (typeof draft !== 'undefined' && draft) ? [...draft.primaries].sort() : null, pending: Object.keys(crPending || {}).sort(), city: crCity ? crCity.name : null })`));
const tagDraft = async () => { await ev(`if (draft) draft.__d170tag = 'TAG'; true`); };
const clickId = async (id) => ev(`(() => { const el = document.getElementById(${JSON.stringify(id)}); if (!el) return 'missing'; el.click(); return 'clicked'; })()`);
const openDoorsViaUI = async () => {
  const s = await snap();
  if (!s.menuOpen && !s.menuShow) await clickId('routesBtn');
  await poll(`$('routeMenu').classList.contains('open') || $('routeMenu').classList.contains('show')`, 8000);
  await clickId('rmCreate');
  await poll(`$('rmCreatePane').classList.contains('on')`, 8000);
};
const doImport = async () => {
  // Beta 1.243: the Upload photo door - and importDraft, its import half - is
  // REMOVED from the app, so the live draft this drive guards is seeded
  // directly: the same fixture through the same fail-closed validator
  // (normalizePack with its draft option, which stays for the backup / save /
  // boot paths), landed with importDraft's own assignments verbatim, then
  // enterCreate('preview') exactly as the import did.
  await openDoorsViaUI();
  const seeded = await ev(`(() => { const v = normalizePack(${JSON.stringify(DRAFT)}, { draft: true }); if (!v.ok) return 'bad: ' + v.error; const pk = v.pack; draft = newDraft(); draft.roads = pk.roads; draft.primaries = new Set(pk.primaries); draft.name = pk.name || ''; draft.area = pk.area || ''; draft.tileNames = pk.tileNames.slice(); draft.osmNames = Object.create(null); for (const k of Object.keys(pk.roads)) draft.osmNames[k] = k; enterCreate('preview'); return 'ok'; })()`);
  const landed = seeded === 'ok' && (await poll(`creating === true && crStage === 'preview' && draft && draftStreets().length === 2`, 12000));
  await tagDraft();
  return landed;
};
const dismissModal = async () => { // the one-button discard ask dismisses via its corner X (crConfirmDismiss) - driveH2's walk idiom
  await ev(`(() => { const no = $('crModalNo'); if (no && no.style.display !== 'none') { no.click(); return 'no'; } $('crModalX').click(); return 'x'; })()`);
  await sleep(300);
};
const pokeListPick = async (name) => {
  await ev(`openDoors(); true`); await sleep(300); // forced: no visible control calls this mid-creation
  await clickId('crDoorList');
  await poll(`document.querySelectorAll('#crCityList button').length >= 2`, 12000);
  await ev(`(() => { const b = [...document.querySelectorAll('#crCityList button')].find(x => x.textContent.includes(${JSON.stringify(name)})); if (b) b.click(); return !!b; })()`);
  await sleep(500); // a prompt, when one is owed, rises synchronously out of the click
};

try {
  await installStub();

  // ---------- (b1) FIRST ENTRY, list door, empty draft: no prompt, pick lands as before ----------
  await openDoorsViaUI();
  await clickId('crDoorList');
  ok('B1 city list renders rows from the (stubbed) catalogue', (await poll(`document.querySelectorAll('#crCityList button').length >= 1`, 12000)) === true);
  await ev(`document.querySelector('#crCityList button').click(); true`);
  const b1 = await poll(`creating === true && crCity && crCity.name === 'Vaughan'`, 12000);
  let s = await snap();
  ok('B1 first entry via the list door: NO discard prompt at any point and creation opens on a fresh draft | ' + JSON.stringify(s),
    b1 === true && !s.modal && s.streets !== null && s.streets.length === 0);
  await ev(`exitCreate(); true`); await sleep(300);

  // ---------- (b2) FIRST ENTRY, manual door, empty draft: no prompt, city pane opens as before ----------
  await openDoorsViaUI();
  await clickId('crDoorManual');
  const b2 = await poll(`$('rmCityPane').classList.contains('on')`, 8000);
  s = await snap();
  ok('B2 first entry via the manual door: NO discard prompt and the city pane opens (ret=doors) | ' + JSON.stringify(s),
    b2 === true && !s.modal && s.pane === 'rmCityPane');
  await clickId('crCityBack'); await sleep(300);
  await ev(`closeRouteMenu(); true`); await sleep(300);

  // ---------- (a1) FORCED POKE, list door, FIRST pick with streets picked: no prompt, the draft survives whole (D-01) ----------
  ok('A1 setup: live tagged draft (2 streets), seeded as the retired import door landed it (Beta 1.243)', await doImport());
  await ev(`crPending['H2 Pending Street'] = { osmName: 'H2 Pending Street', lngLat: null, openEnd: null }; true`); // a pending row rides the draft into the pick
  await pokeListPick('Vaughan');
  const a1Landed = await poll(`crCity && crCity.name === 'Vaughan' && crStage === 'pick'`, 12000);
  s = await snap();
  ok('A1 FIRST PICK: NO discard prompt at any point (modal=' + s.modal + ') and the pick lands (city=' + s.city + ', stage=' + s.stage + ')',
    a1Landed === true && !s.modal);
  ok('A1 the draft survives whole: same object (tag=' + s.tag + '), streets=' + JSON.stringify(s.streets) + ', primaries=' + JSON.stringify(s.primaries) + ', pending=' + JSON.stringify(s.pending),
    s.tag && s.streets !== null && s.streets.length === 2 && JSON.stringify(s.primaries) === JSON.stringify(['H2 Alpha Street']) && s.pending.includes('H2 Pending Street'));
  await ev(`exitCreate(); true`); await sleep(300);

  // ---------- (a2) FORCED POKE, list door, REPLACEMENT with streets picked: exactly one prompt, deferred reset, confirm replaces (D-01) ----------
  ok('A2 setup: live tagged draft again', await doImport());
  await pokeListPick('Vaughan'); // the first pick: lands prompt-free, the draft survives, a city is now in force
  const a2Setup = await poll(`crCity && crCity.name === 'Vaughan' && draft && draft.__d170tag && draftStreets().length === 2`, 12000);
  ok('A2 setup: first pick landed with the draft intact, city in force (setup=' + a2Setup + ')', a2Setup === true);
  await pokeListPick('Barrie');
  s = await snap();
  ok('A2 REPLACEMENT: exactly one discard prompt rises ("' + s.modalTitle + '")',
    s.modal && /Throw away/.test(s.modalTitle));
  ok('A2 while the prompt stands, nothing has reset: city=' + s.city + ', tag=' + s.tag + ', streets=' + JSON.stringify(s.streets),
    s.city === 'Vaughan' && s.tag && s.streets !== null && s.streets.length === 2);
  await clickId('crModalYes'); await sleep(400);
  const a2Picked = await poll(`crCity && crCity.name === 'Barrie' && draft && !draft.__d170tag && draftStreets().length === 0`, 12000);
  await sleep(600);
  s = await snap();
  ok('A2 CONFIRM: the replacement lands on a fresh draft (city=' + s.city + ') and NO second prompt follows (modal=' + s.modal + ')',
    a2Picked === true && !s.modal && s.creating);

  // ---------- (a2c) REPLACEMENT with nothing picked: no prompt, the pick lands at once (D-01) ----------
  await pokeListPick('Vaughan'); // crCity is Barrie, the draft is empty: askDiscard no-ops inside crPickCity
  const a2cLanded = await poll(`crCity && crCity.name === 'Vaughan'`, 12000);
  s = await snap();
  ok('A2c EMPTY REPLACEMENT: NO discard prompt (modal=' + s.modal + ') and the new city lands at once (city=' + s.city + ')',
    a2cLanded === true && !s.modal);
  await ev(`exitCreate(); true`); await sleep(300);

  // ---------- (a3) FORCED POKE, manual door: the confirm now rises there too ----------
  ok('A3 setup: live tagged draft again', await doImport());
  await ev(`document.getElementById('crDoorManual').click(); true`); // forced: the element sits on the unreachable doors pane
  const modalUp3 = await poll(`!$('crModal').classList.contains('hidden')`, 8000);
  s = await snap();
  ok('A3 POKE: the manual-door handler now raises the discard confirm over a live draft ("' + s.modalTitle + '")',
    modalUp3 === true && s.modal && /Throw away/.test(s.modalTitle) && s.tag && s.streets !== null && s.streets.length === 2);
  await dismissModal();
  s = await snap();
  ok('A3 DISMISSAL: the draft survives intact and creation continues',
    !s.modal && s.creating && s.tag && s.streets !== null && s.streets.length === 2);
  await ev(`exitCreate(); true`); await sleep(300);
} catch (e) {
  R.fatal = String(e && e.message || e);
}
R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String(c.text || '').slice(0, 220));
finish(R, proc);
