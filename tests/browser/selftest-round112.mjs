// Round 112 (audit loop) test-change gate fixtures: the five honesty fixes
// approved by Andrew 2026-11-05 (CG-112-01/02/05/03/04). Judging logic proven
// in plain Node BEFORE CI, per docs/TESTING.md. Method (round-103/112
// adjudication style): the shipped functions AND the shipped caller lines
// are extracted VERBATIM from parts/ and composed against stubs - the test
// exercises the actual lines in the tree, so reverting a fix turns it red.
import { readFileSync } from 'node:fs';
const R = p => readFileSync(new URL('../../parts/' + p, import.meta.url), 'utf8');
const app1 = R('app1.js'), app2 = R('app2.js'), app3 = R('app3.js'), app4 = R('app4.js');
function extract(src, startMarker, endMarker, label) {
  const a = src.indexOf(startMarker); if (a < 0) throw new Error('start not found: ' + label);
  const b = src.indexOf(endMarker, a); if (b < 0) throw new Error('end not found: ' + label);
  return src.slice(a, b);
}
function lineOf(src, marker, label) {
  const l = src.split('\n').find(x => x.includes(marker));
  if (!l) throw new Error('line not found: ' + label);
  return l;
}
let pass = 0, fail = 0;
const t = (name, cond) => { if (cond) pass++; else { fail++; console.log('FAIL', name); } };

// ---------- CG-112-01: the same-street note flush must read .ok ----------
// renderStreets' declaration + flush lines and the rebuilt-editor hint line
// are extracted verbatim from app2.js; setNoteText is verbatim from app3.js.
{
  const setNoteText = extract(app3, 'function setNoteText(n, txt) {', 'function flagText', 'setNoteText');
  const declLine = lineOf(app2, 'let noteFlushed = false', 'noteFlushed declaration');
  const flushLine = lineOf(app2, 'draftFor === noteOpenFor && noteSaveTimer', 'note flush line');
  const hintLine = lineOf(app2, "hint.textContent = 'Saved", 'rebuilt-editor hint line');
  const runFlush = (saveOk) => {
    const fn = new Function('notes', 'saveAllWarned', setNoteText + '; return setNoteText;')({},
      () => saveOk ? { ok: true, failedKey: null, retryPending: false } : { ok: false, failedKey: 'snowroute.5w.v2', retryPending: true });
    const hint = { textContent: 'Saves automatically' };
    const snippet = [
      "const draft = 'car at #12', draftFor = 'Velmar', noteOpenFor = 'Velmar', n = 'Velmar';",
      'let noteSaveTimer = 99;',
      'const ed = { querySelector: () => __hint };',
      declLine, flushLine, hintLine,
      'return __hint.textContent;'
    ].join('\n');
    return new Function('setNoteText', '__hint', snippet)(fn, hint);
  };
  t('01 failed flush -> rebuilt editor says Not saved — storage problem', runFlush(false) === 'Not saved — storage problem');
  t('01 successful flush -> rebuilt editor says Saved ✓ (control)', runFlush(true) === 'Saved ✓');
}

// ---------- CG-112-02: Delete maps must verify before announcing ----------
// The stDel handler body is extracted verbatim from app4.js and run against
// cache stubs: rejecting / true / false-with-cache-absent / false-but-present.
{
  const body = extract(app4, "$('stDel').addEventListener('click', async () => {", '// ---- About / What\'s new ----', 'stDel handler');
  const runStDel = async (del, has) => {
    const toasts = [], dels = [];
    let handler = null;
    const $ = () => ({ addEventListener: (ev, fn) => { handler = fn; } });
    const cachesStub = { delete: del, has: async () => has };
    new Function('$', 'caches', 'window', 'lsDel', 'toast', 'renderStatus', 'tapGuard', 'preloadRunning', 'PACKMIG_KEY', 'LS', 'ROUTE_PACKS', 'routeKeys',
      body)($, cachesStub, { caches: cachesStub }, k => { dels.push(k); return true; }, m => toasts.push(m), () => {}, () => true, false,
      'snowroute.v5.packmig', { pre: 'snowroute.5w.v5.preload' }, [{ id: '5w' }], id => ({ pre: 'snowroute.' + id + '.v5.preload' })); // Beta 1.117: the handler now clears EVERY pack's preload record (one shipped pack -> the same 2 deletes: the flag + the 5W record)
    await handler();
    return { toasts, dels };
  };
  const rejecting = await runStDel(async () => { throw new Error('delete rejected'); }, true);
  t('02 rejecting delete -> NO success toast, metadata kept, failure reported',
    !rejecting.toasts.includes('Offline maps deleted') && rejecting.dels.length === 0 && rejecting.toasts.length >= 1);
  const stillThere = await runStDel(async () => false, true);
  t('02 delete false + cache still present -> NO success toast, metadata kept',
    !stillThere.toasts.includes('Offline maps deleted') && stillThere.dels.length === 0 && stillThere.toasts.length >= 1);
  const goneTrue = await runStDel(async () => true, true);
  t('02 delete true -> success toast + metadata cleared (control)',
    goneTrue.toasts.includes('Offline maps deleted') && goneTrue.dels.length === 2);
  const goneAbsent = await runStDel(async () => false, false);
  t('02 delete false + cache verifiably absent -> success path (control)',
    goneAbsent.toasts.includes('Offline maps deleted') && goneAbsent.dels.length === 2);
}

