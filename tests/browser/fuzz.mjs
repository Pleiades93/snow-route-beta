// Nightly fuzz: seeded random actions over the real app,
// checking the G-C invariants a walk can observe (docs/FUZZ.md).
import fs from 'node:fs/promises';
import path from 'node:path';
import { launchDrive, bootThrough } from './harness.mjs';

const args = process.argv.slice(2);
const option = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const replayFile = option('--replay');
const record = replayFile ? JSON.parse(await fs.readFile(replayFile, 'utf8')) : null;
const seed = record?.seed ?? Number(option('--seed', 1));
const budget = record?.stepBudget ?? Number(option('--steps', 100));
const work = option('--work', 'fuzz-out');
const deadline = record ? 0 : Number(option('--deadline', 600));
if (!Number.isSafeInteger(seed) || !Number.isSafeInteger(budget) || budget < 1) throw Error('Integer seed and positive step budget required');
if (!(deadline >= 0)) throw Error('Deadline must be zero or positive seconds');
let state = seed >>> 0;
function random() {
  let t = state += 0x6D2B79F5;
  t = Math.imul(t ^ t >>> 15, t | 1);
  t ^= t + Math.imul(t ^ t >>> 7, t | 61);
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}

const buttons = ['routesBtn', 'setBtn', 'rmClose', 'rmChoose', 'rmBack',
  'stBtn', 'jobBtn', 'aboutBtn', 'setBack', 'setClose', 'sheetClose', 'paceClose',
  'gpsBtn', 'homeBtn', 'streetsBtn', 'paceBtn', 'statusBack', 'jobBack', 'aboutBack', 'startBtn'];
const sheets = { streetsBtn: ['sheet', true], sheetClose: ['sheet', false],
  paceBtn: ['pacePanel', true], paceClose: ['pacePanel', false] };
export const alphabet = [...buttons, 'clearBtn', 'map-press', 'zoom-crossing', 'discard-cancel', 'finish-cancel'];

const crossing = 15.2;
const lowerZoom = 13.98;
const zoomTolerance = 0.01;
const loadedMap = '!!(window.map && map.loaded() && !map.isMoving())';
const routesUp = "($('routeMenu').classList.contains('open') || $('routeMenu').classList.contains('show'))";
const shown = id => `!document.getElementById(${JSON.stringify(id)}).classList.contains('hidden')`;
const sheetOpen = id => `document.getElementById(${JSON.stringify(id)}).classList.contains('open')`;
// Style facts for the label handover (L3, L8): layer presence
// plus the route-name inclusion / exclusion in each filter.
const styleFacts = `(() => {
  const names = JSON.stringify(ROUTE_TILE_NAMES);
  const has = (node, pred) => Array.isArray(node) && (pred(node) || node.some(x => has(x, pred)));
  const isIn = n => n[0] === 'in' && JSON.stringify(n[1]) === '["get","name"]' &&
    Array.isArray(n[2]) && n[2][0] === 'literal' && JSON.stringify(n[2][1]) === names;
  const isExcl = n => n[0] === '!' && isIn(n[1]);
  const facts = id => {
    const layer = map.getStyle().layers.find(x => x.id === id);
    if (!layer) return { present: false, incl: false, excl: false };
    return { present: true, incl: has(layer.filter, isIn), excl: has(layer.filter, isExcl) };
  };
  return { major: facts('roads_labels_major'), minor: facts('roads_labels_minor'),
    cloneMajor: facts('roads_labels_major-route'), cloneMinor: facts('roads_labels_minor-route') };
})()`;

