// proof-1299.mjs - openClean characterization: saved-clean
// display and deletion timing, pinned before its split.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { extractFn } from '../browser/extract-fn.mjs';

const app3 = readFileSync(new URL('../../parts/app3.js', import.meta.url), 'utf8');
function element() {
  const classes = new Set(['hidden']), selectors = new Map();
  return {
    children: [], style: {}, scrollTop: 42,
    classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) },
    set innerHTML(html) { this.html = html; this.children.length = 0; selectors.clear(); },
    appendChild(child) { this.children.push(child); },
    querySelector(selector) {
      if (!this.html.includes(selector.slice(1))) return null;
      if (!selectors.has(selector)) selectors.set(selector, element());
      return selectors.get(selector);
    },
    insertBefore(child, sibling) {
      if (sibling !== this.querySelector('.cvTm')) throw new Error('unexpected insertion point');
      this.inserted = child;
    },
  };
}
const nodes = Object.fromEntries(['paceHead', 'pacePad', 'cleanView', 'pacePanel'].map(id => [id, element()]));
const events = [], timers = new Map();
let serial = 0, saveResult = true;
const at = '2025-12-01T00:00:00.000Z';
const stamp = Date.parse(at);
const h = { at, km: 2, startedAt: at, pathShortened: true };
const noTrail = { at };
const street = { at, tMs: stamp, gapMs: 20, spanMs: 0, stamps: [stamp], noteLines: [] };
const detail = {
  count: 3, dur: { durMs: 20 }, workM: 4000, paceKm: '3m', elapsedMs: 50, paceRate: 4,
  streets: [
    { ...street, name: 'A', spanMs: 10, stamps: [stamp, stamp + 10], noteLines: ['first', 'second'], via: 'gps' },
    { ...street, name: 'B', via: 'tap' },
    { ...street, name: 'C', at: null, tMs: NaN, stamps: [] },
  ],
  notedOnly: [{ name: 'D', primary: true, noteLines: ['pending'] }, { name: 'E', primary: false, noteLines: ['other'] }],
};
const backToCleans = () => events.push('back');
const context = vm.createContext({
  history: [noTrail, h], cleanIdx: -1, cleanDelArmed: true, cleanDelArmedAt: 42, cleanDelTimer: null,
  $: id => nodes[id], document: { createElement: element },
  CLEAN: { detail: clean => {
    events.push(clean === h ? 'detail:1' : 'detail:0');
    return clean === h ? detail : { count: 0, workM: 0, streets: [], notedOnly: [] };
  } },
  HIST: { deleteAt: i => events.push('delete:' + i), save: () => { events.push('save'); return saveResult; } },
  SHEETS: { open: (panel, anchor, inside) => { if (panel === nodes.pacePanel && anchor === null && inside === true) events.push('open'); } },
  backToCleans, deselect: () => events.push('deselect'),
  showBanner: (title, body) => events.push(title + ' / ' + body), updateCount: () => events.push('count'),
  setTimeout: (fn, ms) => { timers.set(++serial, { fn, ms }); return serial; },
  clearTimeout: id => timers.delete(id),
  fmtDate3: value => value, fmtClock: date => String(date.getTime()), fmtHM: ms => ms + 'ms',
  fmtDur: ms => ms + 'ms', fmtRate: rate => String(rate), fmtWhen: value => value,
  statCell: (icon, value, label) => '[' + icon + '/' + value + '/' + label + ']',
  ICONS: { note: 'note icon' },
});
const open = vm.runInContext(app3.match(/^const CLEAN_DEL_MIN_ARM_MS = [^;]+;/m)[0] + '\n' +
  extractFn(app3, 'function renderCleanSummary(') + '\n' + extractFn(app3, 'function renderCleanStreetRows(') + '\n' +
  extractFn(app3, 'function renderCleanNotedOnlyRows(') + '\n' + extractFn(app3, 'function createCleanDeleteControl(') + '\n' +
  extractFn(app3, 'function openClean(') + '\nopenClean', context);
let pass = 0, fail = 0;
const check = (name, cond) => { if (cond === true) pass++; else { fail++; console.log('FAIL:', name); } };
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const view = nodes.cleanView;

