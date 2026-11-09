import { launchDrive, finish, bootThrough } from './harness.mjs';
import fs from 'node:fs';
const { proc, send, S, ev, consoleLog, sleep, poll } = await launchDrive();
await bootThrough(ev, poll);

// drive170: Beta 1.147 (hypothesis round H2 hardening) - the discard guard
// made LOCAL. The hypothesis round CLEARED H2 on reachability (the doors
// pane cannot be reached while a draft lives; every visible destroying path
// already asks), but its forced pokes proved the protection was structural,
// not local: crPackPickCity and the crDoorManual handler reset the draft
// with no askDiscard, so any future pane-graph change making the doors
// reachable mid-creation would silently destroy a live draft. The fix wraps
// both resets in the existing askDiscard (which no-ops on an empty draft).
// This drive proves: (a) the forced-poke paths now raise the discard confirm
// and the draft survives dismissal, while confirming still completes the
// pick; (b) first entry with an empty draft is prompt-free and unchanged on
// both doors. The pokes are labelled non-UI (they invoke handlers no visible
// control can reach mid-creation) - they test the guard, not reachability.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);

const ROADS = { 'H2 Alpha Street': [[[43.845, -79.575], [43.845, -79.565]]], 'H2 Beta Street': [[[43.855, -79.575], [43.855, -79.565]]] };
fs.writeFileSync('/tmp/d170-draft.json', JSON.stringify({ name: 'D170 Probe Route', area: 'Vaughan', mains: ['H2 Alpha Street'], roads: ROADS }));
const CITY = [{ display_name: 'Vaughan, Ontario, Canada', category: 'place', type: 'city', lat: '43.8367', lon: '-79.4982', boundingbox: ['43.7256', '43.9538', '-79.6120', '-79.3858'], address: { city: 'Vaughan', state: 'Ontario', country: 'Canada' } }];

const installStub = async () => {
  await ev(`window.__d170cities = ${JSON.stringify(CITY)}; true`);
  await ev(`(() => { const orig = window.fetch.bind(window); window.fetch = (u, o) => { const s = String(u);
    if (s.includes('nominatim.openstreetmap.org')) return Promise.resolve(new Response(JSON.stringify(window.__d170cities || []), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    if (s.endsWith('packs/index.json')) return Promise.resolve(new Response(JSON.stringify({ v: 1, cities: [{ slug: 'vaughan', name: 'Vaughan', province: 'Ontario', bbox: [43.7498436, -79.7106948, 43.9243511, -79.4200471], streets: 4477 }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    return orig(u, o); }; return true; })()`);
  await ev(`crPackIndexP = null; true`); // the boot warm cached a pre-stub catalogue promise (driveH2's rig lesson)
};
const snap = async () => JSON.parse(await ev(`JSON.stringify({ creating, stage: crStage, pane: (['rmMain','rmListPane','rmCreatePane','rmCityListPane','rmPhotoPane','rmNamePane','rmCityPane'].find(p => $(p).classList.contains('on')) || null), menuOpen: $('routeMenu').classList.contains('open'), menuShow: $('routeMenu').classList.contains('show'), modal: !$('crModal').classList.contains('hidden'), modalTitle: $('crModalTitle').textContent, tag: !!(typeof draft !== 'undefined' && draft && draft.__d170tag), streets: (typeof draft !== 'undefined' && draft) ? draftStreets().slice().sort() : null, city: crCity ? crCity.name : null })`));
const tagDraft = async () => { await ev(`if (draft) draft.__d170tag = 'TAG'; true`); };
const clickId = async (id) => ev(`(() => { const el = document.getElementById(${JSON.stringify(id)}); if (!el) return 'missing'; el.click(); return 'clicked'; })()`);
const setFile = async (selector, path) => {
  await send('DOM.enable', {}, S);
  const doc = await send('DOM.getDocument', {}, S);
  const q = await send('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector }, S);
  await send('DOM.setFileInputFiles', { nodeId: q.result.nodeId, files: [path] }, S);
  await sleep(400);
};
const openDoorsViaUI = async () => {
  const s = await snap();
  if (!s.menuOpen && !s.menuShow) await clickId('routesBtn');
  await poll(`$('routeMenu').classList.contains('open') || $('routeMenu').classList.contains('show')`, 8000);
  await clickId('rmCreate');
  await poll(`$('rmCreatePane').classList.contains('on')`, 8000);
};
const doImport = async () => {
  await openDoorsViaUI();
  await clickId('crDoorPhoto');
  await poll(`$('rmPhotoPane').classList.contains('on')`, 8000);
  await clickId('crImportBtn');
  await setFile('#crDraftFile', '/tmp/d170-draft.json');
  const landed = await poll(`creating === true && crStage === 'preview' && draft && draftStreets().length === 2`, 12000);
  await tagDraft();
  return landed;
};
const dismissModal = async () => { // the one-button discard ask dismisses via its corner X (crConfirmDismiss) - driveH2's walk idiom
  await ev(`(() => { const no = $('crModalNo'); if (no && no.style.display !== 'none') { no.click(); return 'no'; } $('crModalX').click(); return 'x'; })()`);
  await sleep(300);
};
const pokeListPick = async () => {
  await ev(`openDoors(); true`); await sleep(300); // forced: no visible control calls this mid-creation
  await clickId('crDoorList');
  await poll(`document.querySelectorAll('#crCityList button').length >= 1`, 12000);
  await ev(`document.querySelector('#crCityList button').click(); true`);
  return await poll(`!$('crModal').classList.contains('hidden')`, 8000);
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

  // ---------- (a1) FORCED POKE, list door: the confirm now rises; dismissal keeps the draft ----------
  ok('A1 setup: live tagged draft (2 streets) via the import door', await doImport());
  const modalUp = await pokeListPick();
  s = await snap();
  ok('A1 POKE: a list pick over a live draft now raises the discard confirm ("' + s.modalTitle + '") instead of silently replacing the draft',
    modalUp === true && s.modal && /Throw away/.test(s.modalTitle));
  ok('A1 while the confirm is up, the tagged draft is untouched (tag=' + s.tag + ', streets=' + JSON.stringify(s.streets) + ')',
    s.tag && s.streets !== null && s.streets.length === 2);
  await dismissModal();
  s = await snap();
  ok('A1 DISMISSAL: the draft survives intact and creation continues (creating=' + s.creating + ', streets=' + JSON.stringify(s.streets) + ')',
    !s.modal && s.creating && s.tag && s.streets !== null && s.streets.length === 2);
  await ev(`exitCreate(); true`); await sleep(300);

  // ---------- (a2) FORCED POKE, list door: confirming the discard still completes the pick ----------
  ok('A2 setup: live tagged draft again', await doImport());
  const modalUp2 = await pokeListPick();
  await clickId('crModalYes'); await sleep(400);
  const picked = await poll(`crCity && crCity.name === 'Vaughan' && draft && !draft.__d170tag && draftStreets().length === 0`, 12000);
  s = await snap();
  ok('A2 CONFIRM: on the explicit Discard the pick proceeds exactly as before (fresh draft, city=' + s.city + ', modal shown first: ' + modalUp2 + ')',
    modalUp2 === true && picked === true && s.creating);
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
