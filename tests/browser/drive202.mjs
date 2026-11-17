import { launchDrive, finish, bootThrough, tapSelector } from './harness.mjs';
const { proc, ev, consoleLog, sleep, poll } = await launchDrive();
await bootThrough(ev, poll); // boots end at the route menu - click through to a loaded route

// drive202 (SESSION tier): Beta 1.219 - the icon packs grow to the live extras, the road
// swap, the Glyph summer sun, the Puffy retirement, and the close ✕ wearing the pack.
// Beta 1.220 re-derivation: the roster is THREE monochrome mask packs - Glyph Neue (the
// default), Material Filled, Windows 10 - and the two vector/colour packs are retired
// whole. Every check stands at its 1.219 strength, re-pointed at the live roster (the
// night census now runs under all three packs, not Glyph alone).
// Proven live in the rendered app (the static byte pins live in proof-icon-extras-1219):
//  - the extras stamp per pack, day and night: the Pace stat cells (clock, road, flag,
//    list, cal, gauge in the Pace menu; trail on a past clean's detail), the street-row
//    pin (.smap) and note marks (.ntIco / .nmNote), the selection card's note button;
//  - Andrew's road rule: the Streets button wears the HIGHWAY variant and the Pace
//    "Road cleared" stat wears the BASIC road, in every pack;
//  - the flag rule: the Pace button keeps the checkered finish flag; the ETA stat is
//    the plain flag - a different artwork in every pack;
//  - the Glyph sun is the summer artwork (read off the night host, where the sun rides);
//  - the close ✕ wears the pack in both jobs (corner family + the bottom-centre pair),
//    every pack's artwork in the same boxes - every ✕ box measures the same;
//  - ZERO LAYOUT SHIFT: the stat cell, the street row, the selection card and the tab
//    bar measure identical under all three packs (each surface measured while IT is
//    the open one - the sheets are exclusive and openPace deselects);
//  - switching packs re-stamps the extras and the ✕ hosts IN PLACE (marker survives,
//    the open sheet stays open);
//  - the retired packs are gone: no picker rows, no registry, and a stored retired id
//    boots cleanly onto the Glyph default.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };

const EX = () => J(`(() => ({
  gEx: GLYPH_EXTRAS, gPace: GLYPH_PACE_ICONS, mEx: MAT_EXTRAS, mPace: MAT_PACE_ICONS, wEx: WIN10_EXTRAS, wPace: WIN10_PACE_ICONS,
  gStreets: GLYPH_ICONS.streets, mStreets: MAT_ICONS.streets, wStreets: WIN10_ICONS.streets,
  gSun: GLYPH_ICONS.sun, gPaceBtn: GLYPH_ICONS.pace, mPaceBtn: MAT_ICONS.pace, wPaceBtn: WIN10_ICONS.pace,
  gX: GLYPH_X, mX: MAT_X, wX: WIN10_X }))()`);
const C = `el => { if (!el) return null; const i = el.querySelector('img'); return i ? i.getAttribute('src') : el.innerHTML; }`;
const paceSnap = () => J(`(() => { const c = ${C}; const pace = {};
  document.querySelectorAll('#pacePad .statgrid .ic[data-ic]').forEach(el => { pace[el.getAttribute('data-ic')] = c(el); });
  const cell = document.querySelector('#pacePad .statgrid .cell'); const cr = cell ? cell.getBoundingClientRect() : null;
  return { pace, streets: c(document.getElementById('streetsBtn')), paceBtn: c(document.getElementById('paceBtn')), night: c(document.getElementById('nightBtn')),
    cell: cr ? { w: +cr.width.toFixed(1), h: +cr.height.toFixed(1) } : null, bar: document.getElementById('tabBar').offsetHeight }; })()`);
const rowSnap = () => J(`(() => { const c = ${C};
  const v = [...document.querySelectorAll('.srow')].find(r => r.querySelector('.nm') && r.querySelector('.nm').textContent === 'Velmar');
  if (!v) return { __err: 'no Velmar row' }; const rr = v.getBoundingClientRect();
  return { pin: c(v.querySelector('.smap')), ntIco: c(v.querySelector('.ntIco')), nmNote: c(v.querySelector('.nmNote')),
    row: { w: +rr.width.toFixed(1), h: +rr.height.toFixed(1) } }; })()`);
