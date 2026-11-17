import { launchDrive, finish, bootThrough, tapSelector } from './harness.mjs';
const { proc, ev, consoleLog, sleep, poll } = await launchDrive();
await bootThrough(ev, poll); // boots end at the route menu - click through to a loaded route

// drive202 (SESSION tier): Beta 1.219 - the icon packs grow to the live extras, the road
// swap, the Glyph summer sun, the Puffy retirement, and the close ✕ wearing the pack.
// Proven live in the rendered app (the static byte pins live in proof-icon-extras-1219):
//  - the extras stamp per pack, day and night: the Pace stat cells (clock, road, flag,
//    list, cal, gauge in the Pace menu; trail on a past clean's detail), the street-row
//    pin (.smap) and note marks (.ntIco / .nmNote), the selection card's note button;
//  - Andrew's road rule: the Streets button wears the HIGHWAY variant and the Pace
//    "Road cleared" stat wears the BASIC road, in Pulsar and in Glyph;
//  - the flag rule: the Pace button keeps the checkered finish flag; the ETA stat is
//    the plain flag - a different artwork in every pack that carries both;
//  - the Glyph sun is the summer artwork (read off the night host, where the sun rides);
//  - the close ✕ wears the pack in both jobs (corner family + the bottom-centre pair):
//    Pulsar's native cancel, Glyph's disc fills (red corner, white bottom), Original's
//    text glyph - and every ✕ box measures the same under every pack;
//  - ZERO LAYOUT SHIFT: the stat cell, the street row, the selection card and the tab
//    bar measure identical under all three packs (each surface measured while IT is
//    the open one - the sheets are exclusive and openPace deselects);
//  - switching packs re-stamps the extras and the ✕ hosts IN PLACE (marker survives,
//    the open sheet stays open);
//  - Puffy is gone: no picker row, no registry, and a stored 'puffy' choice boots
//    cleanly onto the pulsar default.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };

const EX = () => J(`(() => ({
  pEx: PULSAR_EXTRAS, pPace: PULSAR_PACE_ICONS, gEx: GLYPH_EXTRAS, gPace: GLYPH_PACE_ICONS,
  pStreets: PULSAR_ICONS.streets, gStreets: GLYPH_ICONS.streets, gSun: GLYPH_ICONS.sun, pPaceBtn: PULSAR_ICONS.pace, gPaceBtn: GLYPH_ICONS.pace,
  pX: PULSAR_X, gX: GLYPH_X, packd: PACKD_ICONS, paceOrig: PACE_ORIGINALS }))()`);
const C = `el => { if (!el) return null; const i = el.querySelector('img'); return i ? i.getAttribute('src') : el.innerHTML; }`;
const NORM = `s => { const d = document.createElement('div'); d.innerHTML = s; return d.innerHTML; }`; // the browser serializes an <svg> on read-back (close tags, attribute form) - an Original-pack host is compared against the shipped string put through the SAME serializer, so the equality stays exact
const paceSnap = () => J(`(() => { const c = ${C}; const norm = ${NORM}; const pace = {}; const origOk = {};
  document.querySelectorAll('#pacePad .statgrid .ic[data-ic]').forEach(el => { const k = el.getAttribute('data-ic'); pace[k] = c(el); origOk[k] = el.innerHTML === norm(PACE_ORIGINALS[k]); });
  const cell = document.querySelector('#pacePad .statgrid .cell'); const cr = cell ? cell.getBoundingClientRect() : null;
  return { pace, origOk, streets: c(document.getElementById('streetsBtn')), paceBtn: c(document.getElementById('paceBtn')), night: c(document.getElementById('nightBtn')),
    cell: cr ? { w: +cr.width.toFixed(1), h: +cr.height.toFixed(1) } : null, bar: document.getElementById('tabBar').offsetHeight }; })()`);
const rowSnap = () => J(`(() => { const c = ${C}; const norm = ${NORM};
  const v = [...document.querySelectorAll('.srow')].find(r => r.querySelector('.nm') && r.querySelector('.nm').textContent === 'Velmar');
  if (!v) return { __err: 'no Velmar row' }; const rr = v.getBoundingClientRect();
  const okN = el => !!el && el.innerHTML === norm(PACKD_ICONS.note);
  return { pin: c(v.querySelector('.smap')), ntIco: c(v.querySelector('.ntIco')), nmNote: c(v.querySelector('.nmNote')),
    pinOk: !!v.querySelector('.smap') && v.querySelector('.smap').innerHTML === norm(PACKD_ICONS.pin), ntOk: okN(v.querySelector('.ntIco')), nmOk: okN(v.querySelector('.nmNote')),
    row: { w: +rr.width.toFixed(1), h: +rr.height.toFixed(1) } }; })()`);