let h;
const read = async expression => {
  const raw = await h.ev(`JSON.stringify(${expression})`);
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
};
const errors = () => h?.consoleLog.filter(e => e.type === 'EXCEPTION') ?? [];
function assert(name, expected, observed) {
  if (JSON.stringify(expected) !== JSON.stringify(observed)) {
    throw Object.assign(Error(name), { invariant: name, expected, observed });
  }
}
async function waitFor(name, expression) {
  assert(name, true, await h.poll(expression, 30000));
}
function pointFor(element) {
  return `(() => {
    const e = ${element};
    if (!e || e.disabled) return null;
    const r = e.getBoundingClientRect();
    const x = r.x + r.width / 2, y = r.y + r.height / 2;
    return r.width > 0 && r.height > 0 && e.contains(document.elementFromPoint(x, y)) ? { x, y } : null;
  })()`;
}
const buttonPoint = id => pointFor(`document.getElementById(${JSON.stringify(id)})`);
const mapPoint = pointFor('window.map && map.getCanvas()');
async function touch(point) {
  await h.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] }, h.S);
  await h.sleep(70);
  await h.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }, h.S);
}
async function press(id) {
  await waitFor(`hittable:${id}`, `!!${buttonPoint(id)}`);
  const point = await read(buttonPoint(id));
  assert(`touchTarget:${id}`, true, !!point);
  await touch(point);
}

async function cancelDialog(opener, modal, cancel) {
  await press(opener);
  await waitFor(`opened:${modal}`, shown(modal));
  await press(cancel);
  await waitFor(`closed:${modal}`, `!(${shown(modal)})`);
}

async function discardDraft() {
  await h.ev(`(() => {
    enterCreate('pick');
    const pack = ROUTE_PACKS.find(p => p.id === '5w');
    crAddStreet('Velmar', pack.roads.Velmar);
    return true;
  })()`);
  await waitFor('setup:discardFixture', `creating && draftStreets().includes('Velmar')`);
  await waitFor('L8', `!map.getLayer('roads_labels_major-route') && !map.getLayer('roads_labels_minor-route')`);
  const during = await read(styleFacts);
  assert('L8', { clones: false, exclusion: false },
    { clones: during.cloneMajor.present || during.cloneMinor.present,
      exclusion: during.major.excl || during.minor.excl });
  await cancelDialog('crExit', 'crModal', 'crModalNo');
  assert('discardCancelPreservesDraft', true, await h.ev(`creating && draftStreets().includes('Velmar')`));
  await h.ev(`exitCreate(); true`);
  await waitFor('L8', `!!map.getLayer('roads_labels_major-route') && !!map.getLayer('roads_labels_minor-route')`);
  const after = await read(styleFacts);
  assert('L8', { clones: true, exclusion: true },
    { clones: after.cloneMajor.present && after.cloneMinor.present,
      exclusion: after.major.excl && after.minor.excl });
}

async function runAction(action) {
  switch (action) {
    case 'map-press': {
      const point = await read(mapPoint);
      assert('mapTouchTarget', true, !!point);
      await touch(point);
      return;
    }
    case 'zoom-crossing': {
      const target = await h.ev(`map.getZoom() < ${crossing} ? 15.7 : ${lowerZoom}`);
      await h.ev(`map.zoomTo(${target}, { duration: 900 }); true`);
      await waitFor('zoomCrossingLanded', `${loadedMap} && Math.abs(map.getZoom() - ${target}) < ${zoomTolerance}`);
      return;
    }
    case 'clearBtn':
      return cancelDialog('clearBtn', 'confirmPill', 'cfKeep');
    case 'discard-cancel':
      return discardDraft();
    case 'finish-cancel':
      return cancelDialog('resetBtn', 'finModal', 'finNo');
    default: {
      await press(action);
      const sheet = sheets[action];
      if (sheet) {
        const [id, open] = sheet;
        await waitFor(`sheet:${action}`, `${sheetOpen(id)} === ${open}`);
      }
    }
  }
}

