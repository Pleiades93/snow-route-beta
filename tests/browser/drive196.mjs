import { launchDrive, finish, PATTERNS_GITHUB_IO, bootThrough, tapById } from './harness.mjs';
const { proc, send, S, ev, consoleLog, sleep, poll } = await launchDrive({ patterns: PATTERNS_GITHUB_IO });
await bootThrough(ev, poll); // boots end at the route menu - click through to a loaded route

// drive196: Beta 1.191 - the tab bar takes the standard iOS tab-bar height
// (Andrew, from his side-by-side with another app: his bar stood taller and
// higher; measured, the whole difference was padding). Every check measures
// the FAILURE property directly in the rendered page at 390x844 - the bar's
// real height, the real gaps above its top edge, real presses at the corners
// and centres of all five tab items firing their actions - never a proxy
// like a class name or a stylesheet string. Day AND night.
// The bar: content zone 56 -> 49px by design (bar padding 6/6 -> 4/3, item
// padding 4/2 -> 3/1; icons 24px and labels 10px untouched); rendered height
// 58 -> 51 (the label's line box stands 2px over the design zone, before and
// after - drive180's SNOW9 pin follows the same 51, and the splash snow
// peak in parts/brand-snow.js follows it too).
// Beta 1.271: the .banner family is REMOVED whole - F3/F5 below re-derive
// on #mapNote, the last bottom-anchored bar; the toast stands.
// The offset audit this drive proves: #dock 74 -> 67, #spd 76 -> 69,
// #attrChip 68 -> 61 (the floaters that hug the bar's top edge ride the -7,
// rendered gaps unchanged); .banner 236, #mapNote 240, #toast 120 stay.
// (The #spd chip itself was REMOVED in Beta 1.203 - replaced by the
// top-centre speed pill - so its F6 gap check retired with it; drive198
// proves the pill. The dock and attribution gaps below still stand.)
// (the banners clear the whole bottom chrome stack, not the bar alone; the
// toast is a screen-level placement that must also read over the menus).
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };
const mouse = async (type, x, y) => { await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }, S); };
const pressAt = async (x, y) => { await mouse('mousePressed', x, y); await sleep(90); await mouse('mouseReleased', x, y); await sleep(520); }; // 520ms: clears the app's 400ms per-button tap guard before any repeat press
const overlaps = (a, b) => a.x < b.r - 1 && b.x < a.r - 1 && a.y < b.b - 1 && b.y < a.b - 1;

await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, S);
await sleep(1200);

const geom = () => J(`(() => { const r = (id) => { const e = document.getElementById(id); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, r: b.right, b: b.bottom }; };
  const bar = r('tabBar'); const cs = getComputedStyle(document.getElementById('tabBar')); const ci = getComputedStyle(document.querySelector('#tabBar .tabItem'));
  const gap = (id) => { const f = r(id); return f && f.h > 0 ? Math.round((bar.y - f.b) * 10) / 10 : null; };
  return { vh: window.innerHeight, bar, barPadT: cs.paddingTop, barPadB: cs.paddingBottom, itemPadT: ci.paddingTop, itemPadB: ci.paddingBottom,
    dock: r('dock'), attr: r('attrChip'), gapDock: gap('dock'), gapAttr: gap('attrChip'),
    bannerGone: !document.getElementById('suggest') && !document.getElementById('stale'), noteBottom: getComputedStyle(document.getElementById('mapNote')).bottom,
    toastGone: !document.getElementById('toast'),
    items: [...document.querySelectorAll('#tabBar .tabItem')].map(e => { const b = e.getBoundingClientRect(); return { id: e.id, x: b.x, y: b.y, w: b.width, h: b.height, r: b.right, b: b.bottom }; }) }; })()`);

let G = await geom();
ok('G0 app boots with the map active', await poll(`typeof glOk !== 'undefined' && glOk === true`, 30000));

// ---- the bar itself, day -------------------------------------------------
ok('B1 bar height is the standard height rendered: 51px at 390x844 (was 58) | ' + JSON.stringify(G.bar),
  !!G.bar && Math.abs(G.bar.h - 51) <= 1 && Math.abs(G.bar.b - G.vh) <= 1 && Math.abs(G.bar.x) <= 1 && Math.abs(G.bar.w - 390) <= 1);
ok('B2 the change is the padding, exactly: bar 4px top / 3px bottom, items 3px top / 1px bottom | ' + [G.barPadT, G.barPadB, G.itemPadT, G.itemPadB].join('/'),
  G.barPadT === '4px' && G.barPadB === '3px' && G.itemPadT === '3px' && G.itemPadB === '1px');
