// proof-tapguard.mjs - Beta 1.284 (issue #170).
// THE TAP GUARD KEEPS THE TAP'S OWN TIME. Through Beta 1.283 tapGuard
// (parts/app1.js) read Date.now() when the click handler RAN. A tap
// queued behind a long first handler (the per-mark rebuild) was judged
// by handler time, not tap time: two physical taps 150 ms apart could
// land 400+ ms apart in handler time, pass the 400 ms guard, and the
// second tap toggled the mark back off. The guard now takes the click
// event and compares ev.timeStamp - the tap's own time, on the event
// clock - with no wall-clock fallback, and a stored timestamp of 0
// counts (the stored-check is !== undefined, not truthiness).
// Checks 1-2 pin the shape; check 3 runs the shipped guard verbatim
// against event-time sequences: the queued-tap sequence (two taps
// 150 ms apart in EVENT time, whenever their handlers run) must
// swallow the second tap - on the pre-fix guard the same sequence is
// judged on wall time and the 600 ms event gap is accepted, so
// checks 1-3 all fail there. The mutation receipt for this file
// lives in tests/mutation-receipts.json.
// Run from the repo root:  node tests/proof/proof-tapguard.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const app1 = read('parts/app1.js');
const others = ['app2', 'app3', 'app4', 'app5'].map(f => read('parts/' + f + '.js')).join('\n');

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };

// ---------- 1: the guard's shape ----------
const gAt = app1.indexOf('function tapGuard(');
const guardLine = gAt >= 0 ? app1.slice(gAt, app1.indexOf('\n', gAt)) : '';
check('1a: the guard extracted whole', guardLine.includes('function tapGuard(') && guardLine.includes('return true; }'));
check('1b: the guard takes the click event - tapGuard(key, ev)', guardLine.includes('function tapGuard(key, ev)'));
check('1c: the guard reads the event\'s own time and never the wall clock', guardLine.includes('ev.timeStamp') && !guardLine.includes('Date.now()'));
check('1d: a stored timestamp of 0 counts - the stored-check is !== undefined, not truthiness', guardLine.includes('tapLast[key] !== undefined'));

// ---------- 2: every call site passes its event ----------
const all = app1 + '\n' + others;
check('2a: 24 tapGuard occurrences in the parts (1 definition + 23 call sites)', (all.match(/tapGuard\(/g) || []).length === 24);
check('2b: no single-argument call survives - every site passes its event', !/tapGuard\('[^']*'( \+ [A-Za-z]+)?\)/.test(all));

// ---------- 3: the shipped guard, run verbatim on event-time sequences ----------
const seq = vm.runInNewContext('const tapLast = {};\n' + guardLine + '\n;({ tapGuard });', {}).tapGuard;
const run = (key, stamps) => stamps.map(ts => seq(key, { timeStamp: ts }));
check('3a: event-time gaps judge the taps - 1000 accepted, +150 swallowed, +600 accepted, +399 swallowed, +400 accepted',
  JSON.stringify(run('a', [1000, 1150, 1600, 1999, 2000])) === JSON.stringify([true, false, true, false, true]));
check('3b: the guard is per control - a second control\'s first tap is accepted inside the first control\'s window',
  JSON.stringify(run('b', [1100, 1200])) === JSON.stringify([true, false]));
check('3c: a first tap at timeStamp 0 is stored as a real tap - +200 swallowed, +450 accepted',
  JSON.stringify(run('z', [0, 200, 450])) === JSON.stringify([true, false, true]));
check('3d: the queued tap (issue #170): two taps 150 ms apart in event time - the second is swallowed whenever its handler runs',
  JSON.stringify(run('chip0', [5000, 5150])) === JSON.stringify([true, false]));

console.log(`proof-tapguard: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
