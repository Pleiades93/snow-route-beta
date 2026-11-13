import { launchDrive, finish, bootThrough } from './harness.mjs';
import { PACK5W } from './pack-expect.mjs';
const { proc, ev, send, S, consoleLog, sleep, poll } = await launchDrive();
await bootThrough(ev, poll);

// drive192: Beta 1.184 (Andrew) - the Streets/Pace menu redesign, proven in
// the rendered page (the design-QA rule: measure the failure property, not a
// proxy):
//   P: Pace - the honest NOT-STARTED state (Elapsed/ETA dashes, the live
//      board's own figures, Last clean/Last pace still populated from the
//      most recent clean, the reference line in the banner slot, NO
//      verdict), Progress-by-group half credit, the verdict appearing only
//      on a live run with a reference, and the clean detail inside the Pace
//      sheet (GPS trail as its own figure beside road cleared, note icons
//      only on noted streets, no pin anywhere, the two-tap delete
//      returning to Saved cleans).
//   S: Streets - hero figures bind to the live state, the Mains|Secondaries
//      tabs swap the WHOLE list (counts and membership, no cross-group
//      rows), row states (complete keeps its full done string, a half reads
//      'one side done' with the split-disc dot, untouched an em dash), the
//      pin in the name row centres the map on the street's middle and
//      closes the sheet, a row tap opens the note editor with its label
//      and Save/Done actions, and the name-row note icon exists only where
//      a note exists.
//   D: the sheet detents for BOTH redesigned sheets at three viewports in
//      both themes - open at half, swipe up to full, down to half, down to
//      closed, heights measured off the live sheet; heads and close
//      buttons in-bounds at the half stop.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };
const mDown = async (x, y) => { await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }, S); };
const mMove = async (x, y) => { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left' }, S); };
const mUp = async (x, y) => { await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }, S); };
const setVp = async (w, h) => { await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true }, S); await sleep(500); };
const grabPt = async (id) => JSON.parse(await ev(`(() => { const r = document.getElementById('${id}').querySelector('.grab').getBoundingClientRect(); return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 6) }); })()`));
const sheetH = async (id) => await ev(`document.getElementById('${id}').offsetHeight`);
const drag = async (pt, dy) => { await mDown(pt.x, pt.y); await mMove(pt.x, pt.y + Math.sign(dy) * 6); await sleep(100); await mMove(pt.x, pt.y + Math.round(dy * 0.45)); await sleep(80); await mMove(pt.x, pt.y + Math.round(dy * 0.8)); await sleep(80); await mMove(pt.x, pt.y + dy); await sleep(150); await mUp(pt.x, pt.y + dy); await sleep(800); }; // the small first move matters: it is drive145's proven engagement pattern - a first jump straight to 40% of the travel never engages the drag
const cellMap = (root) => `(() => { const m = {}; [...document.querySelectorAll('${root} .statgrid .cell')].forEach(c => { m[c.querySelector('.l').textContent] = c.querySelector('.v').textContent; }); return m; })()`;

