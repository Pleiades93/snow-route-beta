import { launchDrive, finish, bootThrough } from './harness.mjs';
const { proc, send, S, ev, consoleLog, sleep, poll } = await launchDrive();
await bootThrough(ev, poll);
if (!await poll(`!!(window.map && map.getSource && map.getSource('centres'))`, 45000)) throw new Error('drive216: the GL stack never landed - the sampler would measure an empty map and pass vacuously');

// drive216: Beta 1.263 - PRESENCE DURING SETTLE, the flicker's standing
// regression drive. Andrew's report of 2026-11-21: the street names
// blinked off and on at first load and again while moving the map. The
// diagnosis (label-flicker-2026-11-21/RECORD.md) found the mechanism:
// the 1.261 standing heal (armTitleHeal) rebuilt the labelpts source
// after EVERY camera settle, and until the worker re-parsed, all 33
// route titles vanished (~100-200 ms unthrottled, seconds under CPU
// throttle). The 1.261 gate proved placement, never presence - no check
// watched the titles DURING a settle. This drive does: an in-page
// sampler records the placed title set every 50 ms while scripted
// gestures run (pan, zoom through 15, rotate, theme swap, home), and a
// name counts as DROPPED if it is placed before AND after a gesture but
// absent from any sample during it. The pick/load phase is NOT graded -
// the restored system's one re-place after the pick flight (the 1.248
// hook) is the old behaviour Andrew chose back, not a flicker; grading
// starts once the boot placement is stable. A second pass repeats the
// pan and zoom under 6x CPU throttling, where the heal's blackout
// stretched to seconds. On the 1.262 tree every movement phase drops
// titles and this drive fails; on the reverted tree (no teardown
// anywhere in the naming system) no phase drops any.
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };

const TITLE_LAYERS = ['streetnamespt1', 'streetnamespt2', 'streetnamespt3', 'streetnamespt4'];

// ---------- the sampler ----------
await ev(`(() => {
  window.__pres = { samples: [], marks: [] };
  const layers = ${JSON.stringify(TITLE_LAYERS)}.filter(id => map.getLayer(id));
  window.__presTimer = setInterval(() => {
    try {
      const seen = new Set();
      for (const f of map.queryRenderedFeatures({ layers })) { const nm = f.properties && f.properties.name; if (nm) seen.add(nm); }
      window.__pres.samples.push([...seen]);
    } catch (e) {}
  }, 50);
  return true;
})()`);
const mark = async (name) => { await ev(`(() => { window.__pres.marks.push({ name: '${name}', at: window.__pres.samples.length }); return true; })()`); };
const settle = async () => { await poll(`!!(window.map && map.loaded() && !map.isMoving())`, 30000); await sleep(1600); }; // the observation window runs past the settle on purpose: the heal's blackout landed AT the settle (its rebuild fired at idle), so the samples that convict it are the post-settle ones; the gesture's own frames can starve the 50 ms sampler under render load
const phaseReport = async (fromMark, toMark) => J(`(() => {
  const P = window.__pres;
  const a = P.marks.find(m => m.name === '${fromMark}').at, b = P.marks.find(m => m.name === '${toMark}').at;
  const win = P.samples.slice(a, b + 1);
  const before = new Set(win[0] || []), after = new Set(win[win.length - 1] || []);
  const both = [...before].filter(n => after.has(n));
  const dropped = both.filter(n => win.some(sm => !sm.includes(n)));
  return { samples: win.length, before: before.size, after: after.size, dropped };
})()`);

// ---------- baseline: the boot placement, stable ----------
await settle();
await sleep(3000); // the pick flight's one re-place (and its 2.5 s backstop) land inside this window - grading starts after it
const stableBase = await poll(`(() => { const P = window.__pres; if (P.samples.length < 20) return false; const last = JSON.stringify([...P.samples[P.samples.length - 1]].sort()); return P.samples.slice(-6).every(sm => JSON.stringify([...sm].sort()) === last) && P.samples[P.samples.length - 1].length >= 30; })()`, 60000);
const baseCount = await J(`(() => window.__pres.samples[window.__pres.samples.length - 1].length)()`);
ok('P1 the boot placement settles stable with the old system\'s home character: ' + baseCount + ' titles placed (33 of 34 expected - Tina Place is the known absentee), stable across 6 consecutive samples (stability poll: ' + stableBase + ')',
  stableBase === true && baseCount >= 30);