// ---------- CG-112-05: nudge dismissal must MERGE, not replace, LS.exp ----------
// noteExported + bakAgeText verbatim from app4.js; the two nudge handler
// lines verbatim from app3.js.
{
  const noteExp = extract(app4, 'function noteExported() {', 'async function shareBackup()', 'noteExported');
  const age = extract(app4, 'function bakAgeText() {', 'function renderBakAge()', 'bakAgeText');
  const laterLine = lineOf(app3, "$('bakLater').addEventListener", 'bakLater line');
  const saveLine = lineOf(app3, "$('bakSave').addEventListener", 'bakSave line');
  const runNudge = (which) => {
    const store = new Map();
    const lsGet = k => store.has(k) ? store.get(k) : null;
    const lsSet = (k, v) => { store.set(k, String(v)); return true; };
    const parseJ = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } };
    const LS = { exp: 'snowroute.v5.export' };
    const handlers = {};
    const $ = id => ({ addEventListener: (ev, fn) => { handlers[id] = fn; }, classList: { add: () => {}, remove: () => {} } });
    const api = new Function('lsGet', 'lsSet', 'parseJ', 'LS', '$', 'openExport', 'downloadBackup',
      [noteExp, age, laterLine, saveLine, 'return { noteExported, bakAgeText };'].join('\n'))(
      lsGet, lsSet, parseJ, LS, $, () => {}, () => {});
    api.noteExported(); // a successful backup just happened
    const before = api.bakAgeText();
    handlers[which](); // captured by the $ stub's own closure
    const rec = JSON.parse(store.get(LS.exp) || '{}');
    return { before, after: api.bakAgeText(), rec };
  };
  const later = runNudge('bakLater');
  t('05 export -> Later: exportedAt survives, nudgedAt recorded, age still today',
    later.before === 'today' && later.after === 'today' && typeof later.rec.exportedAt === 'number' && typeof later.rec.nudgedAt === 'number');
  const save = runNudge('bakSave');
  t('05 export -> Save: exportedAt survives, nudgedAt recorded, age still today',
    save.before === 'today' && save.after === 'today' && typeof save.rec.exportedAt === 'number' && typeof save.rec.nudgedAt === 'number');
}

