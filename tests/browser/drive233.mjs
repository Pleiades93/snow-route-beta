import { launchDrive, finish, expectVisible } from './harness.mjs';

// drive233: the snapshot-first guarantee - in a world where
// every request fails, the picker arms at the floor regardless.
const { proc, send, S, ev, poll, url } = await launchDrive({
  patterns: [{ urlPattern: 'http*://*', requestStage: 'Request' }],
  failWhen: () => true
});
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);

const pack = {
  id: 'snapshot233', name: 'Snapshot Drive Route', area: 'Testville',
  primaries: ['Fixture Main'], reference: {},
  roads: { 'Fixture Main': [[[43.82, -79.575], [43.82, -79.57]]] }
};
// Seed the returning document before any app script reads
// storage; the same script stamps the arm moment there.
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  localStorage.setItem('snowroute.v2.userpacks', ${JSON.stringify(JSON.stringify({ [pack.id]: pack }))});
  localStorage.setItem('snowroute.v5.export', JSON.stringify({ exportedAt: Date.now() }));
  window.__armObs = { t0: Date.now(), armAt: null, glOk: null, tilesOk: null };
  setInterval(() => {
    const rm = document.getElementById('routeMenu');
    if (!rm || !rm.classList.contains('show') || window.__armObs.armAt !== null) return;
    window.__armObs.armAt = Date.now();
    try { window.__armObs.glOk = glOk; } catch (e) {}
    try { window.__armObs.tilesOk = tilesOk; } catch (e) {}
  }, 25);
` }, S);
await send('Page.navigate', { url }, S);

async function tap(selector) {
  const point = `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el || el.disabled) return null;
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
    return el.contains(document.elementFromPoint(x, y)) ? { x, y } : null;
  })()`;
  if (!await poll(`Boolean(${point})`, 2500)) return false;
  const target = await ev(point);
  if (!target) return false;
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [target] }, S);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }, S);
  return true;
}

const armed = await poll('window.__armObs && window.__armObs.armAt !== null', 12000);
const obs = armed ? JSON.parse(await ev('JSON.stringify(window.__armObs)')) : {};
ok('The picker arms with the map never ready (glOk false, no tile parsed)',
  armed && obs.glOk === false && obs.tilesOk === 0);
ok('The picker arms at the intro floor, not the six-second escape',
  armed && obs.armAt - obs.t0 >= 2500 && obs.armAt - obs.t0 < 5000);

const choose = '#routeMenu.boot.show #rmMain.on #rmChoose';
const row = `#rmListPane.on .routeRow[data-route="${pack.id}"]`;
// The capture listener registers after the app's handler, so it
// reads the row in that handler's own turn.
await ev(`document.querySelector('#rmChoose')?.addEventListener('click', () => {
  const row = document.querySelector(${JSON.stringify(row)});
  window.__snapshot233 = {
    name: row?.querySelector('.routeName').textContent,
    detail: row?.querySelector('.routeArea').textContent
  };
}, { once: true })`);
ok('The boot picker paints and a real tap opens its route list',
  armed && await expectVisible(ev, choose) && await tap(choose)
  && await poll("!!window.__snapshot233 && document.querySelector('#rmListPane').classList.contains('on')", 2500));
ok('The first route-list render contains the device route name, area and street count',
  await expectVisible(ev, row) && await ev(`window.__snapshot233?.name === ${JSON.stringify(pack.name)}
    && window.__snapshot233.detail === 'Testville · 1 streets'`));

const load = `#rmListPane.on .routeDrop.open[data-route="${pack.id}"] .dropLoad`;
ok('Real taps load the stored route and open Settings under the same stall',
  await tap(row) && await tap(load)
  && await poll(`activeRoute?.id === ${JSON.stringify(pack.id)} && !document.querySelector('#splash')`, 2500)
  && await tap('#setBtn')
  && await poll("document.querySelector('#setMenu').classList.contains('open')", 2500));
const backup = '#setMenu.open #setMainPane.on #bakAge';
ok('Settings paints the saved backup age on entry',
  await expectVisible(ev, backup) && await ev(`document.querySelector('${backup}').textContent === 'Last backup: today'`));

finish(R, proc);