const cardSnap = () => J(`(() => { const c = ${C}; const sp = document.getElementById('selPop'); const r = sp.getBoundingClientRect();
  return { selNote: c(document.getElementById('selNote')), card: { w: +r.width.toFixed(1), h: +r.height.toFixed(1) } }; })()`);
const xSnap = () => J(`(() => { const c = ${C}; const r = id => { const b = document.getElementById(id).getBoundingClientRect(); return { w: +b.width.toFixed(1), h: +b.height.toFixed(1) }; };
  return { xSheet: c(document.getElementById('sheetClose')), xPace: c(document.getElementById('paceClose')), xSet: c(document.getElementById('setClose')),
    xRm: c(document.getElementById('rmClose')), xMap: c(document.getElementById('mapNoteNo')),
    gSheet: r('sheetClose'), gSet: r('setClose'), gRm: r('rmClose') }; })()`);
const KEYS6 = ['clock', 'road', 'flag', 'list', 'cal', 'gauge'];
const paceEq = (s, m, dn) => KEYS6.every(k => s.pace[k] === m[k][dn]);
const PACKS = { glyph: 'g', material: 'm', win10: 'w' };

// ---------- seed: a past clean with a note (trail + clean-view note mark), a live street note ----------
await ev(`(() => { const T0 = Date.now() - 3 * 86400000, iso = ms => new Date(ms).toISOString();
  const items = {}; STREETNAMES.forEach((n, i) => { items[n] = iso(T0 + (i + 1) * 180000); });
  history = [{ at: iso(T0 + 34 * 180000 + 1680000), startedAt: iso(T0), km: 21.4, via: {}, sides: { p: {}, t: {} },
    items, notes: { Velmar: [{ k: 'note', text: 'drive202 detail note', at: iso(T0 + 180000) }] } }];
  saveHistory(); setNoteText('Velmar', 'drive202 note'); window.__xMark = 'alive'; return true; })()`);
const ex = await EX();

// ---------- the per-pack surface loop (day): Pace stats, street rows, selection card ----------
const day = {};
for (const pack of Object.keys(PACKS)) {
  await ev(`(() => { useIconPack('${pack}'); return true; })()`); await sleep(200);
  await ev(`openPace(); true`); await sleep(450);
  const ps = await paceSnap();
  const paceOpenAfterSwitch = pack === 'material' ? await ev(`document.getElementById('pacePanel').classList.contains('open')`) : null;
  await ev(`(() => { if (!$('sheet').classList.contains('open')) $('streetsBtn').click(); return true; })()`); await sleep(450);
  const rs = await rowSnap();
  await ev(`selectStretch('Velmar', 0, STRETCH.Velmar.line[10]); true`); await sleep(350);
  const cs = await cardSnap();
  day[pack] = { ps, rs, cs, paceOpenAfterSwitch };
  await ev(`deselect(); true`); await sleep(150);
}

// ---------- A/B/C: per-pack day census ----------
for (const [pack, p] of Object.entries(PACKS)) {
  const { ps, rs, cs } = day[pack];
  const exPace = ex[p + 'Pace'], exEx = ex[p + 'Ex'];
  ok(`${pack} 1: the Pace stats wear the pack artwork (all six cells, day)`, paceEq(ps, exPace, 'd'));
  ok(`${pack} 2: the pin + note marks wear the pack artwork (row pin, row line note, name note, selection card)`,
    rs.pin === exEx.pin.d && rs.ntIco === exEx.note.d && rs.nmNote === exEx.note.d && cs.selNote === exEx.note.d);
  ok(`${pack} 3: ROAD RULE - the Streets button is the HIGHWAY variant, the Road-cleared stat is the BASIC road, and they differ`,
    ps.streets === ex[p + 'Streets'].d && ps.pace.road === exPace.road.d && ps.streets !== ps.pace.road);
  ok(`${pack} 4: FLAG RULE - the Pace button keeps the checkered flag; the ETA stat is the plain flag`,
    ps.paceBtn === ex[p + 'PaceBtn'].d && ps.pace.flag === exPace.flag.d && ps.pace.flag !== ps.paceBtn);
}
ok('S1: the switch was seamless - the window marker lives and the Pace sheet stayed open across the Material switch',
  (await ev(`(() => window.__xMark)()`)) === 'alive' && day.material.paceOpenAfterSwitch === true);