const cardSnap = () => J(`(() => { const c = ${C}; const norm = ${NORM}; const sp = document.getElementById('selPop'); const r = sp.getBoundingClientRect();
  return { selNote: c(document.getElementById('selNote')), selOk: document.getElementById('selNote').innerHTML === norm(PACKD_ICONS.note), card: { w: +r.width.toFixed(1), h: +r.height.toFixed(1) } }; })()`);
const xSnap = () => J(`(() => { const c = ${C}; const r = id => { const b = document.getElementById(id).getBoundingClientRect(); return { w: +b.width.toFixed(1), h: +b.height.toFixed(1) }; };
  return { xSheet: c(document.getElementById('sheetClose')), xPace: c(document.getElementById('paceClose')), xSet: c(document.getElementById('setClose')),
    xRm: c(document.getElementById('rmClose')), xMap: c(document.getElementById('mapNoteNo')),
    gSheet: r('sheetClose'), gSet: r('setClose'), gRm: r('rmClose') }; })()`);
const KEYS6 = ['clock', 'road', 'flag', 'list', 'cal', 'gauge'];
const paceEq = (s, m, dn) => KEYS6.every(k => s.pace[k] === m[k][dn]);

// ---------- seed: a past clean with a note (trail + clean-view note mark), a live street note ----------
await ev(`(() => { const T0 = Date.now() - 3 * 86400000, iso = ms => new Date(ms).toISOString();
  const items = {}; STREETNAMES.forEach((n, i) => { items[n] = iso(T0 + (i + 1) * 180000); });
  history = [{ at: iso(T0 + 34 * 180000 + 1680000), startedAt: iso(T0), km: 21.4, via: {}, sides: { p: {}, t: {} },
    items, notes: { Velmar: [{ k: 'note', text: 'drive202 detail note', at: iso(T0 + 180000) }] } }];
  saveHistory(); setNoteText('Velmar', 'drive202 note'); window.__xMark = 'alive'; return true; })()`);
const ex = await EX();

// ---------- the per-pack surface loop (day): Pace stats, street rows, selection card ----------
const day = {};
for (const pack of ['pulsar', 'glyph', 'original']) {
  await ev(`(() => { useIconPack('${pack}'); return true; })()`); await sleep(200);
  await ev(`openPace(); true`); await sleep(450);
  const ps = await paceSnap();
  const paceOpenAfterSwitch = pack === 'glyph' ? await ev(`document.getElementById('pacePanel').classList.contains('open')`) : null;
  await ev(`(() => { if (!$('sheet').classList.contains('open')) $('streetsBtn').click(); return true; })()`); await sleep(450);
  const rs = await rowSnap();
  await ev(`selectStretch('Velmar', 0, STRETCH.Velmar.line[10]); true`); await sleep(350);
  const cs = await cardSnap();
  day[pack] = { ps, rs, cs, paceOpenAfterSwitch };
  await ev(`deselect(); true`); await sleep(150);
}

// ---------- A: Pulsar, day ----------
{
  const { ps, rs, cs } = day.pulsar;
  ok('A1: the Pace stats wear Pulsar native artwork (all six cells, day)', paceEq(ps, ex.pPace, 'd'));
  ok('A2: the street-row pin is the Pulsar marker artwork', rs.pin === ex.pEx.pin.d);
  ok('A3: the note marks wear the Pulsar note artwork (row line + name row + selection card)', rs.ntIco === ex.pEx.note.d && rs.nmNote === ex.pEx.note.d && cs.selNote === ex.pEx.note.d);
  ok('A4: ROAD RULE (Pulsar) - the Streets button is the gradient HIGHWAY, the Road-cleared stat is the BASIC road, and they differ',
    ps.streets === ex.pStreets.d && ps.pace.road === ex.pPace.road.d && ps.streets !== ps.pace.road);
  ok('A5: FLAG RULE (Pulsar) - the Pace button keeps the checkered flag; the ETA stat is the plain flag',
    ps.paceBtn === ex.pPaceBtn.d && ps.pace.flag === ex.pPace.flag.d && ps.pace.flag !== ps.paceBtn);
}