// ---------- gesture phases (unthrottled) ----------
await mark('pan0');
await ev(`(() => { map.panBy([140, 60], { duration: 800 }); return true; })()`);
await settle(); await mark('pan1');
const pan = await phaseReport('pan0', 'pan1');
ok('P2 pan: no title drops during the gesture or its settle | samples ' + pan.samples + ', before ' + pan.before + ', after ' + pan.after + ', dropped: ' + JSON.stringify(pan.dropped),
  pan.samples > 5 && pan.dropped.length === 0);
await ev(`(() => { map.panBy([-140, -60], { duration: 800 }); return true; })()`);
await settle();

await mark('zoom0');
await ev(`(() => { map.zoomTo(15.7, { duration: 900 }); return true; })()`);
await settle(); await mark('zoom1');
const zoomUp = await phaseReport('zoom0', 'zoom1');
ok('P3 zoom through 15: no title drops | samples ' + zoomUp.samples + ', before ' + zoomUp.before + ', after ' + zoomUp.after + ', dropped: ' + JSON.stringify(zoomUp.dropped),
  zoomUp.samples > 5 && zoomUp.dropped.length === 0);
await mark('zoom2');
await ev(`(() => { map.zoomTo(13.98, { duration: 900 }); return true; })()`);
await settle(); await mark('zoom3');
const zoomDown = await phaseReport('zoom2', 'zoom3');
ok('P4 zoom back down through 15: no title drops | samples ' + zoomDown.samples + ', dropped: ' + JSON.stringify(zoomDown.dropped),
  zoomDown.samples > 5 && zoomDown.dropped.length === 0);

await mark('rot0');
await ev(`(() => { map.rotateTo(30, { duration: 800 }); return true; })()`);
await settle(); await mark('rot1');
const rot = await phaseReport('rot0', 'rot1');
ok('P5 rotate: no title drops | samples ' + rot.samples + ', dropped: ' + JSON.stringify(rot.dropped),
  rot.samples > 5 && rot.dropped.length === 0);
await ev(`(() => { map.jumpTo({ bearing: 0 }); return true; })()`);
await settle();

await mark('theme0');
await ev(`(() => { setThemeOverride(true); applyNight(); setBasemap(); return true; })()`);
await settle(); await sleep(1200); await mark('theme1');
const theme = await phaseReport('theme0', 'theme1');
ok('P6 theme swap to night: no title drops (a theme swap rebuilds the style, not the title source) | samples ' + theme.samples + ', dropped: ' + JSON.stringify(theme.dropped),
  theme.samples > 5 && theme.dropped.length === 0);
await ev(`(() => { setThemeOverride(false); applyNight(); setBasemap(); return true; })()`);
await settle();

// ---------- throttled pass (6x CPU): the heal's blackout stretched to seconds here ----------
await send('Emulation.setCPUThrottlingRate', { rate: 6 }, S);
await mark('tpan0');
await ev(`(() => { map.panBy([120, 40], { duration: 800 }); return true; })()`);
await settle(); await mark('tpan1');
const tpan = await phaseReport('tpan0', 'tpan1');
ok('P7 throttled (6x CPU) pan: no title drops | samples ' + tpan.samples + ', before ' + tpan.before + ', after ' + tpan.after + ', dropped: ' + JSON.stringify(tpan.dropped),
  tpan.samples > 5 && tpan.dropped.length === 0);
await mark('tzoom0');
await ev(`(() => { map.zoomTo(14.6, { duration: 900 }); return true; })()`);
await settle(); await mark('tzoom1');
const tzoom = await phaseReport('tzoom0', 'tzoom1');
ok('P8 throttled (6x CPU) zoom: no title drops | samples ' + tzoom.samples + ', dropped: ' + JSON.stringify(tzoom.dropped),
  tzoom.samples > 5 && tzoom.dropped.length === 0);
await send('Emulation.setCPUThrottlingRate', { rate: 1 }, S);
await ev(`(() => { goHomeView(); return true; })()`);
await settle();

// ---------- the count at the end matches the baseline's character ----------
const endCount = await J(`(() => window.__pres.samples[window.__pres.samples.length - 1].length)()`);
ok('P9 after the whole suite the home placement holds the same character: ' + endCount + ' titles placed (baseline ' + baseCount + ')',
  endCount >= 30);
await ev(`(() => { clearInterval(window.__presTimer); return true; })()`);

R.exceptions = consoleLog.filter(l => l.type === 'EXCEPTION').map(l => l.text.slice(0, 200));
finish(R, proc);