try {
  // ---------- P: Pace, on the fresh board, with a seeded full clean ----------
  const seed = await J(`(() => { const T0 = Date.now() - 3 * 86400000, iso = ms => new Date(ms).toISOString();
    const items = {}; STREETNAMES.forEach((n, i) => { items[n] = iso(T0 + (i + 1) * 180000); });
    history = [{ at: iso(T0 + 34 * 180000 + 1680000), startedAt: iso(T0), km: 21.4, via: {}, sides: { p: {}, t: {} },
      items, notes: { Velmar: [{ k: 'note', text: 'drive192 detail note', at: iso(T0 + 180000) }] } }];
    saveHistory();
    markDone('Velmar', 'tap'); pieces['Mellings'][0] = (pieces['Mellings'][0] | 1); refreshAll();
    return { ttl: fmtDate3(history[0].at), last: fmtHM(histDur(history[0]).durMs), pace: cleanPaceKm(history[0]), tw: (cleanWorkM(history[0]) / 2000).toFixed(1),
      wantRoad: (workDoneM() / 2000).toFixed(1) + ' km', wantStreets: STREETNAMES.filter(streetComplete).length + '/' + STREETNAMES.length }; })()`);
  await ev(`openPace(); true`); await sleep(500);
  const pm = await J(cellMap('#pacePad'));
  const ph = await J(`(() => ({ head: $('paceHead').textContent, banner: document.querySelector('#pacePad .verd').textContent, bannerRef: document.querySelector('#pacePad .verd').classList.contains('ref'),
    gm: [...document.querySelectorAll('#pacePad .gb-top')].map(e => e.textContent), rows: document.querySelectorAll('#pacePad .histRow').length }))()`);
  ok('P1 Pace not-started is honest: Elapsed and ETA are dashes while road cleared and streets read the live board | ' + JSON.stringify(pm),
    pm['ELAPSED'] === '—' && pm['ETA'] === '—' && pm['ROAD CLEARED'] === seed.wantRoad && pm['STREETS'] === seed.wantStreets);
  ok('P2 Last clean and Last pace /km still populate from the most recent clean | ' + JSON.stringify({ seed: { last: seed.last, pace: seed.pace }, pm }),
    pm['LAST CLEAN'] === seed.last && pm['LAST PACE /KM'] === seed.pace);
  ok('P3 the banner slot carries the REFERENCE line, never a verdict, when no run is live | ' + ph.banner,
    ph.bannerRef === true && ph.banner.includes('Reference clean (' + seed.ttl + ')') && ph.banner.includes(seed.last + ' total') && ph.head.includes('not started'));
  ok('P4 Progress by group credits the half street (Velmar done + Mellings half on Mains) | ' + JSON.stringify(ph.gm),
    ph.gm[0].includes('1.5 of 6 streets') && ph.gm[1].includes('0 of 28 streets'));
  ok('P5 the seeded clean is listed under Saved cleans | rows ' + ph.rows, ph.rows === 1);

  // ---------- verdict on a live run ----------
  await ev(`(() => { runStart = Date.now() - 1800000; saveStart(); renderPace(); return true; })()`); await sleep(300);
  const vd = await J(`(() => { const v = document.querySelector('#pacePad .verd'); return { t: v.textContent, ref: v.classList.contains('ref'), cancel: !!$('paceCancel') }; })()`);
  const vm = await J(cellMap('#pacePad'));
  ok('P6 with a live rate and a reference the banner becomes a verdict with an ETA, Elapsed runs, and Cancel start sits under the banner | ' + JSON.stringify({ vd, el: vm['ELAPSED'], eta: vm['ETA'] }),
    vd.ref === false && /Faster by|Slower by|On pace/.test(vd.t) && vd.t.includes('ETA') && vm['ELAPSED'] === '0:30' && vm['ETA'] !== '—' && vd.cancel === true);
  await ev(`$('paceCancel').click(); true`); await sleep(300);

  // ---------- clean detail inside the Pace sheet ----------
  await ev(`openPace(); true`); await sleep(400);
  await ev(`document.querySelector('#pacePad .histRow').click(); true`); await sleep(400);
  const dm = await J(cellMap('#cleanView'));
  const dt = await J(`(() => { const cv = $('cleanView');
    const velmar = [...cv.querySelectorAll('.cvRow')].find(r => r.querySelector('.cvNm').textContent === 'Velmar');
    return { open: $('pacePanel').classList.contains('open'), cvShown: cv.style.display !== 'none', padHidden: $('pacePad').style.display === 'none',
      ttl: cv.querySelector('.cvTtl').textContent, sub: cv.querySelector('.cvSub').textContent,
      pins: cv.querySelectorAll('.smap').length, icons: cv.querySelectorAll('.cvNoteIco').length,
      velmarIcon: !!velmar.querySelector('.cvNoteIco'), rows: cv.querySelectorAll('.cvRow').length }; })()`);
  ok('P7 tapping a saved clean opens its detail INSIDE the Pace sheet (sheet stays open, pace content yields) | ' + JSON.stringify({ open: dt.open, cvShown: dt.cvShown, padHidden: dt.padHidden }),
    dt.open === true && dt.cvShown === true && dt.padHidden === true);
  ok('P8 the detail header and stats bind to the clean - GPS trail is its OWN figure, distinct from road cleared | ' + JSON.stringify({ dt, dm }),
    dt.ttl === seed.ttl && dt.sub.includes(PACK5W.names + ' streets · finished') && dm['TOTAL TIME'] === seed.last && dm['GPS TRAIL'] === '21.4 km' && dm['ROAD CLEARED'] === seed.tw + ' km' && dm['ROAD CLEARED'] !== dm['GPS TRAIL'] && dm['PACE'] === seed.pace + ' /km' && dt.rows === PACK5W.names);
  ok('P9 no pin anywhere in the detail; a note icon ONLY on the street that had a note saved on this clean | pins ' + dt.pins + ' icons ' + dt.icons,
    dt.pins === 0 && dt.icons === 1 && dt.velmarIcon === true);
  await ev(`(() => { const r = [...$('cleanView').querySelectorAll('.cvRow')].find(x => x.querySelector('.cvNm').textContent === 'Velmar'); r.click(); return true; })()`); await sleep(200);
  const det = await J(`(() => { const r = [...$('cleanView').querySelectorAll('.cvRow')].find(x => x.querySelector('.cvNm').textContent === 'Velmar'); const d = r.querySelector('.cvDet'); return { vis: d.style.display !== 'none', txt: d.textContent }; })()`);
  ok('P10 the noted street detail opens read-only with the note readable | ' + (det.txt || '').slice(0, 80), det.vis === true && (det.txt || '').includes('drive192 detail note'));
  await ev(`$('cleanView').querySelector('.cvDel').click(); true`); await sleep(200);
  const armed = await ev(`$('cleanView').querySelector('.cvDel').textContent`);
  await ev(`$('cleanView').querySelector('.cvDel').click(); true`); await sleep(400);
  const after = await J(`({ h: history.length, cvHidden: $('cleanView').classList.contains('hidden'), padShown: $('pacePad').style.display !== 'none', rows: document.querySelectorAll('#pacePad .histRow').length })`);
  ok('P11 the two-tap delete removes the clean and returns to Saved cleans | armed "' + armed + '" ' + JSON.stringify(after),
    /Tap again to confirm/.test(armed || '') && after.h === 0 && after.cvHidden === true && after.padShown === true && after.rows === 0);
  await ev(`closeSheets(); true`); await sleep(400);

  // ---------- fresh board for the Streets section ----------
  await ev(`(() => { const rk = routeKeys('5w'); [rk.done, rk.sides, rk.times, rk.notes, rk.via, rk.snap, rk.start].forEach(k => { if (k) localStorage.removeItem(k); }); noteOpenFor = null; loadRouteState('5w'); refreshAll(); return true; })()`); await sleep(300);

  // ---------- S: Streets structure, tabs, states ----------
  await ev(`$('streetsBtn').click(); true`); await poll(`document.querySelectorAll('.srow').length > 0`, 10000);
  const s0 = await J(`(() => { const rows = [...document.querySelectorAll('.srow')]; return {
    rows: rows.length, allMain: rows.every(r => r.classList.contains('main')),
    hero: $('stHero').textContent, routeN: $('stRouteN').textContent, routeS: $('stRouteS').textContent,
    grp: $('stGroupN').textContent + $('stGroupC').textContent,
    totalCap: (totalWorkM() / 2000).toFixed(1) + ' km total', names: STREETNAMES.length }; })()`);
  ok('S1 Streets opens on the Mains tab: 6 rows, every one a main | ' + JSON.stringify(s0), s0.rows === 6 && s0.allMain === true);
  ok('S2 the hero reads the live zero state (0 of N streets, 0.0 km cleared, the computed total) | ' + s0.hero,
    s0.hero.includes('/ ' + s0.names + ' streets') && s0.hero.includes('0.0 km of road cleared') && s0.hero.includes(s0.totalCap) && s0.hero.includes('streets completed so far'));
  ok('S3 the route line names the route and its not-started state; the group heading counts the tab | ' + s0.routeN + s0.routeS + ' / ' + s0.grp,
    s0.routeN.length > 0 && s0.routeS.includes('not started') && s0.grp === 'MAINS · 6 streets');
  await ev(`document.querySelector('#filters button[data-f="secondaries"]').click(); true`); await sleep(300);
  const s1 = await J(`(() => { const rows = [...document.querySelectorAll('.srow')]; return {
    rows: rows.length, anyMain: rows.some(r => r.classList.contains('main')),
    grp: $('stGroupN').textContent + $('stGroupC').textContent,
    cross: rows.filter(r => MAIN.has(r.querySelector('.nm').textContent)).length }; })()`);
  ok('S4 the Secondaries tab swaps the WHOLE list: 28 rows, no main among them, heading follows | ' + JSON.stringify(s1),
    s1.rows === 28 && s1.anyMain === false && s1.cross === 0 && s1.grp === 'SECONDARIES · 28 streets');
  await ev(`document.querySelector('#filters button[data-f="mains"]').click(); true`); await sleep(300);

  await ev(`(() => { markDone('Velmar', 'tap'); pieces['Mellings'][0] = (pieces['Mellings'][0] | 1); refreshAll(); renderStreets(); return true; })()`); await sleep(300);
  const s2 = await J(`(() => { const rowOf = n => [...document.querySelectorAll('.srow')].find(r => r.querySelector('.nm').textContent === n);
    const rd = n => { const r = rowOf(n); const dot = r.querySelector('.dot'); return { cls: r.className, tm: r.querySelector('.tm').textContent, tmCls: r.querySelector('.tm').className, dotBg: getComputedStyle(dot).backgroundImage, dotW: dot.getBoundingClientRect().width,
      pinInRow: !!r.querySelector('.nmrow .smap'), noteIco: r.querySelector('.nmNote').style.display !== 'none' }; };
    return { v: rd('Velmar'), m: rd('Mellings'), a: rd('Astona'), hero: $('stHero').textContent }; })()`);
  ok('S5 a completed street keeps its full done string in the status slot | ' + s2.v.tm, /^done /.test(s2.v.tm) && s2.v.tmCls.includes('st-done') && s2.v.cls.includes('done'));
  ok('S6 a half street reads "one side done" with the split-disc dot | ' + JSON.stringify(s2.m), s2.m.tm === 'one side done' && s2.m.cls.includes('half') && (s2.m.dotBg || '').includes('linear-gradient'));
  ok('S7 an untouched street reads an em dash; the pin rides in the name row of every row; dots measure 9px | ' + JSON.stringify(s2.a),
    s2.a.tm === '—' && s2.v.pinInRow && s2.m.pinInRow && s2.a.pinInRow && Math.abs(s2.a.dotW - 9) <= 1.5);
  ok('S8 the hero follows the marks (one street done, road cleared off zero) | ' + s2.hero, s2.hero.includes('1') && !s2.hero.includes('0.0 km of road cleared'));
  ok('S9 no note icons yet (no street carries note text) | ' + JSON.stringify({ v: s2.v.noteIco, m: s2.m.noteIco }), s2.v.noteIco === false && s2.m.noteIco === false);

  // ---------- note editor: row tap, label, Save/Done, icon appears ----------
  await ev(`(() => { const r = [...document.querySelectorAll('.srow')].find(x => x.querySelector('.nm').textContent === 'Velmar'); r.querySelector('.nwrap').click(); return true; })()`);
  await poll(`typeof noteOpenFor !== 'undefined' && noteOpenFor === 'Velmar' && !!document.querySelector('.noteEd textarea')`, 10000);
  const e0 = await J(`(() => ({ lbl: document.querySelector('.noteEd .nedLbl').textContent, save: !!document.querySelector('.noteEd .nedSave'), done: !!document.querySelector('.noteEd .nedDone') }))()`);
  ok('S10 a row tap opens the note editor with its Note label and Save/Done actions | ' + JSON.stringify(e0),
    e0.lbl === 'Note — Velmar' && e0.save === true && e0.done === true);
  await ev(`(() => { const ta = document.querySelector('.noteEd textarea'); ta.value = 'drive192 note'; ta.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('.noteEd .nedSave').click(); return true; })()`); await sleep(300);
  const e1 = await J(`(() => { const r = [...document.querySelectorAll('.srow')].find(x => x.querySelector('.nm').textContent === 'Velmar'); const r2 = [...document.querySelectorAll('.srow')].find(x => x.querySelector('.nm').textContent === 'Astona'); return { saved: noteTextOf('Velmar'), ico: r.querySelector('.nmNote').style.display !== 'none', ico2: r2.querySelector('.nmNote').style.display !== 'none' }; })()`);
  ok('S11 Save note writes through the same store, and the note icon appears on that street only | ' + JSON.stringify(e1),
    e1.saved === 'drive192 note' && e1.ico === true && e1.ico2 === false);
  await ev(`(() => { document.querySelector('.noteEd .nedDone').click(); return true; })()`); await sleep(300);
  ok('S12 Done closes the editor', await ev(`!document.querySelector('.noteEd') && noteOpenFor === null`) === true);

  // ---------- pin tap locates ----------
  const pinRes = await J(`(() => { const c = STRETCH['Astona'].line[Math.floor(STRETCH['Astona'].line.length / 2)]; // the pin handler's own target (app2): the middle point of the street's line
    const r = [...document.querySelectorAll('.srow')].find(x => x.querySelector('.nm').textContent === 'Astona'); r.querySelector('.smap').click();
    return { la: c[0], ln: c[1] }; })()`);
  await poll(`!$('sheet').classList.contains('open')`, 10000);
  await poll(`(() => { const c = map.getCenter(); return Math.abs(c.lat - ${pinRes.la}) < 0.0015 && Math.abs(c.lng - ${pinRes.ln}) < 0.002; })()`, 15000); // the flyTo's terminal state: the centre ON the street's middle point
  await sleep(300);
  const pinC = await J(`(() => { const c = map.getCenter(); return { la: c.lat, ln: c.lng }; })()`);
  const pinDist = Math.hypot((pinC.la - pinRes.la) * 111320, (pinC.ln - pinRes.ln) * 85100);
  ok('S13 the pin tap closes the sheet and centres the map on the street (within 150 m of its middle) | dist ' + Math.round(pinDist) + ' m', pinDist < 150);

  // ---------- D: detents, both sheets, three viewports, both themes ----------
  const VPS = [[360, 740], [390, 844], [430, 932]];
  for (const theme of ['day', 'night']) {
    await ev(`document.body.classList.${theme === 'night' ? 'add' : 'remove'}('night'); true`); await sleep(200);
    for (const [w, h] of VPS) {
      await setVp(w, h);
      for (const [id, opener] of [['sheet', `(() => { if (!$('sheet').classList.contains('open')) $('streetsBtn').click(); return true; })()`], ['pacePanel', 'openPace()']]) {
        await ev(opener); await sleep(650);
        const h0 = await sheetH(id);
        const pt = await grabPt(id);
        await drag(pt, -Math.round(h * 0.33));
        const hFull = await sheetH(id);
        const pt2 = await grabPt(id);
        await drag(pt2, Math.round(h * 0.28));
        const hHalf = await sheetH(id);
        const pt3 = await grabPt(id);
        await drag(pt3, Math.round(h * 0.28));
        const closed = await ev(`!document.getElementById('${id}').classList.contains('open')`);
        ok(`D detents ${theme} ${w}x${h} ${id}: open half (${h0}) -> full (${hFull}) -> half (${hHalf}) -> closed`,
          Math.abs(h0 - h / 2) <= 12 && Math.abs(hFull - h * 0.94) <= 16 && Math.abs(hHalf - h / 2) <= 12 && closed === true);
        await ev(opener); await sleep(650);
        const b = await J(`(() => { const s = document.getElementById('${id}'); const hd = s.querySelector('.sheetHead').getBoundingClientRect(); const x = s.querySelector('.sheetHead button').getBoundingClientRect(); return { l: hd.left, r: hd.right, xl: x.left, xr: x.right }; })()`);
        ok(`D bounds ${theme} ${w}x${h} ${id}: head and close button in-bounds at half`, b.l >= -1 && b.r <= w + 1 && b.xl >= 0 && b.xr <= w + 1);
        await ev(`closeSheets(); true`); await sleep(500);
      }
    }
  }
  await ev(`document.body.classList.remove('night'); true`);
  await setVp(420, 900);
} catch (e) {
  R.fatal = String(e && e.message || e);
}
R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String((c.args && c.args[0]) || c.text || '').slice(0, 220));
finish(R, proc);