// The harness health set: execution-level assertions that are
// not G-C model invariants (page errors are the harness contract).
export const baseChecks = [
  async function pageErrors() { assert('pageErrors', [], errors()); },
  async function menuCoherence() {
    const menus = await read(`(() => {
      const entries = [[$('routeMenu'), ${routesUp}], [$('setMenu'), $('setMenu').classList.contains('open')]];
      const visible = e => {
        const r = e.getBoundingClientRect(), css = getComputedStyle(e);
        return css.visibility === 'visible' && Number(css.opacity) > 0 &&
          r.height > 0 && r.width > 0 && r.top < innerHeight && r.bottom > 0;
      };
      return entries.map(([e, up]) => {
        const panes = [...e.querySelectorAll('.rmPane')];
        return { id: e.id, up, visible: visible(e),
          active: panes.filter(p => p.classList.contains('on')).map(p => p.id),
          rendered: panes.filter(visible).map(p => p.id) };
      });
    })()`);
    assert('menuExclusive', true, menus.filter(m => m.up).length <= 1);
    for (const menu of menus) {
      assert(`menuVisibility:${menu.id}`, menu.up, menu.visible);
      assert(`menuPaneCount:${menu.id}`, 1, menu.active.length);
      assert(`menuRenderedPane:${menu.id}`, menu.up ? menu.active : [], menu.rendered);
    }
  },
  async function snowLiveness() {
    const sample = () => read(`(() => {
      const splash = $('splash');
      const routes = ${routesUp};
      return { running: window.__snow.running(), frames: window.__snow.frames(),
        blue: routes || $('setMenu').classList.contains('open') ||
          !!(splash && (splash.classList.contains('go') || splash.style.visibility !== 'hidden')) };
    })()`);
    const a = await sample();
    await h.sleep(150);
    const b = await sample();
    for (const s of [a, b]) assert('snowRunning', s.blue, s.running);
    assert('snowFrames', b.blue, b.frames > a.frames);
  }
];

let frameCache = null;
const frameRead = `(() => {
  if (!window.map || map.isMoving() || !map.getSource('centres')) return null;
  const features = ids => {
    const layers = ids.filter(id => map.getLayer(id));
    return layers.length ? map.queryRenderedFeatures({ layers }) : [];
  };
  const names = (ids, routeNames) => [...new Set(features(ids).map(f => f.properties.name)
    .filter(name => routeNames.includes(name)))].sort();
  return { zoom: map.getZoom(), loaded: map.loaded(),
    geometry: features(['t1-surface', 't1-band', 't1-fill', 'fade-surf-y', 'fade-surf-r',
      'fade-band-g', 'fade-fill-g']).length,
    titles: names(['streetnamespt1', 'streetnamespt2', 'streetnamespt3', 'streetnamespt4'], STREETNAMES),
    clones: names(['roads_labels_major-route', 'roads_labels_minor-route'], ROUTE_TILE_NAMES) };
})()`;
// The settle is a stability judge, not map.loaded() alone: a
// selection leaves loaded() false for good while idle still fires.
async function labelFrame() {
  if (frameCache) return frameCache;
  let last = null, stableSince = 0, stableReads = 0;
  const deadlineAt = Date.now() + 30000;
  while (Date.now() < deadlineAt) {
    const frame = await read(frameRead);
    if (frame) {
      const { loaded, ...rest } = frame;
      const sig = JSON.stringify(rest);
      if (sig === last) { stableReads++; }
      else { last = sig; stableSince = Date.now(); stableReads = 1; }
      if (stableReads >= 3 && (loaded || Date.now() - stableSince >= 2000)) {
        frameCache = rest;
        return frameCache;
      }
    } else { last = null; stableReads = 0; }
    await h.sleep(300);
  }
  assert('mapSettled', true, false);
}

// The G-C invariant registry (docs/STATE-MODELS.md): the plug-in
// point where model invariants a random walk can observe register.
export const invariants = [
  { id: 'L1', run: async () => {
      const { zoom, titles, clones } = await labelFrame();
      assert('L1', [], zoom < crossing ? clones : titles);
    } },
  { id: 'L2', run: async () => {
      const { zoom, geometry, titles, clones } = await labelFrame();
      if (geometry > 0 && zoom >= lowerZoom - zoomTolerance) {
        assert('L2', true, (zoom >= crossing ? clones : titles).length > 0);
      }
    } },
  { id: 'L4', run: async () => {
      const { titles, clones } = await labelFrame();
      const overlaps = titles.filter(title => clones.some(clone =>
        clone === title || clone.startsWith(title + ' ') || (title === 'Fifth' && clone === '5th Avenue')));
      assert('L4', [], overlaps);
    } },
  { id: 'L3', run: async () => {
      const facts = await read(styleFacts);
      assert('L3', { clones: true, inclusion: true, exclusion: true },
        { clones: facts.cloneMajor.present && facts.cloneMinor.present,
          inclusion: facts.cloneMajor.incl && facts.cloneMinor.incl,
          exclusion: facts.major.excl && facts.minor.excl });
    } },
  { id: 'F3', run: async () => {
      assert('F3', 1, await h.ev(`document.querySelectorAll('#banner').length`));
    } },
  { id: 'C1', run: async () => {
      const clean = await read(`({ run: runStart, saved: +localStorage.getItem(LS.start) || 0 })`);
      if (clean.run !== 0) assert('C1', clean.run, clean.saved);
    } }
];

