import { launchDrive, finish, bootThrough } from './harness.mjs';
const { proc, ev, consoleLog, sleep, poll } = await launchDrive();
await bootThrough(ev, poll);

// drive173: Beta 1.150 (security-audit fix round, finding
// city-cache-restore-skips-way-validation) - the IndexedDB cache-restore
// fold (create-cache.js) installed stored ways with only array-shape
// checks, while every other pack/cache entry point cleans first
// (crIndexWays: non-empty name, finite in-range geometry, rounding,
// near-duplicate collapse). A corrupt or tampered cache record could plant
// geometry the extract never held, and the fold certified the cell's box
// and marked the cell done even when NONE of its ways were usable, so the
// cell was never fetched fresh. The fix cleans each stored triple with the
// extract's own rules and certifies a cell (box + done) only when at least
// one validated way actually came out of it. Fixture: cell 1 mixes one good
// way with four corrupt ones (out-of-range point, empty name, NaN point,
// single point) plus a junk entry; cell 2 holds only an out-of-range way.
// Unrestored cells are fetched against a failing street service, so an
// uncertified cell settles FAILED, never done.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };

try {
  await ev(`(async () => { await new Promise(res => { try { const rq = indexedDB.deleteDatabase('snowroute-citycache'); rq.onsuccess = () => res(); rq.onerror = () => res(); rq.onblocked = () => res(); } catch (e) { res(); } }); return true; })()`);
  // the street service fails every request in this drive: a cell the cache
  // does not certify must settle as failed, and the network never rescues it
  await ev(`(() => { const orig = window.fetch.bind(window);
    window.fetch = (url, opts) => { const u = String(url);
      if (u.indexOf('overpass') >= 0 || u.indexOf('nominatim') >= 0) return Promise.resolve(new Response('down', { status: 504 }));
      return orig(url, opts); }; return true; })()`);
  await ev(`openRouteMenu(); true`); await sleep(300);
  await ev(`document.getElementById('rmCreate').click(); true`); await sleep(300);
  await ev(`document.getElementById('crDoorManual').click(); true`); await sleep(300);
  // seed the poisoned cache record for the exact grid the pick will build
  const seeded = await J(`(() => { const bbox = { s: 43.700, n: 43.760, w: -79.610, e: -79.5105 };
    const cells = crGridCellsFor(bbox); if (cells.length < 2) return { err: 'grid too small: ' + cells.length };
    const rec = { cityName: 'Vaughan', bbox, savedAt: Date.now(), cells: {} };
    rec.cells[cells[0].key] = { at: Date.now(), ways: [
      [101, 'Good Street', [[43.71, -79.60], [43.711, -79.601]]],
      [102, 'Bad Point Street', [[43.71, -79.60], [999, 0]]],
      [103, '', [[43.71, -79.60], [43.72, -79.61]]],
      [104, 'NaN Street', [[43.71, -79.60], [NaN, -79.60]]],
      [105, 'Short Street', [[43.71, -79.60]]],
      'junk-entry' ] };
    rec.cells[cells[1].key] = { at: Date.now(), ways: [ [106, 'Out Street', [[999, 0], [1000, 10]]] ] };
    window.__d173cells = cells.map(c => ({ key: c.key, box: c.box }));
    return { keys: cells.map(c => c.key) }; })()`);
  ok('setup: grid derived and poisoned record staged (' + JSON.stringify(seeded) + ')', !!seeded.keys && seeded.keys.length >= 2);
  await ev(`(async () => { const bbox = { s: 43.700, n: 43.760, w: -79.610, e: -79.5105 }; const cells = crGridCellsFor(bbox);
    const rec = { cityName: 'Vaughan', bbox, savedAt: Date.now(), cells: {} };
    rec.cells[cells[0].key] = { at: Date.now(), ways: [
      [101, 'Good Street', [[43.71, -79.60], [43.711, -79.601]]],
      [102, 'Bad Point Street', [[43.71, -79.60], [999, 0]]],
      [103, '', [[43.71, -79.60], [43.72, -79.61]]],
      [104, 'NaN Street', [[43.71, -79.60], [NaN, -79.60]]],
      [105, 'Short Street', [[43.71, -79.60]]],
      'junk-entry' ] };
    rec.cells[cells[1].key] = { at: Date.now(), ways: [ [106, 'Out Street', [[999, 0], [1000, 10]]] ] };
    await crIdbPut(rec); return true; })()`);
  await ev(`crPickCity({ display_name: 'Vaughan, Ontario, Canada', lat: '43.73', lon: '-79.56', boundingbox: ['43.700', '43.760', '-79.610', '-79.5105'], class: 'place', type: 'city', address: { city: 'Vaughan', state: 'Ontario', country: 'Canada' } }); true`);
  const settled = await poll(`crGrid && crPrepState !== 'preparing' && crGrid.cells.every(c => c.state === 'done' || c.state === 'failed')`, 45000);
  ok('the preparation settles against the failing street service', settled === true);
  const st = await J(`({ byId: crCov ? Object.keys(crCov.byId).sort() : null,
    boxes: crCov ? crCov.boxes.map(b => JSON.stringify(b)) : null,
    cells: crGrid ? crGrid.cells.map(c => c.key + ':' + c.state) : null,
    prep: crPrepState, cellBoxes: window.__d173cells.map(c => JSON.stringify(c.box)) })`);
  ok('only the one valid way is installed from the poisoned cache (byId = ' + JSON.stringify(st.byId) + ')',
    !!st.byId && st.byId.join() === '101');
  ok('the mixed cell is certified (its box joins coverage) but the all-corrupt cell is NOT | cells = ' + JSON.stringify(st.cells),
    !!st.boxes && st.boxes.includes(st.cellBoxes[0]) && !st.boxes.includes(st.cellBoxes[1]));
  ok('the all-corrupt cell is left for a fresh fetch (settles failed against the down service), never marked done from cache',
    !!st.cells && st.cells[0].endsWith(':done') && st.cells[1].endsWith(':failed'));
} catch (e) {
  R.fatal = String(e && e.message || e);
}
R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String((c.args && c.args[0]) || c.text || '').slice(0, 220));
finish(R, proc);