ok('B3 all five items fill the content zone (44px tall, equal widths, no overlaps) | ' + JSON.stringify(G.items),
  G.items.length === 5 && G.items.every(it => Math.abs(it.h - 44) <= 1) && G.items.every((it, i) => i === 0 || Math.abs(it.w - G.items[0].w) <= 1) &&
  G.items.every((a, i) => G.items.every((b, j) => i === j || !overlaps(a, b))));

// ---- the floaters' gaps over the bar's NEW top edge ----------------------
ok('F1 dock gap above the bar top edge is the pre-change rendered gap: 16px (dock rode 74 -> 67) | gap ' + G.gapDock, G.gapDock !== null && Math.abs(G.gapDock - 16) <= 1);
ok('F2 attribution chip gap above the bar top edge is the pre-change rendered gap: 10px (chip rode 68 -> 61) | gap ' + G.gapAttr, G.gapAttr !== null && Math.abs(G.gapAttr - 10) <= 1);
ok('F3 the non-riding offsets hold: mapNote 240px - and both retired surfaces are gone entirely (the toast element since Beta 1.296, the banner slot since Beta 1.271; the live banner seat is drive225) ' +
  '| ' + JSON.stringify({ note: G.noteBottom, toastGone: G.toastGone, bannerGone: G.bannerGone }),
  G.noteBottom === '240px' && G.toastGone === true && G.bannerGone === true);
ok('F4 nothing overlaps the bar: dock and attribution chip clear it | dock ' + JSON.stringify(G.dock) + ' attr ' + JSON.stringify(G.attr),
  !!G.dock && !!G.attr && !overlaps(G.dock, G.bar) && !overlaps(G.attr, G.bar));

// a shown bottom bar must also clear the tab bar by its stack margin (it did not ride)
// Beta 1.224 re-derivation (same claim, same strength): the representative banner was #stale - the backup-nudge bar this check used to borrow was REMOVED with the nudge; #stale wore the same .banner slot at the same 236px bottom.
// Beta 1.271 re-derivation (same claim, same strength): BOTH .banner bars are REMOVED with the suggestion and stale banners - the representative bottom bar is #mapNote now, the last bottom-anchored bar, at its own 240px.
await ev(`document.getElementById('mapNote').classList.remove('hidden'); true`); await sleep(500);
G = await geom();
const bannerRect = await J(`(() => { const b = document.getElementById('mapNote').getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, r: b.right, b: b.bottom }; })()`);
ok('F5 a shown bottom bar clears the tab bar entirely (no overlap, in viewport) | note ' + JSON.stringify(bannerRect) + ' bar ' + JSON.stringify(G.bar),
  bannerRect.h > 0 && !overlaps(bannerRect, G.bar) && bannerRect.b <= G.bar.y && bannerRect.x >= 0 && bannerRect.r <= 390);
await ev(`document.getElementById('mapNote').classList.add('hidden'); true`); await sleep(300);

// ---- real presses: corners and centres of all five tab items -------------
const itemRect = async (id) => (await geom()).items.find(it => it.id === id);
const cornersOf = (rc) => [[rc.x + 3, rc.y + 3], [rc.r - 3, rc.y + 3], [rc.x + 3, rc.b - 3], [rc.r - 3, rc.b - 3], [rc.x + rc.w / 2, rc.y + rc.h / 2]];

