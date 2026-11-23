import { launchDrive, finish, bootThrough } from './harness.mjs';
const { proc, ev, send, S, consoleLog, sleep, poll } = await launchDrive();
await bootThrough(ev, poll);

// drive222: Beta 1.273 (Menus follow-up) - the route dropdown, rebuilt to
// Andrew's decided spec (2026-11-22) and measured in the rendered page:
// the card grows out of its pill (same width to the pixel, same tint),
// slides on 420ms open / 335ms close, the pill's bottom corners morph
// FLUIDLY in sync, and the layout law holds - nothing above the opening
// route moves (title, the pill, routes above: 0px), only what is below
// rides down by exactly the dropdown's 97px, the card never overlaps
// Back, and one dropdown is open at a time.
//   B (list under its height cap): the full law, incl. Back +97.
//   A (list at its cap): title/above still 0px, next row +97, no overlap.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };
const waitBoot = async () => { for (let i = 0; i < 40; i++) { try { if (await ev(`typeof openRouteMenu === 'function' && !!document.getElementById('ver')`)) return true; } catch (e) {} await sleep(400); } return false; };
const PACK = (nm) => ({ name: nm, area: 'Vaughan', primaries: [], roads: { 'Alpha Street': [[[43.8, -79.57], [43.801, -79.571]]] }, reference: {} });
const seed = async (ids) => {
  await ev(`(() => { const rec = {}; ${ids.map(id => `rec['${id}'] = ${JSON.stringify(PACK('Route ' + id.slice(-1)))};`).join(' ')} localStorage.setItem('snowroute.v2.userpacks', JSON.stringify(rec)); for (const id of Object.keys(rec)) { const rk = routeKeys(id); const vals = { done: '[]', times: '{}', hist: '[]', notes: '{}', via: '{}', trail: '[]', cov: '{}', start: '0', flip: '{}', sides: '{"p":{},"t":{}}', sess: '[]', pre: '{"at":0}', snap: '{"x":1}', mig: '1' }; for (const f of Object.keys(rk)) localStorage.setItem(rk[f], vals[f] || 'x'); } return true; })()`);
  await ev(`location.reload(); true`); await waitBoot();
  await ev(`window.__userPacksReady`); await sleep(800);
  await ev(`openRouteMenu(); document.getElementById('rmChoose').click(); true`); await sleep(800);
};
const GEO = `(() => { const rows = [...document.querySelectorAll('#rmRoutes .routeRow')]; const title = document.querySelector('#rmListPane .rmTitle'); const back = document.getElementById('rmBack'); const list = document.getElementById('rmRoutes');
  return { titleTop: title.getBoundingClientRect().top, backTop: back.getBoundingClientRect().top, rows: rows.map(r => { const b = r.getBoundingClientRect(); return { id: r.dataset.route, top: b.top, w: b.width }; }), listH: list.getBoundingClientRect().height, listScrollH: list.scrollHeight }; })()`;
const REC = (id) => `(() => { window.__dd = []; window.__ddRun = true; const card = document.querySelector('#rmRoutes .routeDrop[data-route="${id}"]'); const row = document.querySelector('#rmRoutes .routeRow[data-route="${id}"]'); const back = document.getElementById('rmBack');
  const step = () => { if (!window.__ddRun) return; const cb = card.getBoundingClientRect(); const inn = card.querySelector('.routeDropIn');
    window.__dd.push({ t: performance.now(), h: cb.height, cb: cb.bottom, rad: parseFloat(getComputedStyle(row).borderBottomLeftRadius), io: inn ? inn.getBoundingClientRect().top - cb.top : null, bt: back.getBoundingClientRect().top }); }; window.__ddIv = setInterval(step, 12); return true; })()`;
const STOPREC = `(() => { window.__ddRun = false; clearInterval(window.__ddIv); return true; })()`;

