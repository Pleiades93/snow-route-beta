import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Mutation-run proof (2026-11-19, snow-mutation-run): the create flow's
// load gate (parts/create-pick.js). Beta 1.176: an in-flight load paints
// NO readout until its own start is at least CR_LOAD_GATE_MS (5 s) old -
// pastGate(t0) is the one comparison that decides it. The mutation run
// showed the fast suite caught neither flipping that comparison
// (>= became <, so the readout would show instantly and vanish at 5 s)
// nor the gate constant drifting 5000 -> 5001. This proof extracts
// pastGate verbatim and pins the boundary at the documented 5 s with a
// stubbed clock (the harness supplies Date, so the boundary is exact,
// never a race against the real clock): the value 5000 is written here
// as the spec (Beta 1.176's gate), so a one-step drift of the shipped
// constant fails the boundary check. On the clean tree all checks pass;
// both breaks fail.

const src = readFileSync('parts/create-pick.js', 'utf8');
const gateLine = src.split('\n').find(l => l.includes('const pastGate'));
const constLine = src.split('\n').find(l => l.includes('const CR_LOAD_GATE_MS'));
if (!gateLine || !constLine) { console.log('FAIL: pastGate / CR_LOAD_GATE_MS not found'); process.exit(1); }
const T = 1_000_000_000; // the stubbed "now"
const ctx = vm.createContext({ Date: { now: () => T } });
vm.runInContext(constLine + '\n' + gateLine + '\nthis.__pastGate = pastGate;', ctx);
const pastGate = ctx.__pastGate;

let fails = 0;
function check(label, cond) { console.log((cond ? 'PASS: ' : 'FAIL: ') + label); if (!cond) fails++; }
check('no start time is never past the gate', pastGate(0) === false && pastGate(null) === false);
check('a load 4999 ms old is still gated', pastGate(T - 4999) === false);
check('a load 5000 ms old (the documented gate) is past it', pastGate(T - 5000) === true);
check('a load 60 s old is past the gate', pastGate(T - 60000) === true);
console.log(fails ? `proof-mut-load-gate: ${fails} FAILING` : 'proof-mut-load-gate: all pass');
process.exit(fails ? 1 : 0);
