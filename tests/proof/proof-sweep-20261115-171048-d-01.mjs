import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const src = readFileSync('parts/create-pick.js', 'utf8');

function extractFn(code, name) {
  const start = code.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('Missing function ' + name);
  let depth = 0, i = code.indexOf('{', start);
  for (; i < code.length; i++) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}') {
      depth--;
      if (depth === 0) return code.slice(start, i + 1);
    }
  }
  throw new Error('Unclosed function ' + name);
}

const snippet = [
  extractFn(src, 'crCityNameOf'),
  extractFn(src, 'crPickCity'),
  extractFn(src, 'crPackPickCity'),
  extractFn(src, 'askDiscard'),
].join('\n');

function makeSandbox() {
  const prompts = [];
  const newDraft = () => ({ roads: Object.create(null), primaries: new Set(), osmNames: Object.create(null), area: '', name: '' });
  const ctx = {
    crCityLookupSeq: 0,
    crCityLastCtl: null,
    crCity: null,
    crAreaGuess: '',
    draft: newDraft(),
    crPending: {},
    LS_GLOBAL: { lastArea: 'lastArea' },
    lsSet: () => {},
    crEnterPickFromCity: () => {},
    newDraft,
    draftStreets: () => (ctx.draft && ctx.draft.roads ? Object.keys(ctx.draft.roads) : []),
    crConfirm: (title, msg, cb, labels) => { prompts.push({ title, msg, cb, labels }); },
    prompts,
  };
  vm.createContext(ctx);
  vm.runInContext(snippet, ctx);
  return ctx;
}

let failures = 0;
function check(desc, fn) {
  try {
    fn();
    console.log('PASS:', desc);
  } catch (err) {
    failures++;
    console.error('FAIL:', desc, '-', err.message);
  }
}

const vaughan = { name: 'Vaughan', slug: 'vaughan', bbox: [43.75, -79.65, 43.90, -79.40] };
const markham = { name: 'Markham', slug: 'markham', bbox: [43.80, -79.40, 43.95, -79.20] };

check('First city pick via crPackPickCity preserves non-empty photo draft without prompting', () => {
  const ctx = makeSandbox();
  ctx.crCity = null;
  ctx.draft.roads['Main Street'] = [[[43.8, -79.5], [43.81, -79.51]]];
  ctx.crPackPickCity(vaughan);
  assert.equal(ctx.prompts.length, 0, 'expected no discard prompt on first city pick');
  assert.deepEqual(ctx.draftStreets(), ['Main Street'], 'photo draft streets should be preserved');
  assert.equal(ctx.draft.area, 'Vaughan', 'draft.area should be set to chosen city');
  assert.equal(ctx.crCity.name, 'Vaughan', 'crCity should be set');
});

check('Replacement city pick via crPackPickCity prompts once, preserves draft on cancel, and resets draft + crPending on confirm', () => {
  const ctx = makeSandbox();
  ctx.crCity = { name: 'Vaughan', lat: 43.82, lon: -79.52, bbox: { s: 43.75, n: 43.9, w: -79.65, e: -79.4 } };
  ctx.draft.area = 'Vaughan';
  ctx.draft.roads['Main Street'] = [[[43.8, -79.5], [43.81, -79.51]]];
  ctx.crPending['Pending Road'] = { osmName: 'Pending Road' };

  ctx.crPackPickCity(markham);
  assert.equal(ctx.prompts.length, 1, 'expected exactly one discard prompt when replacing city');
  assert.deepEqual(ctx.draftStreets(), ['Main Street'], 'draft must remain intact before confirming discard');
  assert.equal(ctx.crCity.name, 'Vaughan', 'crCity must remain Vaughan before confirming discard');

  ctx.prompts[0].cb();
  assert.equal(ctx.prompts.length, 1, 'must not double-prompt on confirm');
  assert.deepEqual(ctx.draftStreets(), [], 'draft must be reset after confirming discard');
  assert.deepEqual(Object.keys(ctx.crPending), [], 'crPending must be cleared when replacing city');
  assert.equal(ctx.crCity.name, 'Markham', 'crCity must update to Markham');
  assert.equal(ctx.draft.area, 'Markham', 'fresh draft.area must be Markham');
});

check('Replacement city pick via crPackPickCity with empty draft switches without prompting and clears crPending', () => {
  const ctx = makeSandbox();
  ctx.crCity = { name: 'Vaughan', lat: 43.82, lon: -79.52, bbox: null };
  ctx.crPending['Pending Road'] = { osmName: 'Pending Road' };
  ctx.crPackPickCity(markham);
  assert.equal(ctx.prompts.length, 0, 'expected no prompt when draft is empty');
  assert.equal(ctx.crCity.name, 'Markham');
  assert.deepEqual(Object.keys(ctx.crPending), [], 'crPending must be cleared');
});

process.exit(failures ? 1 : 0);
