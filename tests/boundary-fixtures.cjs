'use strict';
const assert = require('node:assert/strict');
const ts = require('../scripts/node_modules/typescript');
const scan = require('../scripts/scan-boundaries.cjs');
const owners = require('../scripts/parts-boundary-owners.json');

let passed = 0;
function eq(actual, expected) { assert.equal(actual, expected); passed++; }
function deep(actual, expected) { assert.deepEqual(actual, expected); passed++; }
function match(text, pattern) { assert.match(text, pattern); passed++; }

function check(source, file, baseline = [], exemptions = []) {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  return scan(tree, file, { ...owners, exemptions }, baseline);
}

const file = 'parts/app3.js';
const sceneWrite = "document.body.classList.add('snow-scene')";
eq(check(sceneWrite, file).length, 1);
eq(check(sceneWrite, 'parts/brand-snow.js').length, 0);
eq(check("document.body.classList.contains('snow-scene')", file).length, 0);
eq(check("document.body.classList.toggle('other', 'snow-scene')", file).length, 0);

const site = { state: 'snow-scene', file, fn: 'paint', occ: 1 };
const source = `\nfunction paint() { ${sceneWrite}; ${sceneWrite}; }`;
deep(check(source, file, [site]).map(hit => hit.status), ['KNOWN', 'NEW']);
const exemption = { ...site, occ: 2, name: 'temporary-preview', why: 'Preview has a separate exit path.' };
const reports = check(source, file, [site], [exemption]);
deep(reports.map(hit => hit.status), ['KNOWN', 'EXEMPT']);
match(reports[1].message, /temporary-preview: Preview has a separate exit path\./);
deep(check(source, file, [site], [{ ...exemption, why: ' ' }]).map(hit => hit.status), ['KNOWN', 'NEW']);

// Enforcement: only a NEW write to an enforce-marked state is flagged
// enforced; baselined and owner-side writes are not.
eq(check(sceneWrite, file)[0].enforced, true);
eq(check(source, file, [site])[0].enforced, false);
const loose = {
  ...owners,
  states: owners.states.map(s => s.id === 'snow-scene' ? { ...s, enforce: false } : s),
};
const looseTree = ts.createSourceFile(file, sceneWrite, ts.ScriptTarget.Latest, true);
eq(scan(looseTree, file, loose, [])[0].enforced, false);

console.log(`boundary fixtures: ${passed} passed`);