// ---------- B: Glyph, day ----------
{
  const { ps, rs, cs } = day.glyph;
  ok('B1: the Pace stats wear the Glyph day fills (all six cells)', paceEq(ps, ex.gPace, 'd'));
  ok('B2: the pin + note marks wear the Glyph day fills', rs.pin === ex.gEx.pin.d && rs.ntIco === ex.gEx.note.d && rs.nmNote === ex.gEx.note.d && cs.selNote === ex.gEx.note.d);
  ok('B3: ROAD RULE (Glyph) - Streets is the highway fill, the stat is the basic-road fill, and they differ',
    ps.streets === ex.gStreets.d && ps.pace.road === ex.gPace.road.d && ps.streets !== ps.pace.road);
  ok('B4: FLAG RULE (Glyph) - the Pace button keeps its checkered flag; the ETA stat is the plain flag-2 fill',
    ps.paceBtn === ex.gPaceBtn.d && ps.pace.flag === ex.gPace.flag.d && ps.pace.flag !== ps.paceBtn);
  ok('B5: the switch was seamless - the window marker lives and the Pace sheet stayed open across the Glyph switch',
    (await ev(`(() => window.__xMark)()`)) === 'alive' && day.glyph.paceOpenAfterSwitch === true);
}

// ---------- C: Glyph, night - the fills flip, the sun is summer ----------
await ev(`(() => { useIconPack('glyph'); openPace(); return true; })()`); await sleep(300);
await ev(`(() => { setThemeOverride(true); applyNight(); return true; })()`); await sleep(250);
{
  const ps = await paceSnap();
  ok('C1: the Pace stats wear the Glyph NIGHT fills (all six cells)', paceEq(ps, ex.gPace, 'n'));
  ok('C2: the Glyph sun is the SUMMER artwork (the night host wears GLYPH_ICONS.sun, the summer fills)', ps.night === ex.gSun.n);
  await ev(`(() => { if (!$('sheet').classList.contains('open')) $('streetsBtn').click(); return true; })()`); await sleep(400);
  const rs = await rowSnap();
  ok('C3: the pin + note marks wear the Glyph night fills', rs.pin === ex.gEx.pin.n && rs.ntIco === ex.gEx.note.n && rs.nmNote === ex.gEx.note.n);
}
await ev(`(() => { setThemeOverride(false); applyNight(); closeSheets(); return true; })()`); await sleep(250);

// ---------- D: Original - the shipped vectors, byte-identical ----------
{
  const { ps, rs, cs } = day.original;
  ok('D1: the Pace stats are the shipped vectors restored (PACE_ORIGINALS, all six cells, serializer-normalized exact)', KEYS6.every(k => day.original.ps.origOk[k] === true));
  ok('D2: the pin + note marks are the Pack D vectors (PACKD_ICONS, serializer-normalized exact)', day.original.rs.pinOk === true && day.original.rs.ntOk === true && day.original.rs.nmOk === true && day.original.cs.selOk === true);
}

// ---------- E: zero layout shift across packs ----------
{
  const near = (a, b) => Math.abs(a - b) <= 0.5;
  const surfaces = [
    ['stat cell', p => day[p].ps.cell], ['street row', p => day[p].rs.row], ['selection card', p => day[p].cs.card]];
  let allSame = true, allReal = true;
  for (const [, get] of surfaces) {
    const a = get('pulsar'), b = get('glyph'), c = get('original');
    if (!a || !b || !c || a.w <= 0 || a.h <= 0) allReal = false;
    else if (!(near(a.w, b.w) && near(a.h, b.h) && near(a.w, c.w) && near(a.h, c.h))) allSame = false;
  }
  ok('E1: every measured surface is real (non-zero) under every pack', allReal);
  ok('E2: zero layout shift - stat cell, street row and selection card identical across the three packs', allSame && allReal);
  ok('E3: the tab bar stands at 51px under every pack', day.pulsar.ps.bar === 51 && day.glyph.ps.bar === 51 && day.original.ps.bar === 51);
}

// ---------- F: the trail cell on a past clean's detail, per pack (re-stamped in place) ----------
await ev(`(() => { useIconPack('pulsar'); openPace(); return true; })()`); await sleep(450);
await ev(`document.querySelector('#pacePad .histRow').click(); true`); await sleep(400);
const trail = () => J(`(() => { const c = ${C}; const norm = ${NORM}; const cv = document.getElementById('cleanView');
  const velmar = [...cv.querySelectorAll('.cvRow')].find(r => r.querySelector('.cvNm').textContent === 'Velmar');
  const cell = cv.querySelector('.statgrid .ic[data-ic="trail"]');
  return { trail: c(cell), cvNote: velmar ? c(velmar.querySelector('.cvNoteIco')) : null,
    trailOk: !!cell && cell.innerHTML === norm(PACE_ORIGINALS.trail), cvOk: !!velmar && !!velmar.querySelector('.cvNoteIco') && velmar.querySelector('.cvNoteIco').innerHTML === norm(PACKD_ICONS.note) }; })()`);