// ---------- N: per-pack night census - the fills flip ----------
for (const [pack, p] of Object.entries(PACKS)) {
  await ev(`(() => { useIconPack('${pack}'); openPace(); return true; })()`); await sleep(300);
  await ev(`(() => { setThemeOverride(true); applyNight(); return true; })()`); await sleep(250);
  const ps = await paceSnap();
  ok(`${pack} N1: the Pace stats wear the pack NIGHT artwork (all six cells)`, paceEq(ps, ex[p + 'Pace'], 'n'));
  if (pack === 'glyph') ok('glyph N2: the Glyph sun is the SUMMER artwork (the night host wears GLYPH_ICONS.sun night)', ps.night === ex.gSun.n);
  await ev(`(() => { if (!$('sheet').classList.contains('open')) $('streetsBtn').click(); return true; })()`); await sleep(400);
  const rs = await rowSnap();
  ok(`${pack} N3: the pin + note marks wear the pack night artwork`, rs.pin === ex[p + 'Ex'].pin.n && rs.ntIco === ex[p + 'Ex'].note.n && rs.nmNote === ex[p + 'Ex'].note.n);
  await ev(`(() => { setThemeOverride(false); applyNight(); closeSheets(); return true; })()`); await sleep(250);
}

// ---------- E: zero layout shift across packs ----------
{
  const near = (a, b) => Math.abs(a - b) <= 0.5;
  const surfaces = [
    ['stat cell', p => day[p].ps.cell], ['street row', p => day[p].rs.row], ['selection card', p => day[p].cs.card]];
  let allSame = true, allReal = true;
  for (const [, get] of surfaces) {
    const a = get('glyph'), b = get('material'), c = get('win10');
    if (!a || !b || !c || a.w <= 0 || a.h <= 0) allReal = false;
    else if (!(near(a.w, b.w) && near(a.h, b.h) && near(a.w, c.w) && near(a.h, c.h))) allSame = false;
  }
  ok('E1: every measured surface is real (non-zero) under every pack', allReal);
  ok('E2: zero layout shift - stat cell, street row and selection card identical across the three packs', allSame && allReal);
  ok('E3: the tab bar stands at 51px under every pack', day.glyph.ps.bar === 51 && day.material.ps.bar === 51 && day.win10.ps.bar === 51);
}

// ---------- F: the trail cell on a past clean's detail, per pack (re-stamped in place) ----------
await ev(`(() => { useIconPack('glyph'); openPace(); return true; })()`); await sleep(450);
await ev(`document.querySelector('#pacePad .histRow').click(); true`); await sleep(400);
const trail = () => J(`(() => { const c = ${C}; const cv = document.getElementById('cleanView');
  const velmar = [...cv.querySelectorAll('.cvRow')].find(r => r.querySelector('.cvNm').textContent === 'Velmar');
  const cell = cv.querySelector('.statgrid .ic[data-ic="trail"]');
  return { trail: c(cell), cvNote: velmar ? c(velmar.querySelector('.cvNoteIco')) : null }; })()`);
let t = await trail();
ok('F1: the trail cell wears the Glyph trail fill; the clean-view note mark wears the Glyph note fill', t.trail === ex.gPace.trail.d && t.cvNote === ex.gEx.note.d);
await ev(`(() => { useIconPack('material'); return true; })()`); await sleep(250);
t = await trail();
ok('F2: the OPEN clean view re-stamps in place under Material (trail + note)', t.trail === ex.mPace.trail.d && t.cvNote === ex.mEx.note.d);
await ev(`(() => { useIconPack('win10'); return true; })()`); await sleep(250);
t = await trail();
ok('F3: the OPEN clean view re-stamps in place under Windows 10 (trail + note)', t.trail === ex.wPace.trail.d && t.cvNote === ex.wEx.note.d);
await ev(`closeSheets(); true`); await sleep(300);

