import { launchDrive, finish, bootThrough } from './harness.mjs';
const { proc, send, S, ev, consoleLog, sleep, poll: poll120, poll } = await launchDrive();
await bootThrough(ev, poll); // boots end at the route menu - click through to a loaded route

// drive208: Beta 1.253 hint-button decision (cross-audit fix round 4,
// #20). Through 1.252 the pick-stage hint button's LABEL (crRenderHint,
// keyed on crGrid's existence) and its CLICK (the handler, keyed on
// crFailFromGrid - the failure's source) interpreted the state
// independently, and where the keys disagreed the button lied. Both
// now consume ONE decision (crHintAction). This drive stages the
// preparation state in page (the drive148 precedent: state-machine
// corners are staged directly, the render and the real click handler
// do the rest) and grades the label/action PAIRS:
// (W1) THE DEFECT: a dense fallback-BOX failure while a grid exists -
//   the label must read 'Prepare this area' and the click must prepare
//   at the map centre. On the 1.252 tree the label reads 'Retry' and
//   W1 fails (the click already prepared at the centre - the label
//   was the lie).
// (W2) the grid-failure mirror: label 'Retry', the click resumes the
//   grid (its fingerprints: the failure record clears, no anchor is
//   prepared).
// (W3) the degraded pair: 'Resume' for a cancelled load, 'Retry
//   missing parts' for a part-missing one.
// (W4) an outstanding offer outranks the state remedies in BOTH the
//   label and the click (the pair Beta 1.154 fixed, pinned here).
const R = { checks: [] };
const ok = (name, cond) => R.checks.push([name, cond === true]);
const J = async (expr) => { const raw = await ev(`(() => { try { return JSON.stringify((${expr})); } catch (e) { return JSON.stringify({ __err: String(e && e.message || e) }); } })()`); return typeof raw === 'string' ? JSON.parse(raw) : {}; };

await sleep(2500);
ok('F0 app boots with the map active', await poll120(`typeof glOk !== 'undefined' && glOk === true`, 30000));
await poll120(`!document.getElementById('splash')`, 20000);

// Enter the pick stage's state space and stage a settled grid object.
await ev(`(() => { creating = true; crStage = 'pick'; crGrid = { name: 'Testville', cells: [], stopped: null, ops: new Set(), active: 0, ticker: null, gen: crCovGen, session: crSession, startedAt: Date.now(), lastProgressAt: Date.now() }; return true; })()`);
const btnLabel = async () => { const b = await J(`(() => { const b = $('crHintBtn'); return { label: b.textContent, shown: b.style.display !== 'none' }; })()`); return b; };

// ---- W1: dense box failure over a settled grid ----
await ev(`(() => { crWanted = null; crPrepFail = { ok: false, kind: 'dense' }; crFailFromGrid = false; crPrepAnchor = null; crPrepState = 'failed'; crRenderHint(); return true; })()`);
const w1Label = await btnLabel();
const w1Hint = await J(`(() => !!document.getElementById('createHint'))()`); // Beta 1.296: there is no failure-text surface any more
const centre = await J(`(() => { const c = map.getCenter(); return { lat: c.lat, lng: c.lng }; })()`);
await ev(`(() => { $('crHintBtn').click(); return true; })()`);
const w1 = await J(`(() => ({ state: crPrepState, anchor: crPrepAnchor }))()`);
ok('W1 a dense box failure over a grid reads Prepare this area - not Retry | label ' + JSON.stringify(w1Label.label), w1Label.label === 'Prepare this area' && w1Label.shown === true);
ok('W1 no failure text exists to name a different remedy (the label alone carries it) | hint element present: ' + JSON.stringify(w1Hint), w1Hint === false);
ok('W1 the click prepares at the map centre, matching the label | state ' + w1.state + ', anchor ' + JSON.stringify(w1.anchor), w1.state === 'preparing' && !!w1.anchor && Math.abs(w1.anchor.lat - centre.lat) < 1e-9 && Math.abs(w1.anchor.lng - centre.lng) < 1e-9);

// ---- W2: a grid failure - Retry that resumes ----
// (the W1 click's preparation is in flight; stop the world back to a staged failure)
await ev(`(() => { if (crPrep) { clearInterval(crPrep.ticker); crAbortOp(crPrep.op); crPrep = null; } crCovGen++; crGrid = { name: 'Testville', cells: [], stopped: null, ops: new Set(), active: 0, ticker: null, gen: crCovGen, session: crSession, startedAt: Date.now(), lastProgressAt: Date.now() }; crWanted = null; crPrepFail = { ok: false, kind: 'error' }; crFailFromGrid = true; crPrepAnchor = null; crPrepState = 'failed'; crRenderHint(); return true; })()`);
const w2Label = await btnLabel();
await ev(`(() => { $('crHintBtn').click(); return true; })()`);
const w2 = await J(`(() => ({ fail: crPrepFail, fromGrid: crFailFromGrid, anchor: crPrepAnchor }))()`);
ok('W2 a grid failure reads Retry | label ' + JSON.stringify(w2Label.label), w2Label.label === 'Retry' && w2Label.shown === true);
ok('W2 the click resumes the grid - the failure record clears and no anchor is prepared | ' + JSON.stringify(w2), w2.fail === null && w2.fromGrid === false && w2.anchor === null);

// ---- W3: the degraded pair ----
await ev(`(() => { crPrepState = 'degraded'; crGrid.stopped = 'cancelled'; crRenderHint(); return true; })()`);
const w3a = await btnLabel();
await ev(`(() => { crGrid.stopped = null; crRenderHint(); return true; })()`);
const w3b = await btnLabel();
ok('W3 a cancelled load reads Resume, a part-missing load reads Retry missing parts | ' + JSON.stringify([w3a.label, w3b.label]), w3a.label === 'Resume' && w3b.label === 'Retry missing parts');

// ---- W4: an outstanding offer outranks the remedies, in label and click alike ----
const wantedAnchor = { lat: centre.lat + 0.01, lng: centre.lng + 0.01 };
await ev(`(() => { crPrepState = 'failed'; crPrepFail = { ok: false, kind: 'error' }; crFailFromGrid = false; crPrepAnchor = null; crWanted = { label: 'Prepare the wanted area', anchor: ${JSON.stringify(wantedAnchor)} }; crRenderHint(); return true; })()`);
const w4Label = await btnLabel();
await ev(`(() => { $('crHintBtn').click(); return true; })()`);
const w4 = await J(`(() => ({ anchor: crPrepAnchor }))()`);
ok('W4 an outstanding offer supplies the label over a failed state | label ' + JSON.stringify(w4Label.label), w4Label.label === 'Prepare the wanted area');
ok('W4 the click prepares at the offer anchor, matching the label | anchor ' + JSON.stringify(w4.anchor), !!w4.anchor && Math.abs(w4.anchor.lat - wantedAnchor.lat) < 1e-9 && Math.abs(w4.anchor.lng - wantedAnchor.lng) < 1e-9);

R.exceptions = consoleLog.filter(c => c.type === 'EXCEPTION').map(c => String(c.text || '').slice(0, 200));
finish(R, proc);