// gpsBtn toggles Locate; the bar stays reachable throughout, so the full
// corner cycle runs: ON (corner) -> OFF (corner) -> ON (corner) -> OFF
// (corner) -> ON (centre) -> OFF (centre), ending OFF as it began.
// The rig's real watchPosition answers permission-denied, and the app
// (correctly) drops straight back to off - so the watch is stubbed, the
// drive133 idiom, and the real click handler + start/stop paths run
// against the stub.
await ev(`(() => { navigator.geolocation.watchPosition = () => 4242; navigator.geolocation.clearWatch = () => {}; return true; })()`);
{
  const rc = await itemRect('gpsBtn'); const pts = cornersOf(rc); let seq = [];
  const isOn = () => ev(`document.getElementById('gpsBtn').classList.contains('on')`);
  for (let i = 0; i < pts.length; i++) { await pressAt(pts[i][0], pts[i][1]); seq.push(await isOn()); }
  await pressAt(pts[4][0], pts[4][1]); seq.push(await isOn());
  ok('T1 Locate fires from all four corners and the centre (on/off alternating) | ' + JSON.stringify(seq),
    JSON.stringify(seq) === JSON.stringify([true, false, true, false, true, false]));
}
// routesBtn toggles the Routes takeover; while it is open the bar is
// covered, so corners are proven one open at a time, closed by the menu's
// own close button between presses.
{
  const rc = await itemRect('routesBtn'); const pts = cornersOf(rc); let seq = [];
  const isOpen = () => ev(`document.getElementById('routeMenu').classList.contains('open')`);
  for (let i = 0; i < pts.length; i++) {
    await pressAt(pts[i][0], pts[i][1]); seq.push(await isOpen());
    await tapById(ev, 'rmClose'); await sleep(500); seq.push(await isOpen());
  }
  ok('T2 Routes fires from all four corners and the centre (menu opens each time) | ' + JSON.stringify(seq),
    seq.every((v, i) => v === (i % 2 === 0)));
}
// setBtn opens the Settings takeover; same one-open-at-a-time corner proof.
{
  const rc = await itemRect('setBtn'); const pts = cornersOf(rc); let seq = [];
  const isOpen = () => ev(`document.getElementById('setMenu').classList.contains('open')`);
  for (let i = 0; i < pts.length; i++) {
    await pressAt(pts[i][0], pts[i][1]); seq.push(await isOpen());
    await tapById(ev, 'setClose'); await sleep(500); seq.push(await isOpen());
  }
  ok('T3 Settings fires from all four corners and the centre (menu opens each time) | ' + JSON.stringify(seq),
    seq.every((v, i) => v === (i % 2 === 0)));
}
// homeBtn frames the route: push the camera away, then every press must
// pull it back to the route's centre.
{
  const rc = await itemRect('homeBtn'); const pts = cornersOf(rc); let ratios = [];
  for (let i = 0; i < pts.length; i++) {
    await ev(`(() => { const c = [(routeBox.w + routeBox.e) / 2, (routeBox.s + routeBox.n) / 2]; map.setCenter([c[0] + 0.06, c[1] + 0.06]); map.setZoom(12); return true; })()`);
    await sleep(400);
    const before = await J(`(() => { const c = [(routeBox.w + routeBox.e) / 2, (routeBox.s + routeBox.n) / 2]; const m = map.getCenter(); return Math.hypot(m.lng - c[0], m.lat - c[1]); })()`);
    await pressAt(pts[i][0], pts[i][1]);
    const after = await poll(`(() => { const c = [(routeBox.w + routeBox.e) / 2, (routeBox.s + routeBox.n) / 2]; const m = map.getCenter(); return Math.hypot(m.lng - c[0], m.lat - c[1]) < ${(before * 0.25).toFixed(5)}; })()`, 6000);
    ratios.push(after === true);
  }
  ok('T4 Home fires from all four corners and the centre (camera reframes the route each time) | ' + JSON.stringify(ratios), ratios.every(Boolean));
}
// clearBtn ASKS first now (Beta 1.271): every corner and the centre of the
// Clear item raise the confirmation, and the ask's danger button - pressed
// at its own centre each time - is what wipes the marks. Re-mark before
// every press.
{
  const rc = await itemRect('clearBtn'); const pts = cornersOf(rc); let seq = [];
  for (let i = 0; i < pts.length; i++) {
    await ev(`togglePiece('Velmar', 0, 0); true`); await sleep(300);
    await pressAt(pts[i][0], pts[i][1]);
    const dg = await J(`(() => { const pill = document.getElementById('confirmPill'); const b = document.getElementById('cfDanger').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, shown: !!pill && !pill.classList.contains('hidden') }; })()`);
    if (dg.shown) await pressAt(dg.x, dg.y);
    seq.push(await ev(`STREETNAMES.every(n => pieces[n].every(v => v === 0))`));
  }
  ok('T5 Clear fires from all four corners and the centre - each press raises the ask, the ask clears the marks | ' + JSON.stringify(seq), seq.every(Boolean));
}
// F6 (the speed chip's gap over the bar) RETIRED in Beta 1.203: the chip it
// measured was removed whole and replaced by the top-centre speed pill,
// whose placement drive198 proves. The T1 cycle above ended with Locate
// OFF, as it began - nothing here needs it back on.

// ---- the same bar, night --------------------------------------------------
await tapById(ev, 'nightBtn'); await sleep(800);
G = await geom();
ok('N1 night: bar height still 51px with the same paddings | bar ' + JSON.stringify(G.bar) + ' pads ' + [G.barPadT, G.barPadB, G.itemPadT, G.itemPadB].join('/'),
  await ev(`document.body.classList.contains('night')`) && !!G.bar && Math.abs(G.bar.h - 51) <= 1 && G.barPadT === '4px' && G.barPadB === '3px' && G.itemPadT === '3px' && G.itemPadB === '1px');
ok('N2 night: dock and attribution gaps unchanged (16px / 10px), no overlap with the bar | ' + JSON.stringify([G.gapDock, G.gapAttr]),
  G.gapDock !== null && Math.abs(G.gapDock - 16) <= 1 && G.gapAttr !== null && Math.abs(G.gapAttr - 10) <= 1 && !overlaps(G.dock, G.bar) && !overlaps(G.attr, G.bar));
await tapById(ev, 'nightBtn'); await sleep(500);

R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION');
finish(R, proc);