try {
  // ---------- B: four routes, list under its cap ----------
  await ev(`localStorage.clear(); location.reload(); true`); await waitBoot(); await sleep(1200);
  await seed(['route-2', 'route-3', 'route-4']);
  const rest = await J(GEO);
  ok('B setup: four rows stand (5w + 3 seeded) and the list is under its cap | ' + JSON.stringify({ n: rest.rows.length, listH: rest.listH, scrollH: rest.listScrollH }), rest.rows.length === 4 && rest.listScrollH <= rest.listH + 1);

  await ev(REC('route-2'));
  await ev(`(() => { window.__ddT0 = performance.now(); document.querySelector('#rmRoutes .routeRow[data-route="route-2"]').click(); return true; })()`);
  const animO = await J(`(() => { const c = document.querySelector('#rmRoutes .routeDrop[data-route="route-2"]'); const a = c.getAnimations().find(x => x.transitionProperty === 'height'); return a ? { dur: a.effect.getTiming().duration, st: a.playState } : null; })()`);
  await sleep(750); await ev(STOPREC);
  const open = await J(GEO);
  const cardB = await J(`(() => { const c = document.querySelector('#rmRoutes .routeDrop[data-route="route-2"]'); const b = c.getBoundingClientRect(); const cs = getComputedStyle(c); return { w: b.width, h: b.height, bg: cs.backgroundColor, rtl: cs.borderTopLeftRadius, rbr: cs.borderBottomRightRadius, disp: cs.display, td: cs.transitionDuration }; })()`);
  const smp = await J(`window.__dd`);
  const t0 = await J(`window.__ddT0`);
  const midRad = smp.some(s => s.rad > 0.5 && s.rad < 13.5);
  const midH = smp.some(s => s.h > 5 && s.h < 92);
  const midIo = smp.some(s => s.io !== null && s.io > -92 && s.io < -5);
  const midLate = smp.some(s => s.t - t0 > 100 && s.t - t0 < 400 && s.h > 5 && s.h < 92); // the travel witness: well after the click the card is still mid-flight (a snap or a short transition would be seated by then)
  const noOverlap = smp.every(s => s.cb < s.bt + 0.5);
  ok('B width: the grown card measures exactly its pill width | ' + JSON.stringify({ card: cardB.w, row: rest.rows[1].w }), Math.abs(cardB.w - rest.rows[1].w) < 0.5);
  ok('B face: the card wears the pill tint, a square top and the 14px bottom radius | ' + JSON.stringify(cardB), cardB.bg === 'rgba(255, 255, 255, 0.18)' && cardB.rtl === '0px' && cardB.rbr === '14px' && Math.abs(cardB.h - 97) < 1);
  ok('B law (above): title, routes above and the pill itself move 0px | ' + JSON.stringify({ title: open.titleTop - rest.titleTop, r0: open.rows[0].top - rest.rows[0].top, r1: open.rows[1].top - rest.rows[1].top }), Math.abs(open.titleTop - rest.titleTop) < 0.5 && Math.abs(open.rows[0].top - rest.rows[0].top) < 0.5 && Math.abs(open.rows[1].top - rest.rows[1].top) < 0.5);
  ok('B law (below): the next route and Back ride down by exactly the dropdown height (97) | ' + JSON.stringify({ r2: open.rows[2].top - rest.rows[2].top, back: open.backTop - rest.backTop }), Math.abs((open.rows[2].top - rest.rows[2].top) - 97) < 1.5 && Math.abs((open.backTop - rest.backTop) - 97) < 1.5);
  ok('B fluid pair: mid-animation the corner radius is strictly between 0 and 14 AND the card is mid-travel with its inner mid-slide | samples=' + smp.length, midRad && midH && midIo);
  ok('B open pace: the growth runs the house 420ms (the running transition own timing) and is still mid-travel well past +100ms | ' + JSON.stringify({ anim: animO, midLate }), animO !== null && animO.dur === 420 && midLate);
  ok('B no overlap: the growing card never reaches Back | samples=' + smp.length, noOverlap);

  // ---------- one open at a time ----------
  await ev(`document.querySelector('#rmRoutes .routeRow[data-route="route-3"]').click(); true`); await sleep(900);
  const swap = await J(`(() => { const c2 = document.querySelector('#rmRoutes .routeDrop[data-route="route-2"]'); const c3 = document.querySelector('#rmRoutes .routeDrop[data-route="route-3"]'); const back = document.getElementById('rmBack').getBoundingClientRect().top; return { c2open: c2.classList.contains('open'), c2disp: getComputedStyle(c2).display, c3open: c3.classList.contains('open'), back }; })()`);
  ok('B one-at-a-time: opening route-3 closes route-2 (class off, card landed out of the layout) and the growth is still exactly one dropdown | ' + JSON.stringify(swap), swap.c2open === false && swap.c2disp === 'none' && swap.c3open === true && Math.abs(swap.back - open.backTop) < 1.5);

  // ---------- the close: 335ms, fluid back ----------
  await ev(REC('route-3'));
  await ev(`(() => { window.__ddT0 = performance.now(); document.querySelector('#rmRoutes .routeRow[data-route="route-3"]').click(); return true; })()`);
  const animC = await J(`(() => { const c = document.querySelector('#rmRoutes .routeDrop[data-route="route-3"]'); const a = c.getAnimations().find(x => x.transitionProperty === 'height'); return a ? { dur: a.effect.getTiming().duration, st: a.playState } : null; })()`);
  let closeLand = -1; let lastSt = null; for (let i = 0; i < 25; i++) { lastSt = await J(`(() => { const c = document.querySelector('#rmRoutes .routeDrop[data-route="route-3"]'); if (!c) return 'nocard'; const a = c.getAnimations().find(x => x.transitionProperty === 'height'); return a ? a.playState : 'gone'; })()`); if (lastSt === 'finished' || lastSt === 'gone') { closeLand = await J(`performance.now() - window.__ddT0`); break; } await sleep(30); }
  await ev(STOPREC); await sleep(300);
  const csmp = await J(`window.__dd`); const ct0 = await J(`window.__ddT0`);
  const closed = await J(`(() => { const c = document.querySelector('#rmRoutes .routeDrop[data-route="route-3"]'); const row = document.querySelector('#rmRoutes .routeRow[data-route="route-3"]'); const back = document.getElementById('rmBack').getBoundingClientRect().top; return { disp: getComputedStyle(c).display, td: getComputedStyle(c).transitionDuration, rad: parseFloat(getComputedStyle(row).borderBottomLeftRadius), back }; })()`);
  const smpLand = (() => { const hit = csmp.find(s => s.h <= 1); return hit ? hit.t - ct0 : -1; })();
  const closeDur = closeLand; // two landing witnesses (the transition's own finish, polled; the first geometry sample at h<=1) - this VM starves one or the other on a given run (healthy runs: poll ~360-520, samples ~359), so the pace passes on either, with the 335 duration itself asserted from the running animation above
  const midCloseRad = csmp.some(s => s.rad > 0.05 && s.rad < 13.95); // any intermediate value at all disproves a snap; --ease-close starts slow, so under a starved sampler the intermediates sit near 0
  ok('B close pace: the close runs 335ms (the running transition own timing, NOT the 420 open) and lands in step (finish poll 280-520 or first flat sample 250-460) | ' + JSON.stringify({ anim: animC, land: closeDur, smpLand, lastSt }), animC !== null && animC.dur === 335 && ((closeDur > 280 && closeDur < 520) || (smpLand > 250 && smpLand < 460)));
  ok('B close fluid: the corners morph back mid-close too | samples=' + csmp.length, midCloseRad);
  ok('B closed rest: the card leaves the layout, the corners are round again and Back is home | ' + JSON.stringify(closed), closed.disp === 'none' && closed.rad === 14 && Math.abs(closed.back - rest.backTop) < 1.5);

  // ---------- A: seven routes, list at its cap ----------
  await ev(`document.getElementById('rmClose').click(); true`); await sleep(400);
  await seed(['route-2', 'route-3', 'route-4', 'route-5', 'route-6', 'route-7', 'route-8']);
  const restA = await J(GEO);
  ok('A setup: eight rows stand and the list sits at its cap | ' + JSON.stringify({ n: restA.rows.length, listH: restA.listH, scrollH: restA.listScrollH }), restA.rows.length === 8 && restA.listScrollH > restA.listH + 40);
  await ev(`document.querySelector('#rmRoutes .routeRow[data-route="route-2"]').click(); true`); await sleep(750);
  const openA = await J(GEO);
  const cardABot = await J(`document.querySelector('#rmRoutes .routeDrop[data-route="route-2"]').getBoundingClientRect().bottom`);
  ok('A law (above): at the cap the title and the route above still move 0px | ' + JSON.stringify({ title: openA.titleTop - restA.titleTop, r0: openA.rows[0].top - restA.rows[0].top }), Math.abs(openA.titleTop - restA.titleTop) < 0.5 && Math.abs(openA.rows[0].top - restA.rows[0].top) < 0.5);
  ok('A law (below): the next route rides down by exactly 97 inside the capped list | ' + JSON.stringify({ r2: openA.rows[2].top - restA.rows[2].top }), Math.abs((openA.rows[2].top - restA.rows[2].top) - 97) < 1.5);
  ok('A no overlap: the card stays inside the list and never reaches Back | ' + JSON.stringify({ cardBot: cardABot, back: openA.backTop }), cardABot < openA.backTop);
} catch (e) { R.checks.push(['drive222 completed without exception: ' + (e && e.message || e), false]); }
finish(R, proc);