// ---------- CG-112-03: settings handlers must honour saveSettings() ----------
// loadSettings/saveSettings verbatim from app1.js; renderSwitch verbatim from
// app4.js; the three persistent-setting handler lines verbatim from app4.js.
{
  const region = extract(app1, 'function loadSettings() {', '// Tap guard', 'settings region');
  const renderSwitch = extract(app4, 'function renderSwitch(el, on) {', '// ---- On the job ----', 'renderSwitch');
  const vibLine = lineOf(app4, "$('swVib').addEventListener('click'", 'swVib line');
  const chimeLine = lineOf(app4, "$('swChime').addEventListener('click'", 'swChime line');
  const rowLine = app4.split('\n').find(x => x.includes('row.addEventListener') && x.includes('chimeSound'));
  if (!rowLine) throw new Error('line not found: chime row line');
  const env = (writesOk) => {
    const store = new Map();
    const lsGet = k => store.has(k) ? store.get(k) : null;
    const lsSet = (k, v) => { if (!writesOk) return false; store.set(k, String(v)); return true; };
    const parseJ = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } };
    const els = {}, handlers = {}, toasts = [], plays = [];
    const $ = id => els[id] || (els[id] = { __on: null, classList: { toggle: (cls, on) => { els[id].__on = on; } }, setAttribute: () => {}, addEventListener: (ev, fn) => { handlers[id] = fn; } });
    const row = { addEventListener: (ev, fn) => { handlers.__row = fn; } };
    const body = [region, renderSwitch, vibLine, chimeLine,
      "const row = __row; const key = 'rising';", rowLine,
      'return { settings };'].join('\n');
    const api = new Function('lsGet', 'lsSet', 'parseJ', 'SETTINGS_KEY', 'SETTINGS_DEF', 'CHIME_KEYS', '$', 'toast', 'renderChime', 'renderJob', 'playChime', 'navigator', '__row',
      body)(lsGet, lsSet, parseJ, 'snowroute.v2.settings', { vib: false, chime: false, chimeSound: 'two' },
      ['bell', 'two', 'rising', 'pop', 'melody'], $, m => toasts.push(m), () => {}, () => {}, k => plays.push(k), {}, row);
    return { api, els, toasts, plays, store, handlers };
  };
  const bad = env(false);
  bad.handlers.swVib();
  t('03 writes blocked: vib flip reverts (value + switch) and warns', bad.api.settings.vib === false && bad.els.swVib.__on === false && bad.toasts.length >= 1);
  bad.handlers.swChime();
  t('03 writes blocked: chime flip reverts (value + switch) and warns', bad.api.settings.chime === false && bad.els.swChime.__on === false && bad.toasts.length >= 2);
  bad.handlers.__row();
  t('03 writes blocked: sound pick reverts to Two-Tone, warns, no preview of an unsaved pick',
    bad.api.settings.chimeSound === 'two' && bad.toasts.length >= 3 && bad.plays.length === 0);
  const good = env(true);
  good.handlers.swVib();
  const rec = JSON.parse(good.store.get('snowroute.v2.settings') || '{}');
  t('03 writes OK: vib flip persists, switch on, no warning (control)', good.api.settings.vib === true && rec.vib === true && good.els.swVib.__on === true && good.toasts.length === 0);
  good.handlers.__row();
  t('03 writes OK: sound pick persists and previews (control)', good.api.settings.chimeSound === 'rising' && good.plays.length === 1);
  good.handlers.swChime();
  t('03 writes OK: chime flip persists (control)', good.api.settings.chime === true);
}

// ---------- CG-112-04: syncWake must recompute want after the await ----------
// syncWake verbatim from app3.js, driven with a deferred wakeLock.request.
{
  const syncWake = extract(app3, 'async function syncWake() {', "document.addEventListener('visibilitychange', syncWake);", 'syncWake');
  const wakeEnv = () => {
    let resolveReq = null, releaseCalls = 0;
    const fakeLock = { addEventListener: () => {}, release: () => { releaseCalls++; } };
    const navigatorStub = { wakeLock: { request: () => new Promise(res => { resolveReq = () => res(fakeLock); }) } };
    const settingsObj = { awake: true };
    const api = new Function('navigator', 'document', 'settings',
      'let wakeLock = null; let runStart = 1000;\n' + syncWake +
      '\nreturn { syncWake, setRun: t => { runStart = t; }, held: () => wakeLock !== null };')(
      navigatorStub, { visibilityState: 'visible' }, settingsObj);
    return { api, settingsObj, resolve: () => resolveReq(), releases: () => releaseCalls };
  };
  { // toggle OFF during the pending request
    const w = wakeEnv();
    const p = w.api.syncWake();
    w.settingsObj.awake = false;
    await w.api.syncWake();
    w.resolve(); await p;
    t('04 toggle OFF during pending request -> lock released on arrival, none held', w.api.held() === false && w.releases() === 1);
  }
  { // run finishes during the pending request
    const w = wakeEnv();
    const p = w.api.syncWake();
    w.api.setRun(0);
    await w.api.syncWake();
    w.resolve(); await p;
    t('04 finish during pending request -> lock released on arrival, none held', w.api.held() === false && w.releases() === 1);
  }
  { // still wanted at resolution -> held; a later unwanted state releases it
    const w = wakeEnv();
    const p = w.api.syncWake();
    w.resolve(); await p;
    const heldOk = w.api.held() === true && w.releases() === 0;
    w.api.setRun(0);
    await w.api.syncWake();
    t('04 still wanted -> held (control); run end releases it (control)', heldOk && w.api.held() === false && w.releases() === 1);
  }
}

console.log('selftest-round112: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
