import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Trim-glow / path-side / pill-ink proof (fix_id: trim-glow-path-pills,
// Beta 1.209, 2026-11-15). Three Andrew-directed fixes from his Beta
// 1.208 phone session:
//
//   S1 - the create flow's sector-trim glow covered the street's WHOLE
//        line (syncCrGlow pushed the stitched runs), so a sector tapped
//        OFF turned grey but kept glowing. The glow is now built from
//        the chosen sector parts (crStreetParts + crChosenSet - the
//        same record renderDraft paints from).
//   S2 - a multi-select side-chip press applied ONE stored side index
//        to every selected stretch, but stored sides are numbered
//        against each street's drawn direction - across a turn, one
//        press lit the driver's right on one street and his left on
//        the next. groupSideMap (app2.js) chains the taps in tap order
//        into drives and maps the press's driver meaning per stretch.
//        The cases below run on Route 5W's REAL stretch data
//        (computeStretches over parts/data.js) and assert the PHYSICAL
//        side (from coordinates, computed independently here), not the
//        implementation's bookkeeping.
//   S3 - the class pills' ink: #4a3200 -> true black #000000 on
//        .crChip and .crPChip, both classes; metrics unchanged.
//   S4 - (added later the same evening) the selection card wears
//        Look 2 (Andrew's approved sample): solid card, 16px radius,
//        13/14 padding, flat soft shadow - the glass and the 1.32
//        street-colour edge retired; the complete-road button reads
//        'Complete entire road' ('Mark completed' retired everywhere);
//        the action buttons wear the shared mint tint at 42px.
//   S5 - (added later the same evening) the progress pill's slot is
//        permanently reserved: updateCount toggles VISIBILITY, the
//        markup rests at visibility:hidden - the dock never compacts
//        (the 1.202 display toggle moved the Start circle by the
//        pill's 37px footprint; Andrew hit the jump and ruled it out).
//
// On unmodified main (Beta 1.208): S1's glow carries the whole run
// (checks fail), S2's groupSideMap does not exist (checks fail), S3's
// ink is #4a3200 (checks fail), S4's card is glass with the old label,
// S5's pill toggles display. With the fix all checks pass.
//
// Run from the repo root:  node tests/proof/proof-trim-glow-path-pills.mjs

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' - ' + detail : '')); }
}
function extractFn(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return null;
  let j = src.indexOf('{', i), d = 0, k = j;
  for (; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) break; } }
  return src.slice(i, k + 1);
}

const head = readFileSync('parts/head.html', 'utf8');
const app1 = readFileSync('parts/app1.js', 'utf8');
const app2 = readFileSync('parts/app2.js', 'utf8');
const createPick = readFileSync('parts/create-pick.js', 'utf8');
const dataJs = readFileSync('parts/data.js', 'utf8');

