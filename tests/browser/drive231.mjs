import { launchDrive, finish, bootThrough } from './harness.mjs';

// drive231: the sheets are fully opaque in both themes;
// the tab bar keeps its frost (Andrew's scope pick).

const { proc, ev, poll, sleep } = await launchDrive();
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`);
  return typeof raw === 'string' ? JSON.parse(raw) : {}; };

const face = (id) => J(`(() => {
  const cs = getComputedStyle(document.getElementById(${JSON.stringify(id)}));
  const m = /rgba?\\(([^)]+)\\)/.exec(cs.backgroundColor);
  const parts = m ? m[1].split(',').map((s) => parseFloat(s)) : [];
  return { rgb: parts.slice(0, 3), alpha: parts.length > 3 ? parts[3] : 1,
    filter: cs.backdropFilter, webkitFilter: cs.webkitBackdropFilter };
})()`);
const noFilter = (f) => f.filter === 'none' && (f.webkitFilter === 'none' || f.webkitFilter === undefined || f.webkitFilter === '');
const solidHue = (f, rgb) => f.alpha === 1 && f.rgb.length === 3 && f.rgb.every((v, i) => v === rgb[i]);

const themeChecks = async (theme, sheetRgb, barAlpha) => {
  await ev(`closeSheets()`);
  await poll(`!document.getElementById('sheet').classList.contains('open') && !document.getElementById('pacePanel').classList.contains('open')`, 5000);
  await sleep(600);
  await ev(`document.getElementById('streetsBtn').click()`);
  ok(`${theme} Streets sheet opens`, await poll(`document.getElementById('sheet').classList.contains('open')`, 5000));
  const street = await face('sheet');
  ok(`${theme} Streets sheet background is fully opaque`, solidHue(street, sheetRgb));
  ok(`${theme} Streets sheet has no backdrop filter`, noFilter(street));
  const dragging = await J(`(() => {
    const el = document.getElementById('sheet');
    el.classList.add('dragging');
    const cs = getComputedStyle(el);
    const m = /rgba?\\(([^)]+)\\)/.exec(cs.backgroundColor);
    const parts = m ? m[1].split(',').map((s) => parseFloat(s)) : [];
    const out = { alpha: parts.length > 3 ? parts[3] : 1, filter: cs.backdropFilter };
    el.classList.remove('dragging');
    return out;
  })()`);
  ok(`${theme} dragging sheet background stays fully opaque`, dragging.alpha === 1);
  ok(`${theme} dragging sheet has no backdrop filter`, dragging.filter === 'none');
  await ev(`openPace()`);
  ok(`${theme} Pace sheet opens`, await poll(`document.getElementById('pacePanel').classList.contains('open')`, 5000));
  const pace = await face('pacePanel');
  ok(`${theme} Pace sheet background is fully opaque`, solidHue(pace, sheetRgb));
  ok(`${theme} Pace sheet has no backdrop filter`, noFilter(pace));
  const bar = await face('tabBar');
  ok(`${theme} tab bar background stays translucent`, Math.abs(bar.alpha - barAlpha) < 0.005);
  ok(`${theme} tab bar keeps its backdrop blur`, typeof bar.filter === 'string' && bar.filter.includes('blur'));
};

await bootThrough(ev, poll);
await themeChecks('day', [255, 255, 255], 0.92);

await ev(`setThemeOverride(true); applyNight()`);
ok('night theme applies', await poll(`document.body.classList.contains('night')`, 5000));
await sleep(200);
await themeChecks('night', [32, 33, 37], 0.94);
await ev(`clearThemeOverride()`);

finish(R, proc);