open(9);
check('missing index changes neither selection nor sheet', !events.length && context.cleanIdx === -1 && view.scrollTop === 42);
open(1);
const [head, stats, meta, section, rowA, rowB, rowC, notesHeading, rowD, rowE, del] = view.children;
check('valid index disarms old confirmation and seats detail in Pace after deselection',
  equal(events, ['deselect', 'detail:1', 'open']) && context.cleanIdx === 1 && context.cleanDelArmed === false &&
  Number.isNaN(context.cleanDelArmedAt) && nodes.paceHead.style.display === 'none' && nodes.pacePad.style.display === 'none' &&
  !view.classList.contains('hidden') && view.style.display === '' && view.scrollTop === 0);
check('header, stats, and meta use the selected clean and its two intervals',
  head.querySelector('.cvTtl').textContent === at && head.querySelector('.cvBack').onclick === backToCleans &&
  stats.html === '[clock/20ms/STREETS DONE IN][road/2.0 km/ROAD CLEARED][gauge/3m /km/PACE][trail/2.0 km/GPS TRAIL]' &&
  meta.textContent.includes('Streets done in 20ms · Total elapsed 50ms') && meta.textContent.includes('saved GPS path shortened') &&
  section.textContent === 'Streets');
check('street rows distinguish side span, one moment, and GPS or tap versus an unstamped gap',
  rowA.children[0].querySelector('.cvTm').textContent.includes('span 10ms') &&
  rowA.children.at(-1).textContent.includes('How: GPS suggestion') &&
  rowB.children[0].querySelector('.cvTm').textContent.includes('marked in one go') &&
  rowB.children.at(-1).textContent.includes('How: marked by tap') &&
  rowC.children[0].querySelector('.cvTm').textContent === '– · gap 20ms');
const expanded = rowA.children.at(-1);
const initiallyHidden = expanded.style.display === 'none';
rowA.onclick();
const shown = expanded.style.display === '';
rowA.onclick();
check('saved note icon, preview and read-only row toggle retain both lines',
  rowA.children[0].inserted.html === 'note icon' && rowA.children[1].textContent === 'first (+1 more)' &&
  expanded.textContent.endsWith('first\nsecond') && initiallyHidden && shown && expanded.style.display === 'none');
check('noted-only section displays pending-group colors and lines',
  notesHeading.textContent === 'Notes on streets not cleaned' && rowD.children[0].html.includes('dot-gold') &&
  rowE.children[0].html.includes('dot-rose') && rowD.children[1].textContent === 'pending');

events.length = 0;
del.onclick({ timeStamp: 1000 });
del.onclick({ timeStamp: NaN });
del.onclick({ timeStamp: 1699 });
check('first tap arms for five seconds; invalid and 699ms taps cannot confirm',
  !events.length && del.classList.contains('armed') && del.textContent === 'Tap again to confirm delete' &&
  timers.get(context.cleanDelTimer)?.ms === 5000);
del.onclick({ timeStamp: 1700 });
check('700ms confirms in delete, save, back, count order and cancels the timer',
  equal(events, ['delete:1', 'save', 'back', 'count']) && !timers.size);

delete nodes.paceHead;
delete nodes.pacePad;
open(0);
const emptyDelete = view.children.at(-1);
check('empty detail replaces old rows and uses missing-stat placeholders',
  view.children.length === 5 && view.children[1].html ===
  '[clock/–/STREETS DONE IN][road/0.0 km/ROAD CLEARED][gauge/–/PACE][trail/–/GPS TRAIL]');
events.length = 0;
emptyDelete.onclick({});
const invalidArm = timers.get(context.cleanDelTimer);
emptyDelete.onclick({ timeStamp: 10000 });
timers.delete(context.cleanDelTimer);
invalidArm.fn();
check('missing arm timestamp cannot confirm and timeout restores the button',
  !events.length && !context.cleanDelArmed && Number.isNaN(context.cleanDelArmedAt) &&
  !emptyDelete.classList.contains('armed') && emptyDelete.textContent === 'Delete this clean');

saveResult = false;
emptyDelete.onclick({ timeStamp: 10000 });
emptyDelete.onclick({ timeStamp: 10700 });
check('failed save still returns to the list and reports possible reappearance before recount',
  equal(events, ['delete:0', 'save', 'back', 'Delete not saved / The clean may come back on reload', 'count']));

console.log(`proof-open-clean: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