async function availableActions() {
  return read(`(() => {
    const buttons = [
      ${buttons.map(id => {
        const sheet = sheets[id];
        const allowed = sheet ? ` && ${sheetOpen(sheet[0])} !== ${sheet[1]}` : '';
        return `[${JSON.stringify(id)}, !!${buttonPoint(id)}${allowed}]`;
      }).join(',\n')}
    ];
    const mapExposed = !!${mapPoint};
    return [...buttons,
      ['clearBtn', !!${buttonPoint('clearBtn')} && boardHasMarks()],
      ['map-press', mapExposed],
      ['zoom-crossing', mapExposed],
      ['discard-cancel', mapExposed && !creating && !${routesUp} && !$('setMenu').classList.contains('open')],
      ['finish-cancel', !!${buttonPoint('resetBtn')}]
    ].filter(([, enabled]) => enabled).map(([name]) => name);
  })()`);
}

const actions = [];
let index = -1;
let incomplete = false;
const startedAt = Date.now();
try {
  h = await launchDrive({ page: 'tracker-source.html' });
  await bootThrough(h.ev, h.poll);
  await waitFor('routePaintReady', `${loadedMap} && !!map.getSource('centres')`);
  await waitFor('routeFixture', `activeRoute.id === '5w' && pieces.Velmar.length > 0`);
  await h.ev(`togglePiece('Velmar', 0, 0); true`);
  await waitFor('clearFixture', `boardHasMarks()`);
  const total = record ? record.actions.length : budget;
  for (index = 0; index < total; index++) {
    if (deadline > 0 && Date.now() - startedAt > deadline * 1000) { incomplete = true; break; }
    frameCache = null;
    const available = await availableActions();
    const action = record ? record.actions[index] : available[Math.floor(random() * available.length)];
    actions.push(action ?? null);
    assert('actionAvailable', true, available.includes(action));
    await runAction(action);
    await h.sleep(900);
    frameCache = null;
    for (const check of baseChecks) await check();
    for (const invariant of invariants) await invariant.run();
  }
  if (!incomplete) {
    await fs.mkdir(work, { recursive: true });
    const file = path.join(work, `seed-${seed}-report.json`);
    await fs.writeFile(file, JSON.stringify({ seed, stepBudget: budget,
      stepsCompleted: actions.length, ok: true, actions }, null, 2));
    console.log(`fuzz: seed ${seed} clean, ${actions.length} steps, report ${file}`);
  }
} catch (error) {
  await fs.mkdir(work, { recursive: true });
  const file = path.join(work, `seed-${seed}-step-${index}.json`);
  await fs.writeFile(file, JSON.stringify({ seed, stepBudget: budget, actions,
    failingActionIndex: index, invariant: error.invariant ?? 'execution',
    expected: error.expected ?? 'successful execution', observed: error.observed ?? String(error), pageErrors: errors() }, null, 2));
  console.error(file);
  process.exitCode = 1;
} finally { h?.proc.kill('SIGKILL'); }
if (incomplete) {
  await fs.mkdir(work, { recursive: true });
  const file = path.join(work, `seed-${seed}-incomplete.json`);
  await fs.writeFile(file, JSON.stringify({ seed, stepBudget: budget,
    stepsCompleted: actions.length, reason: 'wall-clock deadline', actions }, null, 2));
  console.error(`fuzz: seed ${seed} incomplete at ${actions.length} steps (deadline), report ${file}`);
  process.exitCode = 3;
}
