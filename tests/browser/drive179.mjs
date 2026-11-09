import { launchDrive, finish } from './harness.mjs';
import { PACK5W } from './pack-expect.mjs';
import fs from 'node:fs';
const { proc, send, S, ev, consoleLog, sleep, poll } = await launchDrive();

// drive179: Beta 1.153 UX fix round, item 5 - the pick stage's street
// search (crRunSearch, Nominatim) is scoped to the loaded city.
// Andrew: with a city loaded, suggestions must come from THAT city
// only - never worldwide. Beta 1.121 had made the search BIAS-only
// (viewbox with bounded=0: "a bias, never a restriction"), so results
// from anywhere on earth could appear. Now, with a city loaded the
// request carries bounded=1 on the city's bounding box AND the
// returned list is filtered through crInBox on the same box - the
// stub below deliberately IGNORES the bound (it returns both results
// whatever the request says, like a service that treats bounded as a
// hint), so the filter half is proven, not assumed. With NO city
// loaded the search keeps the old visible-map bias (bounded=0) and
// both results render: the control half.
// Fixture: one in-city street (Bordeaux Drive, Vaughan - inside the
// fixture city's box [43.785..43.845] x [-79.610..-79.5105]) and one
// far-out street (Vaughan Road, Toronto - south and east of the box).
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };

const FIXDATA = JSON.parse(fs.readFileSync(new URL('./fixtures/create-osm.json', import.meta.url), 'utf8'));
const elsByName = FIXDATA.overpass;
const JDATA = (() => {
  const byId = {};
  for (const k of Object.keys(elsByName)) for (const e of elsByName[k]) byId[e.id] = { name: k, geometry: e.geometry };
  return { byId };
})();
const JCITY = [{ display_name: 'Vaughan, Ontario, Canada', lat: '43.8150', lon: '-79.5600', boundingbox: ['43.785', '43.845', '-79.610', '-79.5105'], class: 'place', type: 'city', address: { city: 'Vaughan', state: 'Ontario', country: 'Canada', country_code: 'ca' } }];
const STREET_RESULTS = [
  { display_name: 'Bordeaux Drive, Vaughan, Ontario, Canada', lat: '43.798972', lon: '-79.574666', address: { road: 'Bordeaux Drive', city: 'Vaughan' } },
  { display_name: 'Vaughan Road, Toronto, Ontario, Canada', lat: '43.6830', lon: '-79.4260', address: { road: 'Vaughan Road', city: 'Toronto' } }
];
const installStub = `(() => {
  const DATA = ${JSON.stringify(JDATA)};
  const CITY = ${JSON.stringify(JCITY)};
  const STREETS = ${JSON.stringify(STREET_RESULTS)};
  const prev = window.fetch.bind(window);
  window.__searchUrls = [];
  const boxOf = raw => { const m = /\\(([-\\d.]+),([-\\d.]+),([-\\d.]+),([-\\d.]+)\\)/.exec(raw); return m ? { s: +m[1], w: +m[2], n: +m[3], e: +m[4] } : null; };
  const elsFor = raw => {
    const box = boxOf(raw); if (!box) return [];
    const nm = /"name"="([^"]+)"/.exec(raw);
    const out = [];
    for (const id of Object.keys(DATA.byId)) {
      const w = DATA.byId[id];
      if (nm && w.name !== nm[1]) continue;
      if (!nm && raw.indexOf('["highway"]') < 0) continue;
      if (w.geometry.some(g => g.lat >= box.s && g.lat <= box.n && g.lon >= box.w && g.lon <= box.e)) out.push({ type: 'way', id: +id, tags: { name: w.name }, geometry: w.geometry });
    }
    return out;
  };
  window.fetch = (url, opts) => {
    const u = String(url);
    if (u.indexOf('nominatim.openstreetmap.org') >= 0) {
      if (u.indexOf('featuretype=city') >= 0) return Promise.resolve(new Response(JSON.stringify(CITY), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      window.__searchUrls.push(u); // the STREET search: record the request, then answer with BOTH results whatever bound it carried - a service ignoring the bound
      return Promise.resolve(new Response(JSON.stringify(STREETS), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }
    if (u.indexOf('overpass-api.de') >= 0 || u.indexOf('overpass.kumi.systems') >= 0) {
      const raw = decodeURIComponent((opts && opts.body) || '').replace(/^data=/, '');
      return Promise.resolve(new Response(JSON.stringify({ elements: elsFor(raw) }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }
    return prev(url, opts);
  };
  return true;
})()`;
const pickCityVaughan = async () => {
  await poll(`document.getElementById('rmCityPane').classList.contains('on')`, 10000).catch(() => false);
  await ev(`(() => { const i = document.getElementById('crCityInput'); i.value = 'Vaughan'; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  const rows = await poll(`document.querySelectorAll('#crCityResults .routeRow').length === 1`, 10000).catch(() => false);
  if (rows === true) await ev(`document.querySelector('#crCityResults .routeRow').click()`);
  return await poll(`typeof creating !== 'undefined' && creating === true && crStage === 'pick'`, 10000).catch(() => false);
};
const runStreetSearch = async () => {
  await ev(`(() => { const i = document.getElementById('crSearchInput'); i.value = 'Vaughan'; document.getElementById('createResults').innerHTML = ''; return true; })()`); // cleared first, so the poll below can only be satisfied by THIS query's render
  await ev(`crSearch()`); // the search button's own path: cancel any debounce, run the typed query now
  return await poll(`document.querySelectorAll('#createResults .crResult').length > 0`, 10000).catch(() => false);
};
const resultSample = () => J(`({ rows: [...document.querySelectorAll('#createResults .crResult')].map(b => b.textContent), urls: (window.__searchUrls || []).slice() })`);

// ---------- boot 5W ----------
await poll(`typeof loadRoute === 'function'`, 20000);
await poll(`!!window.__bootAt`, 30000);
await ev(`document.getElementById('rmChoose').click()`);
await ev(`document.querySelector('#rmRoutes .routeRow').click()`);
await poll(`typeof routeLoaded !== 'undefined' && routeLoaded === true`, 20000);
await poll(`!document.getElementById('splash')`, 20000);
await poll(`typeof map === 'undefined' || !map || !map.isMoving()`, 25000);
await ev(installStub);
const SETUP = await J(`({ names: STREETNAMES.slice() })`);
ok('setup: 5W loaded and the fixture stub installed', SETUP.names.length === PACK5W.names);

// ---------- enter create (manual door): the pick stage stands, NO city loaded yet ----------
await ev(`openRouteMenu()`);
await ev(`document.getElementById('rmCreate').click()`);
await ev(`document.getElementById('crDoorManual').click()`);
await poll(`document.getElementById('rmCityPane').classList.contains('on')`, 10000);
const noCity = await J(`({ pane: document.getElementById('rmCityPane').classList.contains('on'), city: typeof crCity !== 'undefined' && !!crCity })`);
ok('setup: creation is open at the city step with NO city loaded (the control state - the create session itself starts at the pick, so the premise is the city pane standing with crCity unset)', noCity.pane === true && noCity.city === false);

// ---------- control: no city loaded - the old bias, both results ----------
const ctlRan = await runStreetSearch();
const CTL = await resultSample();
ok('control (no city loaded) the search stays the old visible-map BIAS - the request carries bounded=0 and BOTH fixture results render, the Toronto one included | ' + JSON.stringify(CTL),
  ctlRan === true && CTL.rows.length === 2 && CTL.urls.length >= 1 && CTL.urls[CTL.urls.length - 1].indexOf('bounded=0') >= 0 && CTL.rows.some(t => t.indexOf('Toronto') >= 0));

// ---------- scoped: pick Vaughan, search again ----------
const inPick = await pickCityVaughan();
const ready = await poll(`typeof crPrepState !== 'undefined' && crPrepState === 'ready'`, 30000).catch(() => false);
await ev(`window.__searchUrls = []`);
const scopedRan = await runStreetSearch();
const SC = await resultSample();
ok('scoped (city loaded) the search request now carries the city BOUND (bounded=1 on the city viewbox) | ' + JSON.stringify(SC.urls),
  inPick === true && ready === true && scopedRan === true && SC.urls.length >= 1 && SC.urls[SC.urls.length - 1].indexOf('bounded=1') >= 0);
ok('scoped (city loaded) although the service returned BOTH results (it ignored the bound), only the in-city suggestion renders - the out-of-city Toronto result is filtered out | ' + JSON.stringify(SC.rows),
  SC.rows.length === 1 && SC.rows[0].indexOf('Bordeaux Drive') === 0 && !SC.rows.some(t => t.indexOf('Toronto') >= 0));

R.exceptions = consoleLog.filter(l => l.type === 'EXCEPTION').map(l => l.text.slice(0, 200));
finish(R, proc);