// ================= S3 - pill ink =================
console.log('S3 - pill ink is true black, metrics unchanged');
{
  const rule = sel => { const m = head.match(new RegExp(sel.replace(/\./g, '\\.') + ' \\{[^}]*\\}')); return m ? m[0] : ''; };
  for (const sel of ['.crChip.primary', '.crChip.sec', '.crPChip.primary', '.crPChip.sec'])
    check(sel + ' wears #000000', /color: #000000;/.test(rule(sel)), rule(sel).slice(0, 90));
  check('no pill rule keeps #4a3200', !/\.cr(Chip|PChip)\.(primary|sec) \{[^}]*#4a3200/.test(head));
  for (const sel of ['.crChip', '.crPChip']) {
    const base = rule(sel);
    check(sel + ' base metrics unchanged', /font-size: 12px/.test(base) && /font-weight: 800/.test(base) && /letter-spacing: \.3px/.test(base) && /padding: 6px 10px/.test(base) && /border-radius: 999px/.test(base), base.slice(0, 120));
  }
  check('pill labels stay ALL CAPS literals', createPick.includes("? 'PRIMARY' : 'SECONDARY'"));
}

// ================= S1 - trim glow covers chosen sectors only =================
console.log('S1 - trim glow covers the chosen sectors only');
{
  const sync = extractFn(createPick, 'syncCrGlow');
  const ensure = extractFn(createPick, 'ensureCrGlowLayers');
  const chosen = extractFn(createPick, 'crChosenSet');
  check('glow functions extractable', !!(sync && ensure && chosen));
  if (sync && ensure && chosen) {
    // a four-sector street; each sector a distinct two-point line
    const parts = [0, 1, 2, 3].map(i => [[43.80 + i * 0.01, -79.55], [43.80 + i * 0.01 + 0.004, -79.54]]);
    const wholeRun = [[43.80, -79.55], [43.85, -79.53]];
    // Beta 1.211 re-derivation (TEST, deliberate scope replacement): the
    // glow's sink is no longer a GeoJSON source's setData - syncCrGlow now
    // hands its feature set to crGlowSetFeatures (the shader layer's mesh
    // builder, pinned by proof-shader-glow-round.mjs). The S1 invariant is
    // the FEATURE SET (chosen sectors only), so the sink is stubbed with a
    // capture and every feature-set check below runs unchanged.
    let glowFeats = null;
    const ctx = { console };
    vm.createContext(ctx);
    ctx.__sink = feats => { glowFeats = feats; };
    vm.runInContext(`
      var crSectorSession = { street: 'Davos' };
      var draft = { roads: { Davos: {} }, sectors: { Davos: [0, 2] }, primaries: new Set() };
      var map = { addLayer() {}, getLayer: () => ({}) };
      var crStreetParts = () => ({ parts });
      var crDraftGeom = () => ({ Davos: { runs: [{ line: wholeRun }] } });
      var crGlowSetFeatures = feats => { __sink(feats); };
    `, ctx);
    ctx.parts = parts; ctx.wholeRun = wholeRun;
    vm.runInContext(ensure, ctx);
    vm.runInContext(chosen, ctx);
    vm.runInContext(sync, ctx);
    const run = expr => vm.runInContext(expr, ctx);
    const coordsOf = feats => feats.map(f => JSON.stringify(f.geometry.coordinates));
    const partCoord = i => JSON.stringify(parts[i].map(p => [p[1], p[0]]));
    const read = () => glowFeats ? { features: glowFeats } : null; // the crGlowSetFeatures capture, wrapped in the shape the checks read
    run('syncCrGlow()');
    let d = read();
    check('sectors [0,2] picked: glow is exactly parts 0 and 2', !!d && d.features.length === 2 && JSON.stringify(coordsOf(d.features).sort()) === JSON.stringify([partCoord(0), partCoord(2)].sort()), d ? 'features=' + d.features.length : 'no data');
    run('draft.sectors = { Davos: [1] }; syncCrGlow()');
    d = read();
    check('sector [1] only: glow is exactly part 1', !!d && d.features.length === 1 && coordsOf(d.features)[0] === partCoord(1), d ? 'features=' + d.features.length : 'no data');
    run('draft.sectors = {}; syncCrGlow()');
    d = read();
    check('no sector pick (whole street): glow covers all 4 parts', !!d && d.features.length === 4 && JSON.stringify(coordsOf(d.features).sort()) === JSON.stringify([0, 1, 2, 3].map(partCoord).sort()), d ? 'features=' + d.features.length : 'no data');
    run('crSectorSession.street = null; syncCrGlow()');
    d = read();
    check('trim closed: no glow', !!d && d.features.length === 0, d ? 'features=' + d.features.length : 'no data');
    check('grey removed-sector paint untouched (renderDraft still flags chosen per part)', createPick.includes('chosen: set.has(i) ? 1 : 0'));
  }
}

// ================= S2 - side arrows follow the drive =================
console.log('S2 - multi-select side arrows follow the driver path');
{
  const mapFn = extractFn(app2, 'groupSideMap');
  const joinConst = (app2.match(/const GROUP_PATH_JOIN_M = \d+;/) || [null])[0];
  check('groupSideMap exists with its join tolerance', !!(mapFn && joinConst));
  check('togglePieceGroup applies the per-stretch map', (extractFn(app2, 'togglePieceGroup') || '').includes('groupSideMap(side)'));
  check('groupSideDone reads the mapped side', (extractFn(app2, 'groupSideDone') || '').includes('groupSideMap(side)'));
  if (mapFn && joinConst) {
    const ctx = { console };
    vm.createContext(ctx);
    vm.runInContext('const MLAT = 111320, MLNG = 80386; var STRETCH = {}; var selSet = []; var sel = null;', ctx);
    for (const f of ['distM', 'stitchRuns', 'projOnLine', 'sliceLine', 'finishJunctionCuts', 'computeStretches'])
      vm.runInContext(extractFn(app1, f), ctx);
    vm.runInContext(dataJs, ctx);
    vm.runInContext('STRETCH = computeStretches(ROUTE_PACKS.find(p => p.id === "5w").roads)', ctx);
    vm.runInContext(joinConst, ctx);
    vm.runInContext(mapFn, ctx);
    const ST = vm.runInContext('STRETCH', ctx);
    const distM = vm.runInContext('distM', ctx);
    const groupSideMap = vm.runInContext('groupSideMap', ctx);
    const setSel = taps => vm.runInContext(`selSet = ${JSON.stringify(taps.map(([name, idx]) => ({ name, idx, anchor: [0, 0] })))}; sel = selSet[selSet.length - 1];`, ctx);

    // --- the test's own geometry (independent of the implementation) ---
    const M = p => [p[1] * 80386, p[0] * 111320]; // [east, north] metres
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
    const endsOf = (name, idx) => { const p = ST[name].parts[idx]; return [p[0], p[p.length - 1]]; };
    // chain the taps (20 m end matching, written here independently)
    function chain(taps) {
      const joins = [null];
      for (let k = 1; k < taps.length; k++) {
        let best = null;
        for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
          const d = distM(endsOf(...taps[k - 1])[a], endsOf(...taps[k])[b]);
          if (d <= 20 && (!best || d < best.d)) best = { a, b, d };
        }
        joins.push(best);
      }
      return joins;
    }
    // per-entry: travel vector + drawn vector (metre space); null for a singleton drive
    function frames(taps) {
      const joins = chain(taps);
      const drives = []; let cur = [0];
      for (let k = 1; k < taps.length; k++) { if (joins[k]) cur.push(k); else { drives.push(cur); cur = [k]; } }
      drives.push(cur);
      return taps.map(([name, idx], k) => {
        const drv = drives.find(d => d.includes(k));
        if (!drv || drv.length < 2) return null;
        const pos = drv.indexOf(k);
        const [F, L] = endsOf(name, idx).map(M);
        const enter = pos > 0 ? M(endsOf(...taps[k])[joins[k].b]) : null;
        const exit = pos < drv.length - 1 ? M(endsOf(...taps[k])[joins[k + 1].a]) : null;
        let travel;
        if (enter && exit) travel = sub(exit, enter);
        else if (enter) travel = sub(dot(enter, F) === 0 && enter[0] === F[0] && enter[1] === F[1] ? L : F, enter);
        else travel = sub(exit, (exit[0] === F[0] && exit[1] === F[1]) ? L : F);
        if (Math.hypot(travel[0], travel[1]) < 1) { // hairpin fallback: from the shared end inward
          const shared = enter || exit; travel = sub(shared[0] === F[0] && shared[1] === F[1] ? L : F, shared);
        }
        return { travel, drawn: sub(L, F) };
      });
    }
    const leftOf = v => [-v[1], v[0]];
    const rightOf = v => [v[1], -v[0]];
    // expected stored side of the driver's RIGHT for a framed entry
    const expectedRight = fr => (dot(leftOf(fr.drawn), rightOf(fr.travel)) > 0 ? 0 : 1);
    const anchorChip = (taps, driverRight) => {
      const fr = frames(taps); const a = fr[fr.length - 1];
      const withDrawn = dot(a.travel, a.drawn) > 0;
      return driverRight ? (withDrawn ? 1 : 0) : (withDrawn ? 0 : 1);
    };
    function assertDrive(label, taps) {
      const fr = frames(taps);
      const chipR = anchorChip(taps, true);
      setSel(taps);
      const gotR = groupSideMap(chipR);
      let ok = true, detail = '';
      taps.forEach(([name, idx], k) => {
        if (!fr[k]) { if (gotR[k] !== chipR) { ok = false; detail = `${name}#${idx} singleton should keep raw ${chipR}, got ${gotR[k]}`; } return; }
        const want = expectedRight(fr[k]);
        if (gotR[k] !== want) { ok = false; detail = `${name}#${idx}: driver-right should store side ${want}, got ${gotR[k]}`; }
      });
      check(label + ' - driver-right lands on the physical right everywhere', ok, detail);
      const chipL = anchorChip(taps, false);
      const gotL = groupSideMap(chipL);
      let okL = true;
      taps.forEach(([name, idx], k) => { if (fr[k] && gotL[k] !== 1 - expectedRight(fr[k])) okL = false; });
      check(label + ' - driver-left is the mirror', okL);
      return { fr, chipR, gotR };
    }

    // Case A - Andrew's: north on Valeria, right turn east onto Greenpark
    const tapsA = [['Valeria', 8], ['Valeria', 7], ['Greenpark', 0], ['Greenpark', 1]];
    const A = assertDrive('A Valeria->Greenpark (right turn)', tapsA);
    check('A reproduces the 1.208 defect under the old raw rule', (() => {
      // raw rule: the pressed chip's index on every stretch - at least one
      // stretch would take the driver's LEFT
      return A.fr.some((f, k) => f && A.chipR !== expectedRight(f));
    })());
    check('A stored sides differ per street (the flip is real)', A.gotR[0] !== A.gotR[2], JSON.stringify(A.gotR));

    // Case B - straight on: Fifth continues into Angie (Fifth becomes Angie at Valeria)
    assertDrive('B Fifth->Angie (straight)', [['Fifth', 4], ['Fifth', 5], ['Angie', 0]]);

    // Case C - left turn: west on Greenpark, left turn south onto Valeria
    const C = assertDrive('C Greenpark->Valeria (left turn)', [['Greenpark', 2], ['Greenpark', 1], ['Greenpark', 0], ['Valeria', 7], ['Valeria', 8]]);
    check('C stored sides differ per street', C.gotR[0] !== C.gotR[3], JSON.stringify(C.gotR));

    // Case D - unconnected sections keep the raw mapping
    setSel([['Valeria', 0], ['Greenpark', 2]]);
    check('D unconnected: raw mapping for both chips', JSON.stringify(groupSideMap(0)) === '[0,0]' && JSON.stringify(groupSideMap(1)) === '[1,1]', JSON.stringify(groupSideMap(1)));

    // Case E - single street + single section regressions (raw, exactly as 1.208)
    setSel([['Valeria', 6], ['Valeria', 5], ['Valeria', 4]]);
    check('E single street (reverse tap order): raw for both chips', JSON.stringify(groupSideMap(0)) === '[0,0,0]' && JSON.stringify(groupSideMap(1)) === '[1,1,1]');
    setSel([['Santa Barbara', 2]]);
    check('E single section: raw', JSON.stringify(groupSideMap(1)) === '[1]' && JSON.stringify(groupSideMap(0)) === '[0]');

    // Case F - same street tapped out of driving order: the skipped section breaks the drive
    assertDrive('F Valeria out-of-order taps', [['Valeria', 4], ['Valeria', 6], ['Valeria', 5]]);

    // Case G - one street driven in opposite directions in one selection
    const G = assertDrive('G Valeria both directions', [['Valeria', 4], ['Valeria', 5], ['Valeria', 8], ['Valeria', 7]]);
    check('G the two chunks map independently', G.gotR[0] === G.gotR[1] && G.gotR[2] === G.gotR[3] && G.gotR[0] !== G.gotR[2], JSON.stringify(G.gotR));

    // Case H - hairpin: both neighbours join the middle section at the SAME end
    {
      const B = [43.8, -79.5], off = (x, y) => [B[0] + y / 111320, B[1] + x / 80386];
      const syn = {
        Prev: { parts: [[off(200, 0), off(100, 0)]] },
        Spur: { parts: [[off(0, 0), off(100, 0)]] },
        Next: { parts: [[off(100, 0), off(100, 100)]] },
      };
      vm.runInContext('STRETCH = ' + JSON.stringify(syn), ctx);
      setSel([['Prev', 0], ['Spur', 0], ['Next', 0]]);
      const got = groupSideMap(1); // anchor Next travels with its line; chip 1 = driver's right
      check('H hairpin: middle section travelled from its shared end inward', JSON.stringify(got) === '[1,0,1]', JSON.stringify(got));
      vm.runInContext('STRETCH = computeStretches(ROUTE_PACKS.find(p => p.id === "5w").roads)', ctx);
    }
  }
}

// ================= S4 - selection card Look 2 + wording =================
console.log('S4 - selection card Look 2 chrome; button says Complete entire road');
{
  const selPopRule = (head.match(/#selPop \{[^}]*\}/) || [''])[0];
  check('card is Look 2 day: solid white, hairline border, 16px radius, 13/14 padding, flat soft shadow',
    selPopRule.includes('background: #ffffff') && selPopRule.includes('border: 1px solid rgba(20,22,26,.08)') &&
    selPopRule.includes('border-radius: 16px') && selPopRule.includes('padding: 13px 14px') &&
    selPopRule.includes('box-shadow: 0 8px 22px rgba(20,22,26,.13)'), selPopRule.slice(0, 160));
  check('the street-colour edge is retired (no --accent in the card shadow, no accent feed left)',
    !selPopRule.includes('--accent') && !app2.includes("setProperty('--accent'") && !app2.includes('oneStreet'));
  const nightRule = (head.match(/body\.night #selPop \{[^}]*\}/) || [''])[0];
  check('card is Look 2 night: rgba(20,21,27,.97), hairline white border, black shadow',
    nightRule.includes('background: rgba(20,21,27,.97)') && nightRule.includes('rgba(255,255,255,.07)') && nightRule.includes('0 8px 22px rgba(0,0,0,.4)'), nightRule.slice(0, 120));
  check('title 16px/800, sub-line 12px in the Look 2 greys',
    /#selName \{ font-size: 16px; font-weight: 800;/.test(head) && /#selStatus \{ font-size: 12px; color: #6f757f;/.test(head) && /body\.night #selStatus \{ color: #9aa0aa; \}/.test(head));
  const btnRule = (head.match(/\n  #selPop #selBtn \{[^}]*\}/) || [''])[0];
  const allRule = (head.match(/\n  #selPop #selAllBtn \{[^}]*\}/) || [''])[0];
  const noteRule = (head.match(/#selPop #selNote \{[^}]*\}/) || [''])[0];
  check('action button: 42px, radius 11, mint tint day + night; Mark both sides shares it',
    btnRule.includes('height: 42px') && btnRule.includes('border-radius: 11px') && btnRule.includes('background: rgba(6,180,130,.13)') && btnRule.includes('color: #087a5b') &&
    /body\.night #selPop #selBtn \{ background: rgba\(6,214,160,\.15\); color: #2fe0ae; \}/.test(head) &&
    allRule.includes('background: rgba(6,180,130,.13)') && allRule.includes('color: #087a5b') && allRule.includes('height: 42px'));
  check('the card button rules carry the load-bearing #selPop prefix (the generic rule would otherwise win)',
    head.includes('#selPop #selBtn {') && head.includes('#selPop #selAllBtn {') && head.includes('#selPop #selClearBtn {')
    && !/\n  #selBtn \{/.test(head) && !/\n  #selAllBtn \{/.test(head) && !/\n  #selClearBtn \{/.test(head));
  check('note button: 34px ghost circle, 16px icon, Look 2 ghosts per theme',
    noteRule.includes('width: 34px') && noteRule.includes('background: rgba(20,22,26,.05)') && noteRule.includes('color: #3c4149') &&
    /body\.night #selPop #selNote \{ background: rgba\(255,255,255,\.06\); color: #c9cdd4; \}/.test(head) &&
    /#selNote svg \{ width: 16px; height: 16px;/.test(head));
  check('the button reads Complete entire road (JS + resting markup)',
    app2.includes("b.textContent = 'Complete entire road'") && head.includes('<button id="selBtn">Complete entire road</button>'));
  check("'Mark completed' is retired from every part", !head.includes('Mark completed') && !app2.includes('Mark completed')
    && !app1.includes('Mark completed') && !createPick.includes('Mark completed'));
  check("'Mark both sides' and 'Clear' labels untouched", head.includes('<button id="selAllBtn">Mark both sides</button>') && head.includes('<button id="selClearBtn">Clear</button>'));
}

// ================= S5 - the pill slot is always reserved =================
console.log('S5 - progress pill slot permanently reserved (visibility, never display)');
{
  check('updateCount toggles visibility from runStart (the ONE place the rule lives)',
    app2.includes("$('count').style.visibility = runStart ? 'visible' : 'hidden'"));
  check('the old display toggle is gone', !app2.includes("$('count').style.display"));
  check('the resting markup reserves the slot (visibility:hidden, no display:none on #count)',
    head.includes('<div id="count" style="visibility:hidden">') && !head.includes('<div id="count" style="display:none">'));
}

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