// ---------- G: the close ✕ wears the pack, both jobs, boxes unmoved ----------
const xg = {};
for (const [pack, p] of Object.entries(PACKS)) {
  await ev(`(() => { useIconPack('${pack}'); if (!$('sheet').classList.contains('open')) $('streetsBtn').click(); document.getElementById('setMenu').classList.add('open'); $('routesBtn').click(); return true; })()`); await sleep(450);
  const xs = await xSnap(); xg[pack] = xs;
  ok(`G-${pack}: the corner ✕ hosts wear the pack artwork (sheet + pace + map-note)`, xs.xSheet === ex[p + 'X'].corner && xs.xPace === ex[p + 'X'].corner && xs.xMap === ex[p + 'X'].corner);
  ok(`G-${pack}: the bottom-centre ✕ pair wears the pack artwork (settings + route menu)`, xs.xSet === ex[p + 'X'].bottom && xs.xRm === ex[p + 'X'].bottom);
  await ev(`(() => { $('rmClose').click(); document.getElementById('setMenu').classList.remove('open'); closeSheets(); return true; })()`); await sleep(300);
}
ok('G4: every ✕ box measures the same under all three packs, at the shipped sizes (38px corner, 44px bottom pair)',
  ['gSheet', 'gSet', 'gRm'].every(k => Math.abs(xg.glyph[k].w - xg.material[k].w) <= 0.5 && Math.abs(xg.glyph[k].w - xg.win10[k].w) <= 0.5 && Math.abs(xg.glyph[k].h - xg.material[k].h) <= 0.5 && Math.abs(xg.glyph[k].h - xg.win10[k].h) <= 0.5) &&
  xg.glyph.gSheet.w === 38 && xg.glyph.gSet.w === 44 && xg.glyph.gRm.w === 44);

// ---------- H: the retired packs are gone - and a stored retired id boots onto the default ----------
await ev(`(() => { showSetPane('setMainPane'); document.getElementById('setMenu').classList.add('open'); renderJob(); showSetPane('setJobPane'); return true; })()`); await sleep(250);
const pkRows = await ev(`(() => [...document.querySelectorAll('#pkCard .pkRow')].map(r => r.dataset.pkrow).join(','))()`);
ok('H1: the picker stands at THREE rows (glyph / material / win10) - no retired row', pkRows === 'glyph,material,win10');
const gone = await J(`(() => ({ pulsar: typeof PULSAR_ICONS, packd: typeof PACKD_ICONS, puffy: typeof PUFFY_ICONS, snap: typeof PACE_ORIGINALS }))()`);
ok('H2: the retired registries are gone from the page (no PULSAR_ICONS, no PACKD_ICONS, no PUFFY_ICONS, no PACE_ORIGINALS)',
  gone.pulsar === 'undefined' && gone.packd === 'undefined' && gone.puffy === 'undefined' && gone.snap === 'undefined');
await ev(`(() => { lsSet(LS.iconpack, 'original'); location.reload(); return true; })()`);
await poll(`(() => typeof map !== 'undefined' && !!map && typeof ICONS !== 'undefined')()`, 30000);
await sleep(600);
const boot = await J(`(() => ({ active: iconPackId() }))()`);
ok('H3: a stored original boots cleanly onto the glyph default (iconPackId reads glyph, no error)', boot.active === 'glyph');
await bootThrough(ev, poll);
await ev(`(() => { renderStreets(); if (!$('sheet').classList.contains('open')) $('streetsBtn').click(); return true; })()`); await sleep(450);
const rs2 = await rowSnap();
ok('H4: after the retired-id boot the extras stand on Glyph (the row pin is the glyph marker fill)', rs2.pin === ex.gEx.pin.d);
await ev(`(() => { useIconPack('glyph'); return true; })()`);

R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String(c.text || '').slice(0, 200));
ok('Z: zero page exceptions across the whole drive', R.exceptions.length === 0);
finish(R, proc);