let t = await trail();
ok('F1: the trail cell wears the Pulsar trail artwork; the clean-view note mark wears the Pulsar note', t.trail === ex.pPace.trail.d && t.cvNote === ex.pEx.note.d);
await ev(`(() => { useIconPack('glyph'); return true; })()`); await sleep(250);
t = await trail();
ok('F2: the OPEN clean view re-stamps in place under Glyph (trail fill + note fill)', t.trail === ex.gPace.trail.d && t.cvNote === ex.gEx.note.d);
await ev(`(() => { useIconPack('original'); return true; })()`); await sleep(250);
t = await trail();
ok('F3: the OPEN clean view re-stamps in place under Original (the shipped trail vector, serializer-normalized exact)', t.trailOk === true && t.cvOk === true);
await ev(`closeSheets(); true`); await sleep(300);

// ---------- G: the close ✕ wears the pack, both jobs, boxes unmoved ----------
const xg = {};
for (const [pack, corner, bottom] of [['pulsar', ex.pX, ex.pX], ['glyph', ex.gX.corner, ex.gX.bottom], ['original', '✕', '✕']]) {
  await ev(`(() => { useIconPack('${pack}'); if (!$('sheet').classList.contains('open')) $('streetsBtn').click(); document.getElementById('setMenu').classList.add('open'); $('routesBtn').click(); return true; })()`); await sleep(450);
  const xs = await xSnap(); xg[pack] = xs;
  ok(`G-${pack}: the corner ✕ hosts wear the pack (sheet + pace + map-note)`, xs.xSheet === corner && xs.xPace === corner && xs.xMap === corner);
  ok(`G-${pack}: the bottom-centre ✕ pair wears the pack (settings + route menu)`, xs.xSet === bottom && xs.xRm === bottom);
  await ev(`(() => { $('rmClose').click(); document.getElementById('setMenu').classList.remove('open'); closeSheets(); return true; })()`); await sleep(300);
}
ok('G4: every ✕ box measures the same under all three packs, at the shipped sizes (38px corner, 44px bottom pair)',
  ['gSheet', 'gSet', 'gRm'].every(k => Math.abs(xg.pulsar[k].w - xg.glyph[k].w) <= 0.5 && Math.abs(xg.pulsar[k].w - xg.original[k].w) <= 0.5 && Math.abs(xg.pulsar[k].h - xg.glyph[k].h) <= 0.5 && Math.abs(xg.pulsar[k].h - xg.original[k].h) <= 0.5) &&
  xg.pulsar.gSheet.w === 38 && xg.pulsar.gSet.w === 44 && xg.pulsar.gRm.w === 44);

// ---------- H: Puffy is retired - and a stored 'puffy' boots onto the default ----------
await ev(`(() => { showSetPane('setMainPane'); document.getElementById('setMenu').classList.add('open'); renderJob(); showSetPane('setJobPane'); return true; })()`); await sleep(250);
const pkRows = await ev(`(() => [...document.querySelectorAll('#pkCard .pkRow')].map(r => r.dataset.pkrow).join(','))()`);
ok('H1: the picker stands at THREE rows (pulsar / original / glyph) - no Puffy row', pkRows === 'pulsar,original,glyph');
const puffyGone = await J(`(() => ({ icons: typeof PUFFY_ICONS, states: typeof PUFFY_GPS_STATES }))()`);
ok('H2: the Puffy registry is gone from the page (no PUFFY_ICONS, no PUFFY_GPS_STATES)', puffyGone.icons === 'undefined' && puffyGone.states === 'undefined');
await ev(`(() => { lsSet(LS.iconpack, 'puffy'); location.reload(); return true; })()`);
await poll(`(() => typeof map !== 'undefined' && !!map && typeof ICONS !== 'undefined')()`, 30000);
await sleep(600);
const boot = await J(`(() => ({ active: iconPackId() }))()`);
ok('H3: a stored puffy boots cleanly onto the pulsar default (iconPackId reads pulsar, no error)', boot.active === 'pulsar');
await bootThrough(ev, poll);
await ev(`(() => { renderStreets(); if (!$('sheet').classList.contains('open')) $('streetsBtn').click(); return true; })()`); await sleep(450);
const rs2 = await rowSnap();
ok('H4: after the puffy boot the extras stand on Pulsar (the row pin is the marker artwork)', rs2.pin === ex.pEx.pin.d);
await ev(`(() => { useIconPack('pulsar'); return true; })()`);

R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String(c.text || '').slice(0, 200));
ok('Z: zero page exceptions across the whole drive', R.exceptions.length === 0);
finish(R, proc);
