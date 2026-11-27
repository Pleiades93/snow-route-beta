// the load readout is gone (audit v2): only the action button renders, and only past its five-second gate
const CR_LOAD_GATE_MS = 5000;
function crHintAction() { // the one decision for the hint button: label and click action both read it, so they can never diverge
  if (crPrepState === 'preparing') return { label: 'Cancel', act: 'cancel' };
  if (crWanted) return { label: crWanted.label, act: 'wanted' };
  if (crPrepState === 'degraded') {
    if (!crGrid) return { label: '', act: '' }; // degraded is a grid state: with no grid there is no remedy to offer, and no button may promise one
    return crGrid.stopped === 'cancelled' ? { label: 'Resume', act: 'resume' } : { label: 'Retry missing parts', act: 'resume' };
  }
  if (crPrepState === 'failed') {
    if (crFailFromGrid) return { label: 'Retry', act: 'resume' }; // a failed GRID retries its missing cells
    if (crPrepFail && crPrepFail.kind === 'dense') return { label: 'Prepare this area', act: 'prepare-centre' }; // a dense BOX failure: retrying the same anchor cannot help (fixed footprint) - prepare wherever the map now sits (CG-PF-09)
    return { label: 'Retry', act: 'retry-anchor' }; // a failed BOX re-runs at its own anchor
  }
  if (crPrepState === 'ready') return { label: '', act: '' }; // an offer in the ready state is the crWanted case above; a healthy city offers no button of its own
  if (map && map.getZoom() >= 14) return { label: 'Prepare this area', act: 'prepare-centre' };
  return { label: '', act: '' };
}
function crRenderHint() { // the one writer of the action button and the city chip: state-driven, so no stale state survives
  if (!creating || crStage !== 'pick') return;
  const btn = $('crHintBtn');
  if (crSectorSession.street) { btn.style.display = 'none'; return; } // while trimming, no button: the sector bar's own line already tells him
  const load = crPrep || crGrid; // the in-flight load, box or grid: its start times the gate
  const pastGate = t0 => !!t0 && (Date.now() - t0) >= CR_LOAD_GATE_MS;
  const gated = crPrepState === 'preparing' && !!load && !pastGate(load.startedAt); // inside the gate the button stays hidden
  const btnLabel = gated ? '' : crHintAction().label; // the button's label is the one decision's (crHintAction)
  if (btnLabel) { btn.textContent = btnLabel; btn.style.display = ''; } else btn.style.display = 'none';
  btn.classList.toggle('danger', btnLabel === 'Cancel'); // anything Cancel is red: while the button reads Cancel it wears the destructive red
  const cc = $('crCityChange'); if (cc) { if (crCity) { // the city bar above Done, built from text nodes: the typed city name never becomes markup
      cc.textContent = ''; const b = document.createElement('b'); b.textContent = crCity.name; const go = document.createElement('span'); go.className = 'crCityGo'; go.textContent = 'change'; cc.append('Working in ',
        b,
        ' · ',
        go); cc.style.display = ''; } else cc.style.display = 'none';
      }
  crRefreshSearch(); // every coverage landing renders this hint as it lands, so the open street search refreshes with it (guards at crRunSearch)
}
// ---- the DRAFT owner ---- every draft mutation and its following render live here; sector state is the same owner's
const DRAFT = {
  render() { renderDraft(); renderCrLists(); crRenderHint(); }, // the ONE post-mutation render, in the order every mutation site already used
  renderLists() { renderDraft(); renderCrLists(); }, // the category toggle's tail: the hint does not read the primaries, so it is not re-rendered
  addStreet(name, segs) { // the draft keys on the full map name (streets sharing a short name would collide); shortStreetName is display-only now
    draft.roads[name] = segs; draft.osmNames[name] = name; crGeomGen++; // a tapped street joins as a secondary (flip it in the list); the bump invalidates the draft-geometry cache
    delete crPending[name];
    crIsectClear(); // the first road selection ends the POI surface: the crossing's name and marker clear
    DRAFT.render();
    // no 'Added' popup: the road's picked state on the map and in the panel is the feedback
  },
  addRun(name, segs) { // a run joins the same entry (parts append in order); a trim stands, gaining the run's parts as chosen
    const before = DRAFT.hasTrim(name) ? crStreetParts(name) : null;
    draft.roads[name] = draft.roads[name].concat(segs); crGeomGen++;
    if (draft.parts) delete draft.parts[name];
    if (before) {
      const rec = crStreetParts(name);
      if (rec) { const set = crChosenSet(name, before); for (let i = before.parts.length; i < rec.parts.length; i++) set.add(i); crSetChosen(name, rec, set); }
    }
    crIsectClear(); // a road selection like any other: the POI surface ends here too
    DRAFT.render();
    // no 'Added the other part' popup either: same rule as the add-street method
  },
  removeStreet(name) { // the one removal path (panel x, preview x, Clear): a street leaves with all its draft state
    if (!draft || !draft.roads[name]) return;
    delete draft.roads[name]; draft.primaries.delete(name); delete draft.osmNames[name]; crGeomGen++; // the removal invalidates the shared draft geometry (see crDraftGeom)
    DRAFT.dropTrim(name);
    if (draft.parts) delete draft.parts[name];
    delete crPending[name];
    if (crSectorSession.street === name) crSectorReset();
    DRAFT.render();
  },
  togglePrimary(name) { if (draft.primaries.has(name)) draft.primaries.delete(name); else draft.primaries.add(name); DRAFT.renderLists(); }, // the category flip both row chips spelled out identically through 1.280 - one body now
  // ---- sector state: an absent entry means the whole road; a present one is the sorted chosen part indexes
  trimOf(name) { return draft && draft.sectors ? draft.sectors[name] : null; }, // the street's trim exactly as the pre-owner sites read it (an absent key reads undefined; no draft reads null)
  hasTrim(name) { return !!(draft && draft.sectors && draft.sectors[name]); }, // the presence test the parts-record pin and the add-run dance once spelled out inline
  snapshotTrim(name) { const t = DRAFT.trimOf(name); return t ? t.slice() : null; }, // the session's entry snapshot: a copy of the trim in force, or null when the whole road stands
  chosenSet(name, rec) { const sel = DRAFT.trimOf(name); return new Set(sel || rec.parts.map((_, i) => i)); }, // no entry = every sector chosen (the whole road)
  setChosen(name, rec, set) { // a full set stores as no entry: whole road stays the default, an untrimmed street carries no sector baggage
    draft.sectors = draft.sectors || {};
    if (set.size >= rec.parts.length) delete draft.sectors[name];
    else draft.sectors[name] = [...set].sort((a, b) => a - b);
  },
  dropTrim(name) { if (draft.sectors) delete draft.sectors[name]; }, // a trim leaves with its street (the removal) or with an abandoned restore point (the sector session's cancel, no-snapshot arm)
  restoreTrim(name, snap) { draft.sectors = draft.sectors || {}; draft.sectors[name] = snap.slice(); }, // the session's Cancel restore: the entry snapshot returns as a copy, exactly as it was taken
  clearAll() { // Clear-all's wholesale reset: maps replaced (null-prototype), generation bumped, pending cleared, session reset, then the one render
    draft.roads = Object.create(null); draft.primaries.clear(); draft.osmNames = Object.create(null); draft.sectors = Object.create(null); draft.parts = Object.create(null);
    crGeomGen++; crPending = {}; // the wholesale replacement keeps both mutation duties: bump the generation, clear pending (else the sweep re-adds cleared streets)
    crSectorReset();
    DRAFT.render();
  }
};
function crAddStreet(name, segs) { DRAFT.addStreet(name, segs); } // doorway: the body lives on the DRAFT owner above
function crRunHeld(name, segs) { // is this run already in the draft? Segment identity is exact: re-resolving reproduces the same segments deterministically
  const held = new Set((draft.roads[name] || []).map(sg => JSON.stringify(sg)));
  return segs.length > 0 && segs.every(sg => held.has(JSON.stringify(sg)));
}
function crAddRun(name, segs) { DRAFT.addRun(name, segs); } // doorway: the body lives on the DRAFT owner above
function crRemoveStreet(name) { DRAFT.removeStreet(name); } // doorway: the body lives on the DRAFT owner above
// ---- sectors: a street trims to the junction-to-junction pieces actually cleaned; the pack stores only the chosen polylines
function crCovStamp() { // the fingerprint a record is cut against (generation + size): a landing grows a count, a changed stamp means movement
  return crCov ? crCov.gen + ':' + crCov.boxes.length + ':' + Object.keys(crCov.byId).length : '';
}
function crStreetParts(name) { // sectors are cut against the EXTRACT, not the draft: boundaries never move as streets join or leave the draft
  if (!draft || !draft.roads[name]) return null;
  draft.parts = draft.parts || {};
  if (draft.parts[name]) {
    const rec = draft.parts[name];
    // a record is pinned while anything live indexes it (a trim, an open session's snapshot/bar/taps); unreferenced, it recomputes
    if (DRAFT.hasTrim(name) || crSectorSession.street === name || rec.covStamp === crCovStamp()) return rec;
  }
  const one = {}; one[name] = draft.roads[name];
  const runLines = stitchRuns(name, one).filter(L => L && L.length >= 2);
  if (!runLines.length) return null;
  const own = draft.osmNames ? draft.osmNames[name] : null;
  const mLat = 12 / MLAT, mLng = 12 / MLNG;
  const parts = [], runs = [];
  let total = 0;
  for (const line of runLines) {
    const cum = [0]; for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + distM(line[i - 1], line[i]));
    const rTotal = cum[cum.length - 1];
    let w = 1e9, s = 1e9, e = -1e9, n = -1e9; for (const p of line) { s = Math.min(s, p[0]); n = Math.max(n, p[0]); w = Math.min(w, p[1]); e = Math.max(e, p[1]); }
    const cuts = [];
    if (crCov && crCov.byName) {
      for (const nm of Object.keys(crCov.byName)) {
        if (nm === own) continue; // the street's own ways never cut it
        for (const wy of crCov.byName[nm]) for (const v of wy.pts) {
          if (v[0] < s - mLat || v[0] > n + mLat || v[1] < w - mLng || v[1] > e + mLng) continue;
          const pr = projOnLine(line, cum, v); if (pr.off <= 4) cuts.push(pr.d);
        }
      }
    }
    const rParts = finishJunctionCuts(line, cum, rTotal, cuts); // the finishing policy is shared with computeStretches (finishJunctionCuts, app1); only the junction SOURCE differs (the prepared extract)
    runs.push({ line, cum, total: rTotal, parts: rParts });
    for (const rp of rParts) parts.push(rp);
    total += rTotal;
  }
  const rec = { line: runs[0].line, cum: runs[0].cum, total, parts, runs, covStamp: crCovStamp() };
  draft.parts[name] = rec;
  return rec;
}
function crChosenSet(name, rec) { return DRAFT.chosenSet(name, rec); } // doorway: the body lives on the DRAFT owner (sector state)
function crSetChosen(name, rec, set) { DRAFT.setChosen(name, rec, set); } // doorway: the body lives on the DRAFT owner (sector state)
function crChosenLenM(name, rec) { const set = crChosenSet(name, rec); let s = 0; for (const i of set) if (rec.parts[i]) s += crLineLen(rec.parts[i]); return s; }
function crStreetChosenM(name, g) { // a street's length as picked (whole or trimmed): every stated length reads here, so unchosen ends never bill
  const sel = DRAFT.trimOf(name);
  if (!sel) return g && g[name] ? g[name].total : 0;
  const rec = crStreetParts(name); if (!rec) return 0;
  let s = 0; for (const i of sel) if (rec.parts[i]) s += crLineLen(rec.parts[i]);
  return s;
}
function crFilteredRoads() { // what the save stores: a trimmed street contributes only its chosen sectors' polylines; the pack format is untouched
  const out = {};
  for (const n of draftStreets()) {
    const sel = DRAFT.trimOf(n);
    if (sel && sel.length) { const rec = crStreetParts(n); out[n] = rec ? sel.map(i => rec.parts[i]).filter(p => p && p.length > 1) : draft.roads[n]; }
    else out[n] = draft.roads[n];
  }
  return out;
}
function crToggleSector(name, idx) {
  const rec = crStreetParts(name); if (!rec || idx < 0 || idx >= rec.parts.length) return;
  if (rec.parts.length === 1) { return; } // a one-piece street's sector is the whole road: the bar says so plainly and the tap changes nothing
  const set = crChosenSet(name, rec);
  if (set.has(idx)) set.delete(idx); else set.add(idx);
  if (!set.size) { crRemoveStreet(name); return; } // un-picking every sector removes the street (crRemoveStreet also closes its sector mode)
  crSetChosen(name, rec, set);
  renderDraft(); renderCrLists(); renderSectorBar();
}
// both tap handlers search CR_TAP_BOXES (reach, then one wider retry): one literal for the whole discipline
const CR_TAP_BOXES = [12, 20];
function crSectorTap(lngLat) { // a tap toggles the sector under it (features first, geometry fallback); TRUE only when one toggled
  const name = crSectorSession.street; if (!name || !draft || !draft.roads[name]) return false;
  const rec = crStreetParts(name); if (!rec) return false;
  let idx = -1;
  if (map && typeof map.queryRenderedFeatures === 'function' && typeof map.project === 'function') {
    try {
      const pt = map.project([lngLat.lng, lngLat.lat]);
      for (const half of CR_TAP_BOXES) {
        const feats = (map.queryRenderedFeatures([[pt.x - half, pt.y - half], [pt.x + half, pt.y + half]],
          { layers: ['crDraftHit'] }) || []).filter(f => f && f.properties && f.properties.name === name && typeof f.properties.sector === 'number' && f.properties.sector >= 0);
        if (!feats.length) continue;
        let bd = Infinity;
        for (const f of feats) { const d = crFeatDistM(lngLat, f.geometry); if (d < bd) { bd = d; idx = f.properties.sector; } }
        break;
      }
    } catch (e) {}
  }
  if (idx < 0) {
    // the fallback answers in pixels only inside the retry box's reach; the 75 m rule stays an absolute guard
    let bd = Infinity;
    const canPx = !!(map && typeof map.project === 'function');
    for (let i = 0; i < rec.parts.length; i++) { const d = canPx ? crFeatDistPx(lngLat, rec.parts[i]) : crFeatDistM(lngLat, { type: 'LineString', coordinates: rec.parts[i].map(p => [p[1], p[0]]) }); if (d < bd) { bd = d; idx = i; } }
    if (idx >= 0 && bd > (canPx ? CR_TAP_BOXES[1] : 75)) idx = -1; // beyond the tap discipline's reach - not a sector tap
    else if (idx >= 0 && canPx && crFeatDistM(lngLat, { type: 'LineString', coordinates: rec.parts[idx].map(p => [p[1], p[0]]) }) > 75) idx = -1; // the standing 75 m absolute guard
  }
  if (idx >= 0) { crToggleSector(name, idx); return true; }
  return false;
}
function crOpenSectors(name) { // opens trimming (panel row or map tap on the picked street); entry snapshots the pick as it stands
  if (!draft || !draft.roads || !Object.prototype.hasOwnProperty.call(draft.roads, name)) return; // own-property at this door too: a prototype member must not read as a held run
  if (!crStreetParts(name)) return;
  if (crSectorSession.street !== name) crSectorSession.snapshot = DRAFT.snapshotTrim(name); // a fresh entry only - re-entering the same street's open session must not move Cancel's restore point
  crSectorSession.street = name;
  renderSectorBar();
  const sheet = $('createSheet');
  if (sheet && sheet.classList.contains('on')) crMorphTo('bar');
  else syncCrPanel();
  renderDraft(); crRenderHint();
}
function crCloseSectors() { if (!crSectorSession.street) return; crSectorReset(); renderDraft(); syncCrGlow(); const sheet = $('createSheet'); if (sheet && sheet.classList.contains('on')) crMorphTo(crWantedFace()); else syncCrPanel(); crRenderHint(); } // Beta 1.208: syncCrGlow stands here explicitly because Done's path does not re-render the draft - the glow dies with the session, not with the next render. Beta 1.223: Done's path DOES re-render now (renderDraft above) - the draft's active flags live in the source features, so without a rebuild the closed street would stay vibrant on crDraftLineActive instead of returning to its gentle mute; every other session-closing path (Cancel, stage change, street removal, Clear all) already re-rendered, and this was the one that did not (Codex P2, PR #100)
function crCancelSectors() { // the back-out restores the pick exactly as at entry; un-picking every sector by toggles instead removes the street
  const s = crSectorSession.street; if (!s || !draft) return;
  if (crSectorSession.snapshot) DRAFT.restoreTrim(s, crSectorSession.snapshot);
  else DRAFT.dropTrim(s);
  crCloseSectors();
  renderDraft(); renderCrLists();
}
function crDeselectSectors() { // the third door: the street leaves via crRemoveStreet (the one removal path); the landing is crCloseSectors' own
  const s = crSectorSession.street; if (!s || !draft) return;
  crRemoveStreet(s);
  const sheet = $('createSheet'); if (sheet && sheet.classList.contains('on')) crMorphTo(crWantedFace()); else syncCrPanel();
}
function renderSectorBar() {
  const s = crSectorSession.street; if (!s || !draft || !draft.roads[s]) return;
  const rec = crStreetParts(s); if (!rec) return;
  const chosen = crChosenSet(s, rec);
  $('crSbName').textContent = shortStreetName(s); // the bar's title is a display surface: the short name, while the draft keys on the full one
  // honest about unsplittable streets (many compute to one part): never promise a trim whose outcome is deleting the road
  if (rec.parts.length === 1) { $('crSbSub').textContent = 'One piece · ' + fmtLenM(rec.total) + ', no cross-streets to split it at, so it goes into your route whole'; return; }
  $('crSbSub').textContent = chosen.size >= rec.parts.length
    ? 'Entire road picked · ' + fmtLenM(rec.total) + '. Tap sectors to trim it'
    : chosen.size + ' of ' + rec.parts.length + ' sectors picked · ' + fmtLenM(crChosenLenM(s, rec)) + '. The grey ends stay out of your route';
}
// ---- the pick sheet's surface ---- panel, strip and bar are contents of one card; face changes morph its geometry
let crMorph = null; // { from, to } while the surface morphs between faces, else null
// the faces in one table (element id + geometry class per face): a fourth face joins in exactly one place
const CR_FACES = { panel: { el: 'crPanel', cls: null }, strip: { el: 'crStrip', cls: 'crG-strip' }, bar: { el: 'crSectorBar', cls: 'crG-bar' } };
function crFaceEl(face) { return $(CR_FACES[face].el); }
// the sheet wears the face's geometry: its class on, the others off (the panel's geometry is both off)
function crFaceClasses(sheet, face) { for (const f of Object.keys(CR_FACES)) { const cls = CR_FACES[f].cls; if (cls) sheet.classList.toggle(cls, f === face); } }
function crWantedFace() { // the face asked for: bar while trimming, strip whenever tucked (any pick count), else the panel
  if (crSectorSession.street && draft && draft.roads[crSectorSession.street]) return 'bar';
  if (crSectorSession.collapsed) return 'strip';
  return 'panel';
}
function syncCrPanel() { // the rest state: the wanted face's geometry and content; no-op while a morph flies (its finish lands this)
  const sheet = $('createSheet'); if (!sheet) return;
  const els = {}; for (const f of Object.keys(CR_FACES)) { els[f] = crFaceEl(f); if (!els[f]) return; }
  if (crMorph) return;
  const want = crWantedFace();
  crSectorSession.face = want;
  crFaceClasses(sheet, want);
  for (const f of Object.keys(CR_FACES)) els[f].style.display = f === want ? '' : 'none';
  if (want === 'bar') renderSectorBar();
}
function crGeoOf(sheet) { // the surface's border-box geometry as plain numbers, read from computed style so calc()/env() are already resolved to px
  const cs = getComputedStyle(sheet);
  const rad = (cs.borderRadius || '0px').trim().split(/\s+/).map(v => parseFloat(v) || 0);
  const R = rad.length === 1 ? [rad[0], rad[0], rad[0], rad[0]] : rad.length === 2 ? [rad[0], rad[1], rad[0], rad[1]] : rad.length === 3 ? [rad[0], rad[1], rad[2], rad[1]] : rad.slice(0, 4);
  return { h: sheet.offsetHeight, ml: parseFloat(cs.marginLeft) || 0, mr: parseFloat(cs.marginRight) || 0, mb: parseFloat(cs.marginBottom) || 0, r: R };
}
function crMorphCleanup() { // back to class-driven rest: every geometry the morph set clears, so the landing is exactly the CSS geometry
  const sheet = $('createSheet');
  if (sheet) { sheet.style.height = ''; sheet.style.overflow = ''; sheet.style.marginLeft = ''; sheet.style.marginRight = ''; sheet.style.marginBottom = ''; sheet.style.borderRadius = ''; sheet.style.transform = ''; }
  for (const f of Object.keys(CR_FACES)) { const el = crFaceEl(f); if (!el) continue; el.style.position = ''; el.style.top = ''; el.style.left = ''; el.style.right = ''; el.style.bottom = ''; el.style.opacity = ''; }
  crMorph = null;
}
function crSettleMorph() { if (!crMorph) return; cancelSheetSpring($('createSheet')); crMorphCleanup(); syncCrPanel(); } // land an in-flight morph NOW (a grab on the panel head, or a new face decision superseding it)
function crMorphTo(to, opts) { // the face change: one surface springing between resting shapes, contents cross-fading inside; opts carry a drag release's displacement/speed
  const sheet = $('createSheet'); if (!sheet) { syncCrPanel(); return; }
  opts = opts || {};
  crSettleMorph(); // a new decision supersedes an in-flight one - land it first
  const from = crSectorSession.face;
  if (from === to || !sheet.classList.contains('on')) { syncCrPanel(); return; }
  const fromEl = crFaceEl(from), toEl = crFaceEl(to);
  if (!fromEl || !toEl || fromEl.style.display === 'none') { syncCrPanel(); return; }
  const G0 = crGeoOf(sheet); // where the surface rests now
  fromEl.style.display = 'none'; toEl.style.display = ''; // measure the destination: its content in flow, its geometry class on
  crFaceClasses(sheet, to);
  const G1 = crGeoOf(sheet);
  crFaceClasses(sheet, from);
  const mb0 = opts.dy ? -opts.dy : G0.mb; // the finger left the surface dy px below rest: morph bottom starts there, not at rest
  if (!G0.h || !G1.h || (Math.abs(G1.h - G0.h) < 2 && Math.abs(G1.ml - G0.ml) < 1 && Math.abs(G1.mb - mb0) < 1)) { syncCrPanel(); return; } // nothing to travel (or nothing measurable): land the rest state directly
  for (const el of [fromEl, toEl]) { el.style.display = '';
  el.style.position = 'absolute';
  el.style.top = '0px';
  el.style.left = '0px';
  el.style.right = '0px';
  el.style.bottom = '0px';
  } // both contents live inside the one surface for the motion
  fromEl.style.opacity = '1'; toEl.style.opacity = '0';
  sheet.style.transform = '';
  sheet.style.overflow = 'hidden'; sheet.style.height = G0.h + 'px';
  sheet.style.marginLeft = G0.ml + 'px'; sheet.style.marginRight = G0.mr + 'px'; sheet.style.marginBottom = mb0 + 'px';
  sheet.style.borderRadius = G0.r[0] + 'px ' + G0.r[1] + 'px ' + G0.r[2] + 'px ' + G0.r[3] + 'px';
  crMorph = { from, to };
  const L = (a, b, p) => a + (b - a) * p;
  springSheet(sheet, G0.h, G1.h, opts.v0 || 0, h => { // the spring drives the height (its settle thresholds are calibrated for px); every other property follows the same progress
    const p = Math.min(1, Math.max(0, (h - G0.h) / (G1.h - G0.h)));
    sheet.style.height = h + 'px';
    sheet.style.marginLeft = L(G0.ml, G1.ml, p) + 'px'; sheet.style.marginRight = L(G0.mr, G1.mr, p) + 'px';
    sheet.style.marginBottom = L(mb0, G1.mb, p) + 'px';
    sheet.style.borderRadius = L(G0.r[0], G1.r[0], p) + 'px ' + L(G0.r[1], G1.r[1], p) + 'px ' + L(G0.r[2], G1.r[2], p) + 'px ' + L(G0.r[3], G1.r[3], p) + 'px';
    fromEl.style.opacity = String(1 - Math.min(1, p / 0.45));
    toEl.style.opacity = String(Math.min(1, Math.max(0, (p - 0.3) / 0.7)));
  }, () => { crMorphCleanup(); syncCrPanel(); });
}
function crCollapsePanel(fromY, v0) { // tuck the surface away to the bottom bar: the one box contracts, at any pick count, zero included
  if (crSectorSession.collapsed) { syncCrPanel(); return; }
  crSectorSession.collapsed = true;
  const sheet = $('createSheet');
  if (!sheet || !sheet.classList.contains('on')) { syncCrPanel(); return; }
  crMorphTo('strip', { dy: fromY || 0, v0: -(v0 || 0) }); // the height starts shrinking at the finger's speed: its velocity is the drag velocity negated
}
function crExpandPanel() { // Review: the bar hands back to the panel in the same one-object motion, reversed
  if (!crSectorSession.collapsed) return;
  crSectorSession.collapsed = false;
  crMorphTo('panel');
}
function crPendStreet(name, lngLat, run, boundary) { // fail-closed: a shape past coverage after its top-up is pending, never half-known; a wider preparation can complete it
  let openEnd = null;
  // an end is open only when no committed coverage holds it (the top-up's box never becomes coverage)
  if (run && run.line) { for (const end of [run.line[0], run.line[run.line.length - 1]]) { const inside = crCov && crInAnyBox(crCov.boxes, end[0], end[1]); if (!inside) { openEnd = { lat: end[0], lng: end[1] }; break; } } }
  crPending[name] = { osmName: name, lngLat, openEnd };
  if (openEnd) crWanted = { anchor: openEnd, label: 'Prepare wider area' }; // the wider preparation is a real button: it prepares around the street's own open end
  renderCrLists(); crRenderHint();
}
// ---- the city step (Andrew's amendment) STARTS here ----
function crCityNameOf(it) { const a = (it && it.address) || {}; return a.city || a.town || a.village || a.municipality || a.county || String((it && it.display_name) || '').split(',')[0].trim(); }
function crIsPlace(it) { // places only: a city/town/village or an administrative boundary - never a street, POI or postcode area
  if (!it) return false;
  const cls = it.category || it.class; // jsonv2 names this field 'category'; 'class' does not exist in its payloads (reading it silently emptied every result)
  if (cls === 'place') return ['city', 'town', 'village', 'hamlet', 'suburb'].includes(it.type);
  if (cls === 'boundary') return it.type === 'administrative';
  return false;
}
const CR_ON_BOUNDS = { s: 41.6, n: 56.9, w: -95.2, e: -74.3 }; // the city search is Ontario-only: this rectangle bounds the query and the filter's judgement of province-less results
function crInOntario(it) { // the filter is the guarantee: a named province is judged by its word; the rectangle alone leaks border cities
  if (!it) return false;
  const st = it.address && it.address.state;
  if (st) return st === 'Ontario';
  const la = parseFloat(it.lat), lo = parseFloat(it.lon);
  return isFinite(la) && isFinite(lo) && la >= CR_ON_BOUNDS.s && la <= CR_ON_BOUNDS.n && lo >= CR_ON_BOUNDS.w && lo <= CR_ON_BOUNDS.e;
}
function crPickCity(it) {
  const lat = parseFloat(it.lat), lon = parseFloat(it.lon); if (!isFinite(lat) || !isFinite(lon)) return;
  const name = crCityNameOf(it); if (!name) return;
  let bbox = null;
  if (Array.isArray(it.boundingbox) && it.boundingbox.length === 4) { const bb = it.boundingbox.map(Number); if (bb.every(isFinite)) bbox = { s: bb[0], n: bb[1], w: bb[2], e: bb[3] }; }
  const apply = () => {
    crResetCitySearch(); // a pick cancels any held search: its late answer must not land after the pick
    crCity = { name, lat, lon, bbox };
    crAreaGuess = name;
    if (draft && !draft.area) draft.area = name;
    try { lsSet(LS_GLOBAL.lastArea, name) /* write-safe: only the next area suggestion can be stale */; } catch (e) {}
    crEnterPickFromCity();
  };
  if (crCity) { askDiscard(() => { draft = newDraft(); crPending = {}; apply(); }); return; } // the reset is guarded: crPickCity is the one landing both doors share; a first pick keeps its draft
  apply();
}
function crEnterPickFromCity() { // land in the pick stage, fly to the city, start its whole-city preparation (from the cache when saved)
  if (!creating) enterCreate('pick'); else { if (!routeLoaded) parkBootChrome(); else closeRouteMenu(); setCreateStage('pick'); }
  if (map && crCity && crCity.lat != null) { try { map.flyTo({ center: [crCity.lon, crCity.lat], zoom: 12, duration: 900 }); } catch (e) {} }
  crCityPrepare();
  crRenderHint();
}
// ---- the create gate: two doors, then the list ---- the list IS the catalogue; no hardcoded city names
function crRenderCityChoices() {
  const boxEl = $('crCityList'); if (!boxEl) return;
  boxEl.innerHTML = '';
  boxEl.appendChild(routeRowShell('div', 'Loading cities…', 'Getting the city library', { cls: 'crLoadingRow' })); // in flight, the pane shows a stand-in row in the rows' styling: the wait reads as the list arriving
  crPackIndexLoad().then(entries => {
    if (!boxEl.isConnected) return;
    boxEl.innerHTML = '';
    if (!entries || !entries.length) { const d = document.createElement('div');
    d.className = 'rmNote';
    d.textContent = 'The city library isn’t available right now. Go back and use Manual search.';
    boxEl.appendChild(d);
    return;
    } // honest unavailability, and the manual door behind Back still works - the gate never dead-ends
    const last = (lsGet(LS_GLOBAL.lastArea) || '').toLowerCase();
    // the last-used city rides first when held (a convenience, never a requirement; the full list is always there)
    const sorted = entries.slice().sort((a, b) => (((b.name || '').toLowerCase() === last) ? 1 : 0) - (((a.name || '').toLowerCase() === last) ? 1 : 0));
    for (const e of sorted) {
      if (!e || !e.name || !e.slug || !Array.isArray(e.bbox) || e.bbox.length !== 4) continue;
      const b = routeRowShell('button', e.name, null, { chevron: true }); // rows carry the name only: no sub-line (sub null = no .routeArea element, no leftover row height)
      // the last-used tag is its own gold span, trailing the city name on the same row so it stands out
      if (String(e.name).toLowerCase() === last) { const lu = document.createElement('span'); lu.className = 'crLastUsed'; lu.textContent = ' · last used'; const nmEl = b.querySelector('.routeName'); if (nmEl) nmEl.appendChild(lu); }
      b.addEventListener('click', () => crPackPickCity(e));
      boxEl.appendChild(b);
    }
    menuListFade(boxEl); // the feather settles on what the landed list covers
  });
}
function crPackPickCity(e) { // a chooser tap is a city pick through the same crPickCity: every door behaves identically (guard, caching, draft)
  const s = +e.bbox[0], w = +e.bbox[1], n = +e.bbox[2], ee = +e.bbox[3];
  crPickCity({ lat: String((s + n) / 2),
    lon: String((w + ee) / 2),
    boundingbox: [String(s), String(n), String(w), String(ee)],
    display_name: e.name + ', Ontario, Canada',
    address: { city: e.name, state: 'Ontario', country: 'Canada', country_code: 'ca' } });
}
function crOpenCityPane(ret) {
  crResetCitySearch(); // reopening supersedes a held city search too: its late answer must not repopulate the pane (close via crResetCitySearch)
  crCityReturn = ret;
  $('crCityInput').value = ''; const rb = $('crCityResults'); rb.innerHTML = ''; rb.style.height = ''; crCityBoxTok++; // the pane reopens empty at natural height; any swap release pending from the last visit is invalidated with it
  if (creating) { if (!routeLoaded) restoreBootChrome(); else openRouteMenu(); }
  showRmPane('rmCityPane');
}
let crCityTimer = null, crCitySeq = 0, crCityCtl = null;
let crCityOnlineAt = 0; // the last request's moment: the service caps one per second; the online search waits out the remainder
function crResetCitySearch() { // the close owner: bump the sequence, abort the request, clear the debounce; seats keep only their own extras
  crCitySeq++; if (crCityCtl) { try { crCityCtl.abort(); } catch (e) {} crCityCtl = null; }
  if (crCityTimer) { clearTimeout(crCityTimer); crCityTimer = null; }
}
function crCitySearchCurrent(seq, session) { return seq === crCitySeq && session === crSession; } // the city-search LANDING's current-check: sequence AND session (the convention is stated at crSearchCurrent)
function crCitySearchSeqCurrent(seq) { return seq === crCitySeq; } // the catch's current-check: sequence ONLY, deliberately weaker (exitCreate never bumps crCitySeq); the name carries the asymmetry
let crCityBoxTok = 0;
function crCityBoxSwap(build) { // results animate between contents: freeze, swap, transition; measure the target unfrozen, release on the swap's token
  const box = $('crCityResults'); if (!box) return;
  const tok = ++crCityBoxTok;
  const from = box.offsetHeight;
  box.style.height = from + 'px';
  build(box);
  box.style.height = '';
  const target = box.offsetHeight;
  box.style.height = from + 'px';
  void box.offsetHeight; // commit the frozen start, so the transition runs from it
  box.style.height = target + 'px';
  setTimeout(() => { if (tok === crCityBoxTok) box.style.height = ''; }, 480);
}
// skeleton rows pulse while the search flies: the wait is shown, never a blank pane
function crCityShowSkeletons() { crCityBoxSwap(b => { b.innerHTML = ''; for (let i = 0; i < 3; i++) { const d = document.createElement('div'); d.className = 'crSkel'; b.appendChild(d); } }); }
// partial names suggest from a shipped Ontario gazetteer, every entry verified at build time through this search's own discipline
const CR_CITY_GAZETTEER = [
  ["Addington Highlands", 44.90167, -77.31209, 44.5664, 45.2355, -77.5425, -77.033, 2534],
  ["Adelaide Metcalfe", 42.92624, -81.72602, 42.7856, 43.0659, -81.7956, -81.5551, 3011],
  ["Adjala–Tosorontio", 44.13752, -79.94211, 43.9514, 44.3239, -80.0375, -79.8336, 10989],
  ["Admaston/Bromley", 45.49781, -76.85531, 45.308, 45.6876, -77.0473, -76.6629, 2995],
  ["Ajax", 43.85053, -79.02088, 43.8058, 43.9226, -79.0883, -78.9646, 126666],
  ["Alberton Township", 48.58074, -93.52392, 48.527, 48.6491, -93.5836, -93.4499, 954],
  ["Alfred and Plantagenet", 45.54383, -74.98523, 45.442, 45.6457, -75.1639, -74.7792, 9949],
  ["Algonquin Highlands", 45.29467, -78.82555, 45.0267, 45.5615, -78.9727, -78.2481, 2588],
  ["Alnwick/Haldimand", 44.09744, -78.0476, 43.9235, 44.2727, -78.1789, -77.8907, 7473],
  ["Amaranth", 43.98009, -80.23353, 43.8774, 44.0849, -80.337, -80.1306, 4327],
  ["Amherstburg", 42.10133, -83.10865, 41.8387, 42.1913, -83.1497, -82.9674, 23524],
  ["Armour Township", 45.62383, -79.32516, 45.5445, 45.7061, -79.4571, -79.237, 1459],
  ["Arnprior", 45.43351, -76.35437, 45.4022, 45.4659, -76.3873, -76.2897, 9629],
  ["Arran–Elderslie", 44.39808, -81.20007, 44.2591, 44.5449, -81.3384, -81.0694, 6913],
  ["Ashfield–Colborne–Wawanosh", 43.8581, -81.5977, 43.6618, 44.0556, -81.7496, -81.4173, 5884],
  ["Asphodel-Norwood", 44.33664, -78.01036, 44.2596, 44.4152, -78.1162, -77.9011, 4658],
  ["Assiginack Township", 45.74299, -81.81044, 45.5692, 45.8472, -82.1145, -81.7339, 1008],
  ["Athens", 44.62594, -75.95226, 44.5251, 44.7001, -76.033, -75.8513, 3042],
  ["Atikokan", 48.76253, -91.6246, 48.6717, 48.8456, -91.7528, -91.4896, 2642],
  ["Augusta", 44.73899, -75.63448, 44.6089, 44.8762, -75.7854, -75.5178, 7386],
  ["Aurora", 43.99973, -79.46755, 43.9575, 44.0355, -79.4994, -79.3929, 62057],
  ["Aylmer", 42.77323, -80.98366, 42.758, 42.7917, -81.0028, -80.9675, 7699],
  ["Baldwin Township", 46.30076, -81.75366, 46.2788, 46.3654, -81.8172, -81.6905, 579],
  ["Bancroft", 45.05708, -77.85371, 44.9521, 45.1362, -77.9051, -77.6302, 4065],
  ["Barrie", 44.38932, -79.69013, 44.2937, 44.4246, -79.7456, -79.5859, 147829],
  ["Bayham", 42.75, -80.78797, 42.6138, 42.8465, -80.8602, -80.7172, 7096],
  ["Beckwith", 45.08748, -76.08243, 44.9831, 45.1916, -76.2231, -75.941, 9021],
  ["Belleville", 44.24363, -77.36076, 44.1308, 44.3488, -77.4735, -77.2356, 55071],
  ["Billings Township", 45.92405, -82.24786, 45.7683, 46.0619, -82.3503, -82.1144, 753],
  ["Black River-Matheson Township", 48.5355, -80.46468, 48.2761, 48.6311, -80.8131, -80.0185, 2572],
  ["Blandford-Blenheim", 43.24629, -80.59863, 43.1445, 43.3481, -80.7402, -80.4365, 7565],
  ["Blind River", 46.18839, -82.95639, 46.0049, 46.5342, -83.0805, -82.8113, 3422],
  ["Bluewater", 43.46801, -81.61288, 43.3352, 43.6055, -81.7457, -81.4843, 7540],
  ["Bonfield", 46.23238, -79.14772, 46.2124, 46.2524, -79.1677, -79.1277, 2146],
  ["Bonnechere Valley", 45.45617, -77.1387, 45.3325, 45.5811, -77.3924, -76.9064, 3898],
  ["Bracebridge", 45.04151, -79.31099, 44.9156, 45.1797, -79.4437, -78.9359, 17305],
  ["Bradford West Gwillimbury", 44.11424, -79.56477, 44.0129, 44.2109, -79.7129, -79.5104, 42880],
  ["Brampton", 43.68583, -79.75994, 43.6018, 43.8481, -79.8888, -79.6303, 656480],
  ["Brant County", 43.10108, -80.42882, 42.9829, 43.3065, -80.6087, -79.985, 39474],
  ["Brantford", 43.14082, -80.26317, 43.0941, 43.2085, -80.3536, -80.1897, 104688],
  ["Brethour Township", 47.71898, -79.57459, 47.6678, 47.7546, -79.6315, -79.5177, 105],
  ["Brighton", 44.04223, -77.73701, 43.9472, 44.2365, -77.8513, -77.6149, 12108],
  ["Brock", 44.34768, -79.10016, 44.1833, 44.5167, -79.2715, -78.9523, 12567],
  ["Brockton", 44.19682, -81.21925, 44.068, 44.3221, -81.4307, -81.0234, 9784],
  ["Brockville", 44.60392, -75.70168, 44.5652, 44.6347, -75.7358, -75.655, 22116],
  ["Brooke-Alvinston", 42.84478, -81.89751, 42.7566, 42.9313, -82.006, -81.7889, 2359],
  ["Bruce Mines", 46.30056, -83.79111, 46.2754, 46.3099, -83.8016, -83.7328, 582],
  ["Brudenell, Lyndoch and Raglan", 45.32693, -77.42152, 45.1442, 45.5095, -77.636, -77.2133, 1552],
  ["Burk's Falls", 45.6203, -79.40889, 45.6107, 45.6333, -79.4196, -79.3905, 957],
  ["Burlington", 43.32489, -79.79668, 43.2863, 43.4766, -79.9593, -79.7139, 186948],
  ["Caledon", 43.83207, -79.90669, 43.6749, 43.9898, -80.1443, -79.6949, 76581],
  ["Callander", 46.2226, -79.36523, 46.1091, 46.2423, -79.5134, -79.3142, 3964],
  ["Calvin", 46.24459, -78.90642, 46.1872, 46.304, -79.0405, -78.7984, 557],
  ["Cambridge", 43.36005, -80.3123, 43.3324, 43.4723, -80.4131, -80.2515, 138479],
  ["Carleton Place", 45.14034, -76.14657, 45.1208, 45.1563, -76.1698, -76.1069, 12517],
  ["Carling Township", 45.40586, -80.17069, 45.3859, 45.4259, -80.1907, -80.1507, 1491],
  ["Carlow/Mayo", 45.15556, -77.63347, 44.9956, 45.3125, -77.7804, -77.48, 953],
  ["Casey Township", 47.63875, -79.57456, 47.5807, 47.6679, -79.6315, -79.5177, 341],
  ["Casselman", 45.31353, -75.08675, 45.2961, 45.328, -75.1106, -75.0697, 3960],
  ["Cavan-Monaghan", 44.19061, -78.46896, 44.0809, 44.3008, -78.5847, -78.3282, 10016],
  ["Central Elgin", 42.7721, -81.09198, 42.6512, 42.8927, -81.2446, -81.032, 13746],
  ["Central Frontenac", 44.71344, -76.86227, 44.5206, 44.8988, -77.1181, -76.5444, 4892],
  ["Central Huron", 43.66007, -81.54333, 43.5466, 43.7751, -81.7327, -81.3361, 7799],
  ["Central Manitoulin", 45.5484, -82.43741, 45.3386, 45.8234, -82.7572, -81.9624, 2235],
  ["Centre Hastings", 44.41708, -77.44349, 44.3155, 44.5141, -77.553, -77.3309, 4801],
  ["Centre Wellington", 43.71809, -80.37477, 43.5831, 43.8577, -80.5575, -80.2229, 31093],
  ["Chamberlain Township", 47.88851, -79.95093, 47.8415, 47.9355, -80.0175, -79.8756, 311],
  ["Champlain", 45.53629, -74.6457, 45.4424, 45.6402, -74.8236, -74.5615, 8665],
  ["Chapleau Township", 47.84563, -83.40187, 47.8056, 47.8856, -83.4419, -83.3619, 1942],
  ["Chapple Township", 48.77051, -93.98483, 48.6308, 48.9141, -94.1182, -93.8286, 763],
  ["Charlton and Dack", 47.79833, -79.95288, 47.7545, 47.8416, -80.0174, -79.8884, 686],
  ["Chatham-Kent", 42.41833, -82.08984, 42.0599, 42.6515, -82.5516, -81.6242, 103988],
  ["Chatsworth", 44.45608, -80.89788, 44.2884, 44.4962, -81.106, -80.6618, 7080],
  ["Chisholm Township", 46.09833, -79.20573, 46.001, 46.194, -79.319, -79.0931, 1312],
  ["Clarence-Rockland", 45.5248, -75.26075, 45.3644, 45.5886, -75.3415, -75.0795, 26505],
  ["Clarington", 43.96867, -78.65135, 43.8462, 44.0988, -78.872, -78.4319, 101427],
  ["Clearview", 44.36827, -80.06695, 44.2534, 44.4888, -80.2817, -79.8612, 14814],
  ["Cobalt", 47.39623, -79.68567, 47.3878, 47.4071, -79.6958, -79.6611, 989],
  ["Cobourg", 43.9596, -78.16778, 43.9347, 43.9961, -78.2175, -78.1193, 20519],
  ["Cochrane", 49.06667, -81.0173, 48.9714, 49.3194, -81.2668, -80.8762, 5390],
  ["Collingwood", 44.50272, -80.21724, 44.47, 44.7651, -80.3486, -80.1404, 24811],
  ["Conmee Township", 48.48304, -89.68545, 48.4124, 48.5545, -89.7713, -89.5786, 798],
  ["Cornwall", 45.047, -74.73338, 44.9905, 45.0854, -74.8488, -74.6542, 47845],
  ["Cramahe", 44.07073, -77.87122, 43.9629, 44.1778, -77.974, -77.7688, 6509],
  ["Dawn-Euphemia", 42.69397, -82.03907, 42.6246, 42.7621, -82.2451, -81.8351, 1968],
  ["Dawson Township", 48.78372, -94.53874, 48.6812, 48.8839, -94.7043, -94.2511, 399],
  ["Deep River", 46.10133, -77.4876, 46.0133, 46.1294, -77.5282, -77.3323, 4175],
  ["Deseronto", 44.19501, -77.04987, 44.1732, 44.209, -77.0665, -77.0331, 1747],
  ["Dorion Township", 48.7854, -88.56116, 48.7373, 48.8667, -88.7796, -88.4853, 375],
  ["Douro-Dummer", 44.45021, -78.10523, 44.3199, 44.5832, -78.3043, -77.9256, 7632],
  ["Drummond-North Elmsley", 44.9569, -76.21035, 44.814, 45.0949, -76.3834, -76.0288, 8183],
  ["Dryden", 49.7857, -92.83585, 49.75, 49.8151, -92.8613, -92.6333, 7388],
  ["Dubreuilville Township", 48.34908, -84.55105, 48.3091, 48.3891, -84.591, -84.511, 576],
  ["Dutton/Dunwich", 42.66401, -81.50265, 42.5648, 42.7662, -81.6724, -81.3203, 4152],
  ["Dysart et al", 45.20074, -78.40031, 44.964, 45.4413, -78.7403, -78.0711, 7182],
  ["Ear Falls Township", 50.64075, -93.23685, 50.5615, 50.8458, -93.519, -93.1369, 924],
  ["East Ferris Township", 46.18391, -79.27748, 46.1565, 46.3206, -79.3833, -79.176, 4946],
  ["East Garafraxa", 43.83645, -80.26268, 43.7615, 43.9088, -80.3885, -80.1174, 2794],
  ["East Gwillimbury", 44.09575, -79.48978, 44.0637, 44.2233, -79.5317, -79.2762, 34637],
  ["East Hawkesbury", 45.49903, -74.48702, 45.3934, 45.6053, -74.6144, -74.381, 3418],
  ["Edwardsburgh/Cardinal", 44.83123, -75.49699, 44.7099, 44.9565, -75.6471, -75.3573, 7505],
  ["Elizabethtown-Kitley", 44.68249, -75.80833, 44.5037, 44.8623, -76.1099, -75.6356, 9545],
  ["Elliot Lake", 46.37346, -82.65289, 46.272, 46.5359, -82.8279, -82.4362, 11372],
  ["Emo Township", 48.63198, -93.83392, 48.5157, 48.7375, -93.8516, -93.7174, 1204],
  ["Englehart", 47.82557, -79.87336, 47.8197, 47.8342, -79.8885, -79.8623, 1442],
  ["Enniskillen", 42.8449, -82.12092, 42.7566, 42.9326, -82.24, -82.0045, 2825],
  ["Erin", 43.77506, -80.07008, 43.6291, 43.8615, -80.2612, -79.969, 11981],
  ["Espanola", 46.26534, -81.76987, 46.1919, 46.2791, -81.8165, -81.6905, 5185],
  ["Essa", 44.23444, -79.80637, 44.1624, 44.362, -79.9228, -79.7043, 22970],
  ["Essex County", 42.23541, -82.71201, 41.6766, 42.3981, -83.1497, -82.4299, 21216],
  ["Evanturel Township", 47.80508, -79.82424, 47.7545, 47.8417, -79.8885, -79.76, 502],
  ["Faraday", 45.04844, -77.88604, 44.9056, 45.0819, -78.0362, -77.7889, 1612],
  ["Fauquier-Strickland Township", 49.28333, -81.85, 49.2633, 49.3033, -81.87, -81.83, 467],
  ["Fort Erie", 42.91308, -78.91861, 42.832, 42.9853, -79.1226, -78.9059, 32901],
  ["Fort Frances", 48.61144, -93.39676, 48.593, 48.6496, -93.45, -93.3067, 7466],
  ["French River", 46.14889, -80.5003, 46.0176, 46.2792, -80.6955, -80.1395, 2828],
  ["Front of Yonge", 44.5022, -75.85293, 44.4093, 44.5966, -75.966, -75.7777, 2595],
  ["Frontenac Islands", 44.15352, -76.46285, 44.0148, 44.3094, -76.627, -76.1618, 1930],
  ["Gananoque", 44.32962, -76.16267, 44.3159, 44.3471, -76.1857, -76.1446, 5383],
  ["Gauthier Township", 48.14504, -79.82427, 48.1018, 48.189, -79.8896, -79.7591, 151],
  ["Georgian Bluffs", 44.68872, -81.00873, 44.4528, 44.8848, -81.1404, -80.8147, 11100],
  ["Georgina", 44.22802, -79.46444, 44.1816, 44.5049, -79.5197, -79.1561, 47642],
  ["Gillies Township", 48.27542, -89.70068, 48.2244, 48.3146, -89.766, -89.6278, 441],
  ["Goderich", 43.74309, -81.71109, 43.7207, 43.7547, -81.7423, -81.6846, 7881],
  ["Gordon/Barrie Island", 45.9248, -82.61132, 45.8231, 46.0259, -82.7519, -82.3488, 613],
  ["Gore Bay", 45.91679, -82.46409, 45.9025, 45.9269, -82.4867, -82.4499, 808],
  ["Grand Valley", 43.89912, -80.31525, 43.8561, 44.0476, -80.4384, -80.2961, 3851],
  ["Gravenhurst", 44.91741, -79.37313, 44.7728, 45.0052, -79.5343, -79.0623, 13157],
  ["Greater Madawaska", 45.26869, -76.90345, 45.0987, 45.4361, -77.2644, -76.5061, 2864],
  ["Greater Napanee", 44.24739, -76.95055, 44.043, 44.4199, -77.1389, -76.8072, 16879],
  ["Greater Sudbury", 46.49272, -80.99121, 46.1958, 46.9731, -81.5984, -80.5488, 166004],
  ["Greenstone", 49.71888, -86.94932, 49.2871, 50.2301, -88.1688, -86.0889, 4309],
  ["Grey Highlands", 44.35655, -80.46039, 44.171, 44.5374, -80.7033, -80.2291, 10424],
  ["Grimsby", 43.19317, -79.56068, 43.1326, 43.2548, -79.6497, -79.5119, 28883],
  ["Guelph", 43.54605, -80.24933, 43.4738, 43.5944, -80.3269, -80.1534, 143740],
  ["Guelph/Eramosa", 43.59646, -80.25672, 43.4686, 43.7253, -80.41, -80.0854, 13904],
  ["Haldimand County", 42.94554, -79.8362, 42.7781, 43.1322, -80.1854, -79.4359, 49216],
  ["Halton Hills", 43.65129, -79.91422, 43.6113, 43.6913, -79.9542, -79.8742, 62951],
  ["Hamilton", 43.25608, -79.87286, 43.0505, 43.4707, -80.2486, -79.6221, 569353],
  ["Hanover", 44.15207, -81.02796, 44.1337, 44.1825, -81.0413, -80.9837, 7967],
  ["Harley Township", 47.62427, -79.69557, 47.5808, 47.6678, -79.7599, -79.6313, 524],
  ["Harris Township", 47.52634, -79.58048, 47.4727, 47.5809, -79.6313, -79.5103, 530],
  ["Hastings Highlands", 45.23732, -77.94982, 45.0479, 45.4381, -78.1776, -77.6238, 4385],
  ["Havelock-Belmont-Methuen", 44.5788, -77.90199, 44.3893, 44.7693, -78.0706, -77.7274, 5083],
  ["Hawkesbury", 45.61028, -74.60556, 45.5891, 45.6352, -74.641, -74.5779, 10194],
  ["Hearst", 49.69073, -83.66638, 49.6549, 49.7206, -83.759, -83.5704, 4794],
  ["Highlands East", 44.97308, -78.25811, 44.8349, 45.1129, -78.5512, -77.9612, 3830],
  ["Hilliard Township", 47.71836, -79.6957, 47.6677, 47.7546, -79.76, -79.6315, 215],
  ["Hilton Beach", 46.25673, -83.88859, 46.244, 46.2678, -83.8987, -83.8633, 198],
  ["Hilton Township", 46.19246, -83.83037, 46.1027, 46.2783, -83.9672, -83.727, 382],
  ["Hornepayne Township", 49.21814, -84.77529, 49.1781, 49.2581, -84.8153, -84.7353, 968],
  ["Horton", 45.50702, -76.63232, 45.4197, 45.5943, -76.7797, -76.4973, 3182],
  ["Howick", 43.8946, -81.06961, 43.7905, 43.9865, -81.1864, -80.9544, 4045],
  ["Hudson Township", 47.5445, -79.82398, 47.4938, 47.5809, -79.8884, -79.7597, 530],
  ["Huntsville", 45.32639, -79.21843, 45.1415, 45.4698, -79.5017, -79.0551, 21147],
  ["Huron East", 43.62137, -81.29222, 43.4163, 43.8263, -81.5341, -81.0312, 9512],
  ["Huron Shores", 46.29985, -83.38304, 45.9935, 46.355, -83.6549, -83.0648, 1860],
  ["Huron-Kinloss", 44.03441, -81.54707, 43.908, 44.1607, -81.7652, -81.368, 7723],
  ["Ignace Township", 49.41276, -91.65482, 49.3728, 49.4528, -91.6948, -91.6148, 1206],
  ["Ingersoll", 43.03773, -80.88211, 43.0109, 43.0527, -80.9083, -80.8512, 13693],
  ["Innisfil", 44.31509, -79.54611, 44.165, 44.4222, -79.7279, -79.498, 43326],
  ["Iroquois Falls", 48.76722, -80.6771, 48.6209, 48.7984, -80.9434, -80.4183, 4418],
  ["James Township", 47.71783, -80.33953, 47.6663, 47.755, -80.4044, -80.2747, 348],
  ["Jocelyn Township", 46.13949, -83.93915, 46.0568, 46.2374, -84.0776, -83.8425, 314],
  ["Johnson Township", 46.35745, -83.89664, 46.2692, 46.4391, -83.9624, -83.8321, 749],
  ["Joly Township", 45.78857, -79.24785, 45.7061, 45.8709, -79.3657, -79.1299, 293],
  ["Kapuskasing", 49.41667, -82.43333, 49.3553, 49.4349, -82.4775, -82.34, 8057],
  ["Kawartha Lakes", 44.35968, -78.74217, 44.0584, 44.9855, -79.2085, -78.4255, 79247],
  ["Kearney", 45.55548, -79.2241, 45.4698, 45.769, -79.3011, -78.9305, 974],
  ["Kenora", 49.76622, -94.48935, 49.7398, 49.9063, -94.5917, -94.3431, 14967],
  ["Kerns Township", 47.62413, -79.82413, 47.5806, 47.6677, -79.8884, -79.7597, 330],
  ["Killaloe, Hagarty and Richards", 45.55637, -77.41812, 45.5364, 45.5764, -77.4381, -77.3981, 2410],
  ["Killarney", 45.9712, -81.51306, 45.8879, 46.2024, -81.7383, -80.5989, 397],
  ["Kincardine", 44.17764, -81.63487, 44.089, 44.4061, -81.6579, -81.2958, 12268],
  ["King", 44.00348, -79.60477, 43.8744, 44.1505, -79.7755, -79.4778, 27333],
  ["Kingston", 44.30542, -76.42838, 44.2076, 44.4802, -76.7126, -76.2338, 132485],
  ["Kingsville", 42.0379, -82.73966, 41.6766, 42.1773, -82.8462, -82.6357, 22119],
  ["Kirkland Lake", 48.15418, -80.03128, 48.1017, 48.2763, -80.1465, -79.8881, 7750],
  ["Kitchener", 43.45129, -80.49278, 43.3539, 43.5068, -80.5735, -80.3784, 256885],
  ["La Vallee Township", 48.61556, -93.62819, 48.5956, 48.6356, -93.6482, -93.6082, 788],
  ["Laird Township", 46.3982, -84.06788, 46.3782, 46.4182, -84.0879, -84.0479, 1121],
  ["Lake of Bays", 45.32705, -79.00543, 45.307, 45.347, -79.0254, -78.9854, 3759],
  ["Lakeshore", 42.30383, -82.81893, 42.1654, 42.3981, -82.8774, -82.4299, 40410],
  ["Lambton Shores", 43.19264, -81.90202, 43.0657, 43.3196, -82.0873, -81.7432, 11876],
  ["Lanark Highlands", 45.08755, -76.4856, 44.8579, 45.3118, -76.7691, -76.2277, 5737],
  ["Larder Lake Township", 48.09942, -79.71923, 48.0794, 48.1194, -79.7392, -79.6992, 745],
  ["LaSalle", 42.24506, -83.06065, 42.2051, 42.2851, -83.1007, -83.0207, 32721],
  ["Latchford", 47.32858, -79.81018, 47.1737, 47.3494, -79.8563, -79.6315, 355],
  ["Laurentian Hills", 45.95515, -77.51786, 45.7713, 46.1984, -77.7374, -77.2763, 2885],
  ["Laurentian Valley", 45.74862, -77.26798, 45.6379, 45.8582, -77.5018, -76.9731, 9450],
  ["Leamington", 42.05314, -82.59977, 41.6766, 42.1717, -82.6742, -82.4579, 29680],
  ["Leeds and the Thousand Islands", 44.4601, -76.07104, 44.2807, 44.6386, -76.2548, -75.8521, 9804],
  ["Limerick", 44.90454, -77.67332, 44.8136, 44.9956, -77.7892, -77.5562, 436],
  ["Lincoln", 43.17355, -79.41598, 43.0923, 43.2548, -79.5142, -79.3104, 25719],
  ["London", 42.98367, -81.24961, 42.8246, 43.073, -81.3907, -81.1071, 422324],
  ["Loyalist", 44.20912, -76.73314, 44.0452, 44.3741, -76.9042, -76.5776, 17943],
  ["Lucan Biddulph", 43.21985, -81.3589, 43.1431, 43.2929, -81.4689, -81.2245, 5680],
  ["Macdonald, Meredith and Aberdeen Additional Township", 46.47937, -83.97979, 46.4312, 46.5314, -84.1368, -83.838, 1513],
  ["Machar Township", 45.87206, -79.47212, 45.7838, 45.949, -79.5872, -79.351, 969],
  ["Machin Township", 49.79297, -93.22489, 49.7131, 49.8875, -93.4709, -93.0697, 1012],
  ["Madawaska Valley", 45.5166, -77.73452, 45.3154, 45.7177, -77.9101, -77.4678, 3927],
  ["Madoc", 44.5818, -77.50767, 44.4786, 44.6898, -77.6301, -77.3823, 2233],
  ["Magnetawan", 45.6652, -79.64385, 45.4539, 45.7838, -79.8389, -79.4571, 1753],
  ["Manitouwadge Township", 49.12154, -85.83841, 49.0815, 49.1615, -85.8784, -85.7984, 1974],
  ["Mapleton", 43.71747, -80.68926, 43.589, 43.8454, -80.8737, -80.4494, 10839],
  ["Marathon", 48.72093, -86.3716, 48.692, 48.8004, -86.5028, -86.235, 3138],
  ["Markham", 43.85637, -79.33768, 43.798, 43.9625, -79.4287, -79.1702, 338503],
  ["Markstay-Warren", 46.49351, -80.49242, 46.3624, 46.6243, -80.693, -80.2907, 2708],
  ["Marmora and Lake", 44.62501, -77.72396, 44.4365, 44.8136, -77.8879, -77.5548, 4267],
  ["Matachewan Township", 47.93942, -80.6473, 47.8413, 48.016, -81.0738, -80.4416, 268],
  ["Mattawa", 46.3173, -78.70331, 46.3029, 46.3237, -78.7255, -78.6864, 1881],
  ["Mattawan", 46.36902, -78.82903, 46.2973, 46.4413, -78.9356, -78.7081, 153],
  ["Mattice-Val Côté Township", 49.64373, -83.40363, 49.6237, 49.6637, -83.4236, -83.3836, 542],
  ["McDougall Township", 45.46936, -80.03544, 45.3214, 45.5615, -80.1577, -79.8863, 2744],
  ["McGarry Township", 48.1498, -79.58429, 48.1012, 48.188, -79.6512, -79.5176, 579],
  ["McKellar Township", 45.50799, -79.91926, 45.488, 45.528, -79.9393, -79.8993, 1419],
  ["McMurrich/Monteith Township", 45.45059, -79.50272, 45.3541, 45.5403, -79.6595, -79.3427, 907],
  ["McNab/Braeside", 45.41323, -76.50873, 45.31, 45.5164, -76.6423, -76.3383, 7591],
  ["Meaford", 44.60693, -80.59165, 44.4746, 44.8849, -80.9257, -80.5021, 11485],
  ["Melancthon", 44.14831, -80.28445, 44.0393, 44.2573, -80.4229, -80.1718, 3132],
  ["Merrickville-Wolford", 44.86533, -75.84494, 44.7588, 44.9681, -76.0044, -75.6958, 3135],
  ["Middlesex Centre", 43.00219, -81.45454, 42.8061, 43.198, -81.5946, -81.1786, 18928],
  ["Midland", 44.75015, -79.88571, 44.7015, 44.803, -79.9505, -79.8111, 17817],
  ["Milton", 43.51367, -79.88282, 43.4173, 43.6288, -80.1611, -79.7248, 132979],
  ["Minden Hills", 44.94725, -78.72993, 44.7538, 45.1451, -79.001, -78.4831, 6971],
  ["Minto", 43.83413, -80.84768, 43.8221, 44.0043, -80.9915, -80.7418, 9094],
  ["Mississauga", 43.58847, -79.64366, 43.479, 43.7371, -79.8103, -79.5386, 717961],
  ["Mississippi Mills", 45.25133, -76.28996, 45.0919, 45.4094, -76.5038, -76.0751, 14740],
  ["Mono", 43.94622, -80.10423, 43.9227, 44.1232, -80.1716, -79.9512, 9421],
  ["Montague", 44.97169, -75.96802, 44.8684, 45.0723, -76.1067, -75.816, 3914],
  ["Moonbeam Township", 49.34388, -82.16004, 49.2761, 49.4495, -82.2771, -82.0761, 1157],
  ["Moosonee", 51.26707, -80.65063, 51.1421, 51.4039, -80.8664, -80.4319, 1512],
  ["Morley Township", 48.82194, -94.18462, 48.6443, 49.001, -94.2548, -94.0945, 493],
  ["Morris-Turnberry", 43.82188, -81.27623, 43.6774, 43.9587, -81.425, -81.1511, 3590],
  ["Mulmur", 44.18995, -80.10236, 44.0843, 44.2949, -80.2121, -79.9925, 3571],
  ["Municipality of Northern Bruce Peninsula", 45.13568, -81.44689, 44.8551, 45.362, -81.794, -81.0361, 4404],
  ["Muskoka Lakes Township", 45.11781, -79.56599, 44.854, 45.3801, -79.7754, -79.3529, 7652],
  ["Nairn and Hyman Township", 46.33311, -81.58327, 46.3131, 46.3531, -81.6033, -81.5633, 373],
  ["Neebing", 48.14455, -89.31266, 47.9743, 48.3259, -89.766, -88.7787, 2241],
  ["New Tecumseth", 44.15424, -79.86899, 43.977, 44.1855, -79.8913, -79.6702, 43948],
  ["Newbury", 42.68456, -81.79932, 42.6754, 42.6931, -81.8105, -81.7875, 440],
  ["Newmarket", 44.05626, -79.46171, 44.0161, 44.0835, -79.5088, -79.4117, 87942],
  ["Niagara Falls", 43.10656, -79.0639, 42.9593, 43.1479, -79.1773, -78.9996, 94415],
  ["Niagara-on-the-Lake", 43.25561, -79.07233, 43.1404, 43.266, -79.2036, -79.0427, 19088],
  ["Nipigon Township", 49.01498, -88.26623, 48.9664, 49.0392, -88.4327, -88.2348, 1473],
  ["Nipissing Township", 46.09554, -79.51417, 46.0755, 46.1155, -79.5342, -79.4942, 1769],
  ["Norfolk County", 42.79715, -80.45384, 42.5313, 43.0317, -80.7446, -80.0337, 67490],
  ["North Algona Wilberforce", 45.60719, -77.2222, 45.4985, 45.7185, -77.4545, -76.9713, 3111],
  ["North Bay", 46.30921, -79.46076, 46.2272, 46.447, -79.5, -79.257, 52662],
  ["North Dumfries", 43.3217, -80.36866, 43.2668, 43.3972, -80.506, -80.1893, 10619],
  ["North Dundas", 45.09082, -75.37002, 44.9563, 45.2182, -75.5951, -75.1566, 11304],
  ["North Frontenac", 44.98506, -76.87964, 44.764, 45.222, -77.2218, -76.632, 2285],
  ["North Glengarry", 45.34932, -74.67828, 45.1886, 45.5091, -74.9167, -74.4385, 10144],
  ["North Grenville", 44.98584, -75.64483, 44.8456, 45.1258, -75.8198, -75.4857, 17964],
  ["North Huron", 43.82492, -81.42656, 43.7278, 43.9218, -81.5318, -81.2946, 5052],
  ["North Kawartha", 44.73076, -78.14223, 44.5465, 44.9137, -78.3326, -77.8854, 2877],
  ["North Middlesex", 43.15216, -81.62632, 43.0339, 43.2707, -81.8243, -81.4401, 6307],
  ["North Perth", 43.69123, -80.98356, 43.5479, 43.8447, -81.1474, -80.7605, 15538],
  ["North Stormont", 45.21648, -75.03347, 45.087, 45.3434, -75.259, -74.7868, 7400],
  ["Northeastern Manitoulin and the Islands", 45.98102, -81.92661, 45.3607, 46.0996, -82.1459, -81.071, 2641],
  ["Norwich", 42.9877, -80.59756, 42.8551, 43.1516, -80.7537, -80.5054, 11151],
  ["O'Connor Township", 48.36214, -89.70054, 48.3103, 48.4133, -89.7659, -89.6323, 689],
  ["Oakville", 43.44744, -79.66667, 43.3649, 43.5284, -79.811, -79.6199, 213759],
  ["Oil Springs", 42.78382, -82.12691, 42.7712, 42.7962, -82.135, -82.0966, 647],
  ["Oliver Paipoonge", 48.40233, -89.53092, 48.2892, 48.516, -89.638, -89.3885, 6035],
  ["Opasatika Township", 49.52877, -82.86713, 49.4493, 49.5795, -83.0784, -82.7623, 200],
  ["Orangeville", 43.91932, -80.09738, 43.8892, 43.9354, -80.1459, -80.0658, 30167],
  ["Orillia", 44.60661, -79.41693, 44.5672, 44.6442, -79.4757, -79.3693, 33411],
  ["Oro-Medonte", 44.54457, -79.54891, 44.3841, 44.7052, -79.7992, -79.2715, 23017],
  ["Oshawa", 43.89756, -78.86353, 43.8321, 44.0474, -78.9588, -78.7879, 175383],
  ["Otonabee–South Monaghan", 44.24335, -78.21511, 44.1194, 44.3656, -78.3874, -78.061, 7087],
  ["Ottawa", 45.42088, -75.69011, 44.9618, 45.5377, -76.3556, -75.2466, 1017449],
  ["Owen Sound", 44.56781, -80.94301, 44.5409, 44.6095, -80.9637, -80.8919, 21612],
  ["Papineau-Cameron Township", 46.19622, -78.47498, 46.0717, 46.3212, -78.8348, -78.329, 982],
  ["Parry Sound", 45.34361, -80.03374, 45.326, 45.3759, -80.0741, -80.0038, 6879],
  ["Pelee Township", 41.7737, -82.66246, 41.6814, 41.8505, -83.0024, -82.6061, 230],
  ["Pelham", 43.04443, -79.28443, 42.9657, 43.1086, -79.3902, -79.2674, 18192],
  ["Pembroke", 45.82097, -77.11154, 45.7845, 45.8476, -77.1598, -77.0732, 14364],
  ["Penetanguishene", 44.7688, -79.93395, 44.7525, 44.8299, -79.9599, -79.842, 10077],
  ["Perry Township", 45.5116, -79.2931, 45.4238, 45.5871, -79.4083, -79.1726, 2650],
  ["Perth", 44.89924, -76.24873, 44.8809, 44.9242, -76.2823, -76.2247, 6469],
  ["Perth East", 43.49484, -80.97356, 43.2902, 43.699, -81.1331, -80.7358, 12595],
  ["Perth South", 43.31171, -81.13647, 43.2033, 43.4201, -81.3638, -80.9369, 3776],
  ["Petawawa", 45.89843, -77.28266, 45.8095, 45.9833, -77.4229, -77.1652, 18160],
  ["Peterborough", 44.3048, -78.31995, 44.2526, 44.3785, -78.388, -78.2683, 83651],
  ["Petrolia", 42.882, -82.14958, 42.869, 42.9003, -82.1637, -82.1161, 6013],
  ["Pickering", 43.83577, -79.09058, 43.7931, 44.0108, -79.22, -79.0086, 99186],
  ["Pickle Lake", 51.46481, -90.19253, 51.4432, 51.4839, -90.2319, -90.172, 398],
  ["Plummer Additional Township", 46.27233, -83.74194, 46.1087, 46.4405, -83.8383, -83.6436, 757],
  ["Plympton-Wyoming", 43.06997, -82.15292, 42.9288, 43.1187, -82.2337, -82.001, 8308],
  ["Point Edward", 42.9979, -82.41329, 42.9857, 43.0026, -82.4246, -82.3945, 1930],
  ["Port Colborne", 42.88624, -79.25139, 42.8567, 42.9595, -79.2813, -79.1153, 20033],
  ["Port Hope", 43.95158, -78.29397, 43.8989, 44.1199, -78.5085, -78.2602, 17294],
  ["Powassan", 46.08145, -79.36111, 45.9498, 46.1478, -79.4521, -79.2326, 3346],
  ["Prescott", 44.71841, -75.51917, 44.6957, 44.7338, -75.5367, -75.4965, 4078],
  ["Prince Edward County", 44.03183, -77.24693, 43.7982, 44.1855, -77.6279, -76.4997, 25704],
  ["Prince Township", 46.57133, -84.5781, 46.5202, 46.6076, -84.7244, -84.4656, 975],
  ["Puslinch", 43.47718, -80.11374, 43.387, 43.5677, -80.3028, -80.0338, 7944],
  ["Quinte West", 44.09882, -77.57486, 43.9929, 44.3144, -77.7532, -77.4116, 46560],
  ["Rainy River", 48.72268, -94.56482, 48.7143, 48.7324, -94.5907, -94.5485, 752],
  ["Ramara Township", 44.62507, -79.25539, 44.4666, 44.7947, -79.4032, -79.0821, 10377],
  ["Red Lake", 51.01894, -93.82736, 50.9308, 51.1926, -93.9664, -93.4859, 4094],
  ["Red Rock Township", 48.94254, -88.25921, 48.9025, 48.9825, -88.2992, -88.2192, 895],
  ["Renfrew", 45.47204, -76.68386, 45.4514, 45.4938, -76.7153, -76.633, 8190],
  ["Richmond Hill", 43.88012, -79.43929, 43.8275, 43.9777, -79.4855, -79.3709, 202022],
  ["Rideau Lakes", 44.69567, -76.2571, 44.4906, 44.9003, -76.5221, -75.9704, 10883],
  ["Russell", 45.25732, -75.35833, 45.1821, 45.3561, -75.4259, -75.2012, 19598],
  ["Ryerson Township", 45.57979, -79.50847, 45.499, 45.6642, -79.6267, -79.3924, 745],
  ["Sables-Spanish Rivers Township", 46.18149, -81.95016, 45.997, 46.3661, -82.3139, -81.8123, 3237],
  ["Sarnia", 42.97438, -82.40353, 42.9118, 43.0386, -82.46, -82.2299, 72047],
  ["Saugeen Shores", 44.49525, -81.37133, 44.3153, 44.5203, -81.5207, -81.2835, 15908],
  ["Sault Ste. Marie", 46.51266, -84.33303, 46.4529, 46.6123, -84.6273, -84.2259, 72051],
  ["Schreiber Township", 48.81146, -87.26274, 48.7715, 48.8515, -87.3027, -87.2227, 1039],
  ["Scugog", 44.11506, -78.90599, 44.0092, 44.2224, -79.1225, -78.7032, 21581],
  ["Seguin Township", 45.32113, -79.85288, 45.1687, 45.4735, -80.0445, -79.5982, 5280],
  ["Selwyn", 44.42623, -78.36948, 44.2904, 44.5589, -78.4943, -78.1582, 18653],
  ["Severn", 44.75469, -79.51492, 44.6121, 44.8971, -79.7232, -79.2932, 14576],
  ["Shelburne", 44.07847, -80.20343, 44.0679, 44.0935, -80.2235, -80.1778, 8994],
  ["Shuniah", 48.5547, -88.98891, 48.3849, 48.7381, -89.1885, -88.4296, 3247],
  ["Sioux Lookout", 50.1001, -91.91903, 49.9733, 50.1341, -92.2772, -91.7236, 5839],
  ["Sioux Narrows-Nestor Falls Township", 49.11098, -93.92615, 49.091, 49.131, -93.9462, -93.9062, 727],
  ["Smiths Falls", 44.90133, -76.02121, 44.8771, 44.9142, -76.0378, -75.97, 9254],
  ["Smooth Rock Falls", 49.2768, -81.63119, 49.189, 49.3195, -81.6681, -81.4701, 1200],
  ["South Algonquin Township", 45.49398, -78.08493, 45.3104, 45.6721, -78.2735, -77.7752, 1055],
  ["South Bruce", 44.03197, -81.19889, 43.9273, 44.1244, -81.4074, -80.9892, 5880],
  ["South Bruce Peninsula", 44.63109, -81.26876, 44.5195, 44.9112, -81.3646, -81.0104, 9137],
  ["South Dundas", 44.94855, -75.26477, 44.7962, 45.087, -75.4859, -75.0433, 11044],
  ["South Frontenac", 44.5404, -76.48155, 44.3387, 44.7408, -76.8366, -76.2521, 20188],
  ["South Glengarry", 45.18698, -74.55401, 45.0188, 45.3562, -74.7873, -74.3201, 13330],
  ["South Huron", 43.33238, -81.52918, 43.2365, 43.4241, -81.7774, -81.2868, 10063],
  ["South River", 45.84124, -79.38034, 45.8312, 45.8549, -79.3992, -79.3556, 1101],
  ["South Stormont", 45.06285, -74.95224, 44.9408, 45.188, -75.1567, -74.7084, 13570],
  ["South-West Oxford", 42.97844, -80.82551, 42.8296, 43.1218, -80.9473, -80.705, 7583],
  ["Southgate", 44.09883, -80.59656, 43.9814, 44.2177, -80.8137, -80.3609, 8716],
  ["Southwest Middlesex", 42.74257, -81.70352, 42.6074, 42.8778, -81.8355, -81.4724, 5893],
  ["Southwold", 42.74158, -81.33192, 42.6401, 42.8471, -81.4867, -81.2097, 4851],
  ["Spanish", 46.19324, -82.34731, 46.0188, 46.2778, -82.4372, -82.3111, 670],
  ["Springwater", 44.49353, -79.83221, 44.3385, 44.6485, -79.9848, -79.6427, 21701],
  ["St. Catharines", 43.15798, -79.2441, 43.1067, 43.25, -79.3209, -79.1778, 136803],
  ["St. Charles", 46.36304, -80.41718, 46.2441, 46.4501, -80.569, -80.3062, 1357],
  ["St. Clair", 42.77822, -82.35464, 42.6267, 42.9234, -82.5105, -82.234, 14659],
  ["St. Marys", 43.25709, -81.14086, 43.2347, 43.2733, -81.1684, -81.1115, 7386],
  ["St. Thomas", 42.77902, -81.19299, 42.7421, 42.8129, -81.2405, -81.1204, 42840],
  ["Stirling-Rawdon", 44.37572, -77.59914, 44.2722, 44.4791, -77.7274, -77.4729, 5015],
  ["Stone Mills", 44.45824, -76.93987, 44.2779, 44.6385, -77.1905, -76.7286, 7826],
  ["Stratford", 43.37009, -80.9818, 43.3387, 43.4007, -81.0263, -80.9379, 33232],
  ["Strathroy-Caradoc", 42.90647, -81.55485, 42.808, 43.005, -81.6816, -81.3876, 23871],
  ["Strong Township", 45.75, -79.41452, 45.6642, 45.8253, -79.5223, -79.3011, 1566],
  ["Sundridge", 45.77108, -79.39577, 45.7598, 45.7824, -79.4058, -79.3766, 938],
  ["Tarbutt Township", 46.35946, -84.00008, 46.3053, 46.4167, -84.1059, -83.9533, 573],
  ["Tay", 44.71588, -79.77138, 44.6329, 44.7999, -79.8812, -79.6653, 11091],
  ["Tay Valley", 44.84882, -76.41507, 44.7029, 44.9959, -76.6087, -76.1884, 5925],
  ["Tecumseh", 42.3118, -82.8862, 42.1798, 42.3674, -83.0006, -82.8408, 23300],
  ["Tehkummah Township", 45.656, -82.01412, 45.5, 45.6746, -82.1188, -81.9616, 450],
  ["Temagami", 47.06264, -79.78958, 46.7117, 47.2341, -80.2913, -79.6307, 862],
  ["Temiskaming Shores", 47.51256, -79.6756, 47.407, 47.5809, -79.7598, -79.5641, 9634],
  ["Terrace Bay Township", 48.78244, -87.10236, 48.4917, 48.8656, -87.2322, -86.92, 1528],
  ["Thames Centre", 43.10545, -81.1402, 42.8852, 43.2314, -81.2424, -80.8987, 13980],
  ["The Archipelago Township", 45.15174, -80.26661, 44.9733, 45.6866, -81.0723, -79.7754, 979],
  ["The Blue Mountains", 44.67217, -80.42958, 44.3728, 44.9733, -80.5999, -80.2664, 9390],
  ["The Nation", 45.38483, -74.99866, 45.2217, 45.5472, -75.2693, -74.6921, 13350],
  ["The North Shore Township", 46.08802, -82.63579, 46.0114, 46.2772, -82.8439, -82.4362, 531],
  ["Thessalon", 46.25786, -83.55754, 46.2349, 46.275, -83.5832, -83.5261, 1260],
  ["Thornloe", 47.66759, -79.76009, 47.6532, 47.6822, -79.7815, -79.7491, 92],
  ["Thorold", 43.12491, -79.20059, 43.0267, 43.1406, -79.2872, -79.1686, 23816],
  ["Thunder Bay", 48.40641, -89.2598, 48.283, 48.515, -89.4276, -89.0608, 108843],
  ["Tillsonburg", 42.85949, -80.7265, 42.824, 42.8891, -80.7618, -80.7004, 18615],
  ["Timmins", 48.47747, -81.33041, 48.2765, 48.7117, -81.7276, -80.8114, 41145],
  ["Tiny", 44.73829, -80.1271, 44.5316, 44.9418, -80.5159, -79.8258, 12966],
  ["Toronto", 43.65348, -79.38393, 43.5796, 43.8554, -79.6393, -79.1132, 2794356],
  ["Trent Hills", 44.2922, -77.82218, 44.148, 44.4365, -78.0309, -77.6396, 13861],
  ["Trent Lakes", 44.66303, -78.42532, 44.4537, 44.8698, -78.655, -78.2071, 6439],
  ["Tudor and Cashel", 44.94623, -77.51812, 44.646, 45.0339, -77.7204, -77.4076, 740],
  ["Tweed", 44.47649, -77.31196, 44.3494, 44.8995, -77.5682, -77.0554, 6067],
  ["Uxbridge", 44.10885, -79.12268, 43.9709, 44.2632, -79.328, -79.048, 21556],
  ["Val Rita-Harty Township", 49.48571, -82.61997, 49.3985, 49.5796, -82.7625, -82.4774, 757],
  ["Vaughan", 43.79415, -79.5268, 43.7498, 43.9244, -79.7107, -79.42, 323103],
  ["Wainfleet", 42.92826, -79.38138, 42.8535, 43.0115, -79.5838, -79.2803, 6887],
  ["Warwick", 42.9481, -81.88027, 42.9303, 43.0978, -82.006, -81.7888, 3641],
  ["Wasaga Beach", 44.52248, -80.02032, 44.452, 44.623, -80.1769, -79.9649, 24862],
  ["Waterloo", 43.46527, -80.5223, 43.4323, 43.5312, -80.6261, -80.4674, 121436],
  ["Wawa", 47.99293, -84.77402, 47.8338, 48.1067, -84.9229, -84.6167, 2705],
  ["Welland", 42.99222, -79.24842, 42.9193, 43.0427, -79.2908, -79.1672, 55750],
  ["Wellesley", 43.55946, -80.7188, 43.4681, 43.6484, -80.869, -80.6081, 11318],
  ["Wellington North", 43.91082, -80.58399, 43.7836, 44.026, -80.7713, -80.3879, 12431],
  ["West Elgin", 42.56786, -81.64383, 42.4359, 42.7025, -81.835, -81.4981, 5060],
  ["West Grey", 44.15443, -80.87964, 43.9679, 44.3424, -81.0694, -80.6237, 13131],
  ["West Lincoln Township", 43.07247, -79.56673, 42.9838, 43.1631, -79.754, -79.3853, 15454],
  ["West Nipissing", 46.37378, -79.98854, 46.105, 46.7117, -80.3552, -79.632, 14583],
  ["West Perth", 43.47501, -81.25136, 43.3183, 43.6286, -81.4431, -81.0273, 9038],
  ["Westport", 44.67846, -76.39746, 44.6625, 44.6849, -76.4135, -76.3884, 634],
  ["Whitby", 43.87982, -78.94218, 43.8174, 44.0288, -79.0473, -78.8747, 138501],
  ["Whitchurch-Stouffville", 43.97155, -79.24674, 43.9232, 44.1013, -79.4204, -79.2174, 49864],
  ["White River Township", 48.5933, -85.28447, 48.5391, 48.627, -85.3322, -85.1875, 557],
  ["Whitestone", 45.68573, -80.05555, 45.5096, 45.8586, -80.2963, -79.6921, 1075],
  ["Wilmot", 43.39577, -80.6352, 43.311, 43.4797, -80.7956, -80.5036, 21429],
  ["Windsor", 42.28585, -82.97807, 42.2342, 42.3568, -83.1148, -82.8911, 229660],
  ["Wollaston", 44.86101, -77.83947, 44.7699, 44.9519, -77.9579, -77.7204, 721],
  ["Woodstock", 43.13011, -80.7563, 43.0943, 43.1778, -80.7902, -80.6562, 46705],
  ["Woolwich", 43.56655, -80.49952, 43.4438, 43.6896, -80.6261, -80.3063, 26999],
  ["Zorra", 43.14419, -80.95448, 42.9857, 43.3009, -81.1322, -80.8057, 8628]
];
function crCityGazKey(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[.''\u2019]/g, '').replace(/[-\u2013/]/g, ' ').replace(/\s+/g, ' ').trim(); }
const CR_CITY_GAZ_KEYS = CR_CITY_GAZETTEER.map(e => crCityGazKey(e[0]));
function crCityLocalMatches(q) {
  const k = crCityGazKey(q); if (k.length < 3) return [];
  const head = [], word = [];
  for (let i = 0; i < CR_CITY_GAZETTEER.length; i++) {
    const nk = CR_CITY_GAZ_KEYS[i];
    if (nk.startsWith(k)) head.push(i);
    else if (nk.split(' ').some(w => w.startsWith(k))) word.push(i);
  }
  const byPop = (a, b) => (CR_CITY_GAZETTEER[b][7] - CR_CITY_GAZETTEER[a][7]) || (a - b);
  head.sort(byPop); word.sort(byPop);
  return head.concat(word).slice(0,
    6).map(i => { const e = CR_CITY_GAZETTEER[i]; return { display_name: e[0] + ', Ontario, Canada',
      category: 'boundary',
      type: 'administrative',
      lat: String(e[1]),
      lon: String(e[2]),
      boundingbox: [String(e[3]), String(e[4]), String(e[5]), String(e[6])],
      address: { city: e[0], state: 'Ontario', country: 'Canada', country_code: 'ca' } }; });
  // the service's own item shape, so the row renderer and crPickCity consume a suggestion exactly like a service row
}
function crCityResultRow(it, i) { // one city result row, shared by the type-ahead and the online search: the two renders must never drift apart
  const dn = it.display_name || '', cut = dn.indexOf(',');
  // search results wear the city list's row: name on its own line, the rest small and dim under it
  const row = routeRowShell('button', cut > 0 ? dn.slice(0, cut).trim() : dn, (cut > 0 && dn.slice(cut + 1).trim()) ? dn.slice(cut + 1).trim() : null);
  row.classList.add('crRowIn'); row.style.animationDelay = (i * 55) + 'ms'; // the approved stagger: each row settles in a beat after the one above it (the .crRowIn keyframes, head.html)
  row.addEventListener('click', () => crPickCity(it));
  return row;
}
function crRunCityTypeahead() { // typing answers from the gazetteer; the online search fires only on a settled zero-match word
  const q = $('crCityInput').value.trim();
  if (q.length < 3) { crCityBoxSwap(b => { b.innerHTML = ''; }); return; } // the input event already invalidated through the owner; this seat only clears
  const places = crCityLocalMatches(q);
  if (!places.length) { crRunCitySearch(); return; } // zero bundled matches: the settled word goes to the service on its own
  crCityBoxSwap(b => {
    b.innerHTML = '';
    places.forEach((it, i) => b.appendChild(crCityResultRow(it, i)));
  });
}
async function crRunCitySearch() {
  const input = $('crCityInput'), settledText = input.value;
  const q = settledText.trim();
  if (q.length < 3) { crResetCitySearch(); crCityBoxSwap(b => { b.innerHTML = ''; }); return; } // a cleared query invalidates like every change (bump + abort via crResetCitySearch); the clear leaves through animation
  const seq = ++crCitySeq, session = crSession, landError = landIfCurrent(seq, crCitySearchSeqCurrent), landSearch = landIfCurrent({ seq, session }, token => crCitySearchCurrent(token.seq, token.session));
  const landRequest = landIfCurrent(settledText, text => landSearch() && input.value === text);
  if (crCityCtl) { try { crCityCtl.abort(); } catch (e) {} }
  const ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null; crCityCtl = ctl;
  crCityShowSkeletons();
  try {
    const waitMs = 1000 - (Date.now() - crCityOnlineAt); // the service caps one request per second: a search inside the second waits out the remainder
    if (waitMs > 0) await new Promise(r => setTimeout(r, waitMs));
    if (!landRequest()) return; // typed on, cleared or picked during the wait: the settled word is gone, no request fires
    crCityOnlineAt = Date.now();
    const r = await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&featuretype=city&limit=6&countrycodes=ca&viewbox=' + [CR_ON_BOUNDS.w,
      CR_ON_BOUNDS.n,
      CR_ON_BOUNDS.e,
      CR_ON_BOUNDS.s].join(',') + '&bounded=1&q=' + encodeURIComponent(q),
      { headers: { 'Accept': 'application/json' }, signal: ctl ? ctl.signal : undefined });
    // Beta 1.229 (Andrew's standing rule): Canada-only at the service, Ontario-bounded - and the filter below is the guarantee on top
    if (!r.ok) throw new Error('city search HTTP ' + r.status);
    const list = await r.json();
    if (!landSearch()) return; // superseded, or the creation it belonged to has closed (CG-PF-05)
    const places = (Array.isArray(list) ? list : []).filter(crIsPlace).filter(crInOntario);
    const seen = new Set(places.map(it => crCityGazKey(crCityNameOf(it)))); // the gazetteer fills only names the service did not return: a city the service named is never suggested twice
    for (const loc of crCityLocalMatches(q)) { if (places.length >= 6) break; const lk = crCityGazKey(loc.address.city); if (!seen.has(lk)) { seen.add(lk); places.push(loc); } }
    crCityBoxSwap(b => {
      b.innerHTML = '';
      places.forEach((it, i) => b.appendChild(crCityResultRow(it, i)));
      // an empty answer SAYS so in the pane: rendering nothing reads as a dead app
      if (!places.length) { const d = document.createElement('div'); d.className = 'rmNote'; d.textContent = 'No city matched that search. Check the spelling, or go Back and pick from the list.'; b.appendChild(d); }
    });
  // a failed search resolves through the animation: the skeletons leave by the glide, never a pop, never stuck
  } catch (e) { if (landError() && !(e && e.name === 'AbortError')) { crCityBoxSwap(b => { b.innerHTML = ''; }); } }
}

// ---- geometry cache ---- stretches compute once per geometry change, shared by every consumer; invalidation keys on identity + generation
let crGeomCache = null, crGeomGen = 0; // crGeomGen is a cache key, not a currency counter: no landing checks it; it stands outside the Current convention
function crDraftGeom() {
  if (crGeomCache && crGeomCache.draft === draft && crGeomCache.roads === draft.roads && crGeomCache.gen === crGeomGen) return crGeomCache.g;
  const g = computeStretches(draft.roads);
  crGeomCache = { draft, roads: draft.roads, gen: crGeomGen, g };
  return g;
}
const DRAFT_SRC = 'crDraft';
function crZoomW(w) { // widths hold at z15+, halve per level below (metres hold the z15 value): one helper for the family
  return ['interpolate', ['linear'], ['zoom'], 8, w / 128, 9, w / 64, 10, w / 32, 11, w / 16, 12, w / 8, 13, w / 4, 14, w / 2, 15, w, 19, w];
}
function crFirstLabelLayerId() { // create paint stacks below the label layer (names draw on top); the finder is shared with crIsectEnsure
  try { const lab = ((map.getStyle() && map.getStyle().layers) || []).find(l => l.type === 'symbol' && l.layout && l.layout['text-field']); if (lab) return lab.id; } catch (e) {}
  return undefined;
}
function ensureDraftLayers() {
  if (!map || typeof map.addSource !== 'function') return;
  try {
    if (!map.getSource(DRAFT_SRC)) map.addSource(DRAFT_SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    const before = crFirstLabelLayerId(); // every draft layer seats below the labels (their relative order among themselves is the add order, unchanged)
    if (!map.getLayer('crDraftCase')) map.addLayer({ id: 'crDraftCase', type: 'line', source: DRAFT_SRC, filter: ['==', ['get', 'chosen'], 1], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': 'rgba(10,14,34,.55)', 'line-width': crZoomW(9.75) } }, before); // Beta 1.127: the casing underlines CHOSEN geometry only - an unchosen sector wears no casing, like the mockup's plain grey ends. Beta 1.182: 12.75 = the 1.127 casing x 1.5 - the draft's DRAWN widths carry the same factor Beta 1.181 gave every road (ROAD_WIDTH_K in the generator, WIDTH_K in the engine; both live outside this part's scope, so the coupled values are literals here), and a chosen street's selection again spans the widened road it sits on (measured on the live 1.181 build: casing 8.5 and line 4.5 against a 12 px minor road at z17 - the selection sat INSIDE the road with white showing both sides). Beta 1.210: the literal is now the crZoomW curve's anchor (its value at z15 and above) - below z15 the casing thins with the zoom instead of blobbing over zoomed-out streets. Beta 1.216 (Andrew, from the casing samples): the anchor drops 12.75 -> 9.75 - the casing's EXTRA width over the line is halved (the dark reveal per side 3.0 -> 1.5 px at the anchor, the drawn band 8.25 -> 6.75 m at z16.5), same near-black, same round caps; at the old reveal the near-black outline around the thin 4.1 m core read thick and bulgy (outline-to-core 0.89 against the finished rim's 0.24). crGlowCasingHalfM below follows this anchor (4.875 px)
    if (!map.getLayer('crDraftLineDim')) map.addLayer({ id: 'crDraftLineDim', type: 'line', source: DRAFT_SRC, filter: ['!=', ['get', 'chosen'], 1], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#b9c1cb', 'line-width': crZoomW(4.5) } }, before); // Beta 1.223 (Andrew's corrected model): a REMOVED sector is flat GREY - the #b9c1cb this layer wore through 1.220, restored. The 1.221 muted-category-colour paint is reverted: muted colour now belongs to the SELECTED-but-not-active road (crDraftLine below), never to a removed sector. Beta 1.210: the unchosen line as its OWN layer under the chosen one - see the crDraftLine note below for why the 1.127 single layer became two Beta 1.210: the unchosen line as its OWN layer under the chosen one - see the crDraftLine note below for why the 1.127 single layer became two
    if (!map.getLayer('crDraftLine')) map.addLayer({ id: 'crDraftLine', type: 'line', source: DRAFT_SRC, filter: ['all', ['==', ['get', 'chosen'], 1], ['!=', ['get', 'active'], 1]], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['case', ['==', ['get', 'primary'], 1], '#dbb457', '#d2647e'], 'line-width': crZoomW(6.75) } }, before); // Beta 1.223 (Andrew's corrected model): a chosen street that is NOT the one being trimmed paints GENTLE-MUTED - its category colour at saturation x0.65, lightness unchanged (gold #ffc233 -> #dbb457, red #ef476f -> #d2647e; the strength Andrew approved from the create-route-states sample: just enough to notice the step up when the road goes active). The ACTIVE street (the sector session's, features carry active=1) paints full colour on crDraftLineActive below, with the session glow - the muted->vibrant step is at ROAD level, on the click that opens the trim, not per sector tap (the 1.221 model tied the raise to sector picking; reverted). Beta 1.127: chosen = category colour at full width; unchosen = thin grey. Beta 1.182: both widths x 1.5 with the casing above (6.75 chosen, 4.5 unchosen) - the chosen/unchosen ratio is the 1.127 design's, unchanged; crDraftHit below is the pick TARGET, not drawing, and is deliberately NOT scaled (the tap boxes are Andrew's device-tuned precision, 1.156). Beta 1.210: both widths ride crZoomW like the casing - the literals are the z15-and-above anchors; below z15 the line thins with the zoom (crDraftHit still does NOT scale: it is a tap target, not paint, so picking keeps its generous reach at every zoom). The widths ride the curve in TWO layers (this one filtered to chosen, crDraftLineDim above it to unchosen) because MapLibre silently drops a layer whose line-width nests a zoom curve inside the chosen switch (['case', ..., interpolate, interpolate] never enters the style - measured in the 1.210 round's rendered QA: addLayer does not throw, getLayer stays false); a bare curve as the whole width is fine
    if (!map.getLayer('crDraftLineActive')) map.addLayer({ id: 'crDraftLineActive', type: 'line', source: DRAFT_SRC, filter: ['all', ['==', ['get', 'chosen'], 1], ['==', ['get', 'active'], 1]], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['case', ['==', ['get', 'primary'], 1], '#ffc233', '#ef476f'], 'line-width': crZoomW(6.75) } }, before); // Beta 1.223: the ACTIVE street's chosen sectors at FULL category colour - the vibrant half of the corrected model (its glow rides the crGlowShader, session-only since 1.209). A separate layer on the same two-layer pattern as crDraftLine/crDraftLineDim: the widths stay bare crZoomW curves (a case nested around the width curve is dropped by MapLibre - see the crDraftLine note)
    if (!map.getLayer('crDraftHit')) map.addLayer({ id: 'crDraftHit', type: 'line', source: DRAFT_SRC, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#000000', 'line-opacity': 0, 'line-width': 24 } },
      before);
    // Beta 1.127: the sector pick's fat-finger target - invisible, queryable (crSectorTap)
  } catch (e) { /* the style may still be loading - renderDraft retries on every change */ }
}
// the glow is a shader (one WebGL layer): a metre-built ribbon mesh, per-pixel falloff, scaling like real paint
const CR_GLOW_RINGS = [-20, -13, -9.9, -4.95, 0, 4.95, 9.9, 13, 20]; // signed distances: the kerb (4.95), falloff rings (9.9), outer rings (13, 20) carrying the low-zoom floor's tail
function crGlowRgb(hex) { const n = parseInt(hex.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }
function crGlowStitchFeats(feats) { // chain coincident same-colour features into lines: interior joints get no end-cap fans (fans composite and bump the glow)
  const same = (a, b) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
  const lines = [];
  for (const f of feats) {
    const c = f.geometry && f.geometry.coordinates; if (!c || c.length < 2) continue;
    let placed = false;
    for (const L of lines) {
      if (L.col !== f.properties.col) continue;
      if (same(L.coords[L.coords.length - 1], c[0])) { L.coords.push(...c.slice(1)); placed = true; break; }
      if (same(c[c.length - 1], L.coords[0])) { L.coords.unshift(...c.slice(0, -1)); placed = true; break; }
    }
    if (!placed) lines.push({ col: f.properties.col, coords: c.slice() });
  }
  return lines.map(L => ({ type: 'Feature', properties: { col: L.col }, geometry: { type: 'LineString', coordinates: L.coords } }));
}
function crGlowBuildMesh(feats) { // features -> one triangle vertex array, 6 floats per vertex: mercator x, y, |distance| in metres, r, g, b
  feats = crGlowStitchFeats(feats).map(f => ({ type: 'Feature', properties: f.properties, geometry: { type: 'LineString', coordinates: f.geometry.coordinates.filter((c, i, a) => i === 0 || Math.abs(c[0] - a[i - 1][0]) > 1e-12 || Math.abs(c[1] - a[i - 1][1]) > 1e-12) } })); // Beta 1.216: stitch the fed parts into continuous runs and drop repeated consecutive points BEFORE any normal is computed - a repeated point is a zero-length segment with a (0,0) normal, and the miter clamp turns that into a x2.22 spear (the 1.216 note above). The feed itself (syncCrGlow's chosen sectors, 1.209) is unchanged
  const verts = [];
  const push = (x, y, d, rgb) => { verts.push(x, y, d, rgb[0], rgb[1], rgb[2]); };
  for (const f of feats) {
    const coords = f.geometry && f.geometry.coordinates; if (!coords || coords.length < 2) continue;
    const rgb = crGlowRgb(f.properties.col);
    const mc = coords.map(c => maplibregl.MercatorCoordinate.fromLngLat({ lng: c[0], lat: c[1] }));
    const mm = mc[0].meterInMercatorCoordinateUnits();
    const P = mc.map(p => [p.x, p.y]);
    const N = P.length;
    const segN = [];
    for (let i = 0; i < N - 1; i++) { const dx = P[i + 1][0] - P[i][0], dy = P[i + 1][1] - P[i][1]; const L = Math.hypot(dx, dy) || 1; segN.push([-dy / L, dx / L]); }
    const staN = [];
    for (let i = 0; i < N; i++) {
      if (i === 0) staN.push(segN[0]); else if (i === N - 1) staN.push(segN[N - 2]);
      else { let nx = segN[i - 1][0] + segN[i][0], ny = segN[i - 1][1] + segN[i][1];
      const nl = Math.hypot(nx, ny);
      if (nl < 1e-9) { nx = segN[i][0]; ny = segN[i][1]; } else { nx /= nl; ny /= nl; const cos = Math.max(0.45, nx * segN[i][0] + ny * segN[i][1]); nx /= cos; ny /= cos; } staN.push([nx, ny]);
      }
    }
    const ringPt = (i, off) => [P[i][0] + staN[i][0] * off * mm, P[i][1] + staN[i][1] * off * mm];
    const R = CR_GLOW_RINGS.length;
    for (let i = 0; i < N - 1; i++) for (let k = 0; k < R - 1; k++) { // the ribbon: two triangles per station pair per ring band
      const a = ringPt(i, CR_GLOW_RINGS[k]), b = ringPt(i, CR_GLOW_RINGS[k + 1]), c = ringPt(i + 1, CR_GLOW_RINGS[k]), d2 = ringPt(i + 1, CR_GLOW_RINGS[k + 1]);
      const da = Math.abs(CR_GLOW_RINGS[k]), db = Math.abs(CR_GLOW_RINGS[k + 1]);
      push(a[0], a[1], da, rgb); push(c[0], c[1], da, rgb); push(b[0], b[1], db, rgb);
      push(b[0], b[1], db, rgb); push(c[0], c[1], da, rgb); push(d2[0], d2[1], db, rgb);
    }
    for (const endCap of [0, N - 1]) { // end-cap fans: centre at distance 0, rim at the 20 m outer edge, five steps sweeping the half-circle
      const i = endCap, sgn = i === 0 ? -1 : 1;
      const dirx = sgn * (i === 0 ? (P[1][0] - P[0][0]) : (P[N - 1][0] - P[N - 2][0])), diry = sgn * (i === 0 ? (P[1][1] - P[0][1]) : (P[N - 1][1] - P[N - 2][1]));
      const dl = Math.hypot(dirx, diry) || 1, dx = dirx / dl, dy = diry / dl;
      const nx = segN[i === 0 ? 0 : N - 2][0], ny = segN[i === 0 ? 0 : N - 2][1];
      let prev = null;
      for (let j = 0;
      j <= 5;
      j++) { const th = (j / 5) * Math.PI, ox = nx * Math.cos(th) + dx * Math.sin(th), oy = ny * Math.cos(th) + dy * Math.sin(th);
      const rim = [P[i][0] + ox * 20 * mm, P[i][1] + oy * 20 * mm];
      if (prev) { push(P[i][0], P[i][1], 0, rgb); push(prev[0], prev[1], 20, rgb); push(rim[0], rim[1], 20, rgb); } prev = rim;
      }
    }
  }
  return new Float32Array(verts);
}
let crGlowShaderLayer = null;
function crGlowLayerObj() {
  if (crGlowShaderLayer) return crGlowShaderLayer;
  crGlowShaderLayer = {
    id: 'crGlowShader', type: 'custom', _data: null, _dirty: false, _prog: null, _buf: null, _aPos: -1, _aDist: -1, _aCol: -1, _u: {},
    onAdd(m, gl) {
      const sh = (type,
        src) => { const s2 = gl.createShader(type); gl.shaderSource(s2, src); gl.compileShader(s2); if (!gl.getShaderParameter(s2, gl.COMPILE_STATUS)) console.log('CRGLOWSHADER compile failed: ' + gl.getShaderInfoLog(s2)); return s2; };
      const prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, [
        'attribute vec2 a_pos;',
        'attribute float a_dist;',
        'attribute vec3 a_col;',
        'uniform mat4 u_matrix;',
        'varying float v_dist;',
        'varying vec3 v_col;',
        'void main() { v_dist = a_dist; v_col = a_col; gl_Position = u_matrix * vec4(a_pos, 0.0, 1.0); }'
      ].join('\n')));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, [
        'precision highp float;',
        'varying float v_dist;',
        'varying vec3 v_col;',
        'uniform float u_half;',
        'uniform float u_reach;',
        'uniform float u_peak;',
        'void main() { float d = abs(v_dist); float a; if (d <= u_half) { a = u_peak; } else { float t = clamp((d - u_half) / u_reach, 0.0, 1.0); a = u_peak * (1.0 - t) * (1.0 - t); } gl_FragColor = vec4(v_col * a, a); }'
      ].join('\n')));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.log('CRGLOWSHADER link failed: ' + gl.getProgramInfoLog(prog)); this._prog = null; return; }
      this._prog = prog;
      this._aPos = gl.getAttribLocation(prog, 'a_pos'); this._aDist = gl.getAttribLocation(prog, 'a_dist'); this._aCol = gl.getAttribLocation(prog, 'a_col');
      this._u = { matrix: gl.getUniformLocation(prog, 'u_matrix'), half: gl.getUniformLocation(prog, 'u_half'), reach: gl.getUniformLocation(prog, 'u_reach'), peak: gl.getUniformLocation(prog, 'u_peak') };
      this._buf = gl.createBuffer();
      if (this._data) this._dirty = true;
    },
    render(gl, matrix) {
      if (!this._prog || !this._data || !this._data.length) return; // no features: draw nothing and request no frame - the repaint runs only while the glow is live
      if (this._dirty && this._buf) { gl.bindBuffer(gl.ARRAY_BUFFER, this._buf); gl.bufferData(gl.ARRAY_BUFFER, this._data, gl.DYNAMIC_DRAW); this._dirty = false; }
      const t = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
      const s = 0.5 + 0.5 * Math.sin(2 * Math.PI * ((t % 4) / 4) - Math.PI / 2); // the 4.0 s breath, trough at t=0 (the sample's measured phase form)
      const prevProg = gl.getParameter(gl.CURRENT_PROGRAM);
      const prevBuf = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
      const prevBlend = gl.getParameter(gl.BLEND);
      const prevDepth = gl.getParameter(gl.DEPTH_TEST);
      const prevDepthMask = gl.getParameter(gl.DEPTH_WRITEMASK);
      const prevStencil = gl.getParameter(gl.STENCIL_TEST);
      const prevScissor = gl.getParameter(gl.SCISSOR_TEST);
      const prevSrc = gl.getParameter(gl.BLEND_SRC_RGB);
      const prevDst = gl.getParameter(gl.BLEND_DST_RGB);
      gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
      gl.disable(gl.STENCIL_TEST); gl.disable(gl.SCISSOR_TEST);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(this._prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, this._buf);
      gl.enableVertexAttribArray(this._aPos); gl.vertexAttribPointer(this._aPos, 2, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(this._aDist); gl.vertexAttribPointer(this._aDist, 1, gl.FLOAT, false, 24, 8);
      gl.enableVertexAttribArray(this._aCol); gl.vertexAttribPointer(this._aCol, 3, gl.FLOAT, false, 24, 12);
      gl.uniformMatrix4fv(this._u.matrix, false, matrix);
      gl.uniform1f(this._u.half, 4.95);
      gl.uniform1f(this._u.reach, Math.max(5 + 4 * s, (crGlowCasingHalfM() - 4.95) * 2.21)); // the reach floor: sized so the falloff holds 30% of peak alpha at the casing's edge when zoomed out
      gl.uniform1f(this._u.peak, 0.50 + 0.30 * s);
      gl.drawArrays(gl.TRIANGLES, 0, this._data.length / 6);
      gl.disableVertexAttribArray(this._aPos); gl.disableVertexAttribArray(this._aDist); gl.disableVertexAttribArray(this._aCol);
      gl.bindBuffer(gl.ARRAY_BUFFER, prevBuf);
      gl.useProgram(prevProg);
      gl.blendFunc(prevSrc, prevDst);
      if (!prevBlend) gl.disable(gl.BLEND);
      if (prevDepth) gl.enable(gl.DEPTH_TEST);
      gl.depthMask(prevDepthMask);
      if (prevStencil) gl.enable(gl.STENCIL_TEST);
      if (prevScissor) gl.enable(gl.SCISSOR_TEST);
      if (map) map.triggerRepaint(); // breathing: keep frames coming while the glow is live
    },
    onRemove(m, gl) { if (this._prog) gl.deleteProgram(this._prog); if (this._buf) gl.deleteBuffer(this._buf); this._prog = null; this._buf = null; }
  };
  return crGlowShaderLayer;
}
function crGlowSetFeatures(feats) { const layer = crGlowLayerObj(); layer._data = crGlowBuildMesh(feats); layer._dirty = true; if (map && typeof map.triggerRepaint === 'function') map.triggerRepaint(); }
function crGlowCasingHalfM() { // the casing's half-width in metres here: the crZoomW anchor holds z15 up, and its z15 metres below
  if (!map) return 0;
  const c = map.getCenter(); const lat = c ? c.lat * Math.PI / 180 : 0.765;
  return 4.875 * (40075016.686 * Math.cos(lat)) / (512 * Math.pow(2, Math.max(map.getZoom(), 15)));
}
function ensureCrGlowLayers() {
  if (!map || typeof map.addLayer !== 'function') return;
  try { if (!map.getLayer('crGlowShader')) map.addLayer(crGlowLayerObj(), 'crDraftCase'); } catch (e) { /* the style may still be loading - renderDraft retries on every change */ }
}
function syncCrGlow() { // the glow's one writer: the session street's chosen sectors, only while trimming; a removed sector never glows
  ensureCrGlowLayers();
  if (!map) return;
  const feats = [];
  const name = crSectorSession.street;
  if (name && draft && draft.roads && Object.prototype.hasOwnProperty.call(draft.roads, name)) {
    const col = draft.primaries.has(name) ? '#ffc233' : '#ef476f';
    const rec = crStreetParts(name);
    if (rec) { const set = crChosenSet(name, rec);
    for (let i = 0;
    i < rec.parts.length;
    i++) { if (!set.has(i)) continue;
    const L = rec.parts[i];
    if (L && L.length > 1) feats.push({ type: 'Feature', properties: { col }, geometry: { type: 'LineString', coordinates: L.map(p => [p[1], p[0]]) } });
    } }
    else { const g = crDraftGeom();
    const st = g && g[name];
    if (st) { for (const run of st.runs) { const L = run.line; if (L && L.length > 1) feats.push({ type: 'Feature', properties: { col }, geometry: { type: 'LineString', coordinates: L.map(p => [p[1], p[0]]) } }); } } }
  }
  crGlowSetFeatures(feats);
}
function renderDraft() { // the draft renders from its own roads through its own source: the active route's geometry/storage are never touched
  ensureDraftLayers();
  if (!map || typeof map.getSource !== 'function') return;
  const src = map.getSource(DRAFT_SRC); if (!src) return;
  const feats = [];
  if (draft) {
    const g = crDraftGeom(); // the shared draft geometry: computed once per geometry change, not once per render
    for (const n of draftStreets()) {
      const primary = draft.primaries.has(n) ? 1 : 0;
      const sel = DRAFT.trimOf(n);
      if (sel || crSectorSession.street === n) {
        const rec = crStreetParts(n); if (!rec) continue;
        const set = crChosenSet(n, rec);
        for (let i = 0;
        i < rec.parts.length;
        i++) { const L = rec.parts[i];
        if (L && L.length > 1) feats.push({ type: 'Feature',
          properties: { name: n, primary, chosen: set.has(i) ? 1 : 0, active: crSectorSession.street === n ? 1 : 0, sector: i },
          geometry: { type: 'LineString', coordinates: L.map(p => [p[1], p[0]]) } });
        } // active=1 only on the sector session's street: it alone paints vibrant; other chosen streets rest gentle-muted
      } else {
        const st = g[n];
        if (st) for (const run of st.runs) { const L = run.line;
        if (L && L.length > 1) feats.push({ type: 'Feature', properties: { name: n, primary, chosen: 1, active: 0, sector: -1 }, geometry: { type: 'LineString', coordinates: L.map(p => [p[1], p[0]]) } });
        } // Beta 1.144 (C1): an untrimmed street draws all its runs - one feature per run, never a line bridging them
      }
    }
  }
  src.setData({ type: 'FeatureCollection', features: feats });
  syncCrGlow(); // the trim glow tracks the draft's own render: the street's normal draft paint is untouched above and below it
}
// restoration is for swaps only: a missing sentinel is the swap signal; standing layers mean nothing was wiped
onMapReady(() => map.on('styledata', () => { if (creating) { if (map.getLayer('crDraftCase') && (!crIsectPoi || map.getLayer('crIsectDot'))) {
    if (routeBackdropNeedsHide(map)) crSetBackdrop(true); // the naming owner judges it: any route layer standing visible again, recorded or not, re-fires the hide
    return; }
  renderDraft(); crSetBackdrop(true); crIsectEnsure(); } })); // a swap mid-create wipes custom layers: redraw the draft, re-hide the backdrop, re-seat the POI surface
onMapReady(() => { if (creating) crSetBackdrop(true); }); // creation entered before the map existed (boot mode): the backdrop lands when the map does

// ---- creation backdrop ---- the loaded route's paint hides while creating; a POI marks each route's centre; exit restores visibility
const CR_POI_SRC = 'crPoi';
function crPoiFeatures() {
  return ROUTE_PACKS.map(p => { const bb = computeRouteBox(p.roads); if (!bb) return null; return { type: 'Feature',
    properties: { name: p.name || '' },
    geometry: { type: 'Point', coordinates: [(bb.w + bb.e) / 2, (bb.s + bb.n) / 2] } }; }).filter(Boolean);
}
function crPoiFont() { // the basemap's own Noto stack, read the way pickFontFromStyle reads it - a guessed stack renders no text
  try {
    const syms = (map.getStyle().layers || []).filter(l => l.type === 'symbol' && l.layout && l.layout['text-font']);
    const pick = syms.find(l => /noto/i.test(l.layout['text-font'].join(' '))) || syms[0];
    if (pick) return pick.layout['text-font'];
  } catch (e) {}
  return ['Noto Sans Regular'];
}
function ensureCrPoiLayers() {
  if (!map || typeof map.addSource !== 'function') return;
  try {
    const data = { type: 'FeatureCollection', features: crPoiFeatures() };
    if (!map.getSource(CR_POI_SRC)) map.addSource(CR_POI_SRC, { type: 'geojson', data });
    else map.getSource(CR_POI_SRC).setData(data);
    const night = isNight();
    if (!map.getLayer('crPoiRing')) map.addLayer({ id: 'crPoiRing', type: 'circle', source: CR_POI_SRC, paint: { 'circle-radius': 9, 'circle-color': '#ffffff', 'circle-stroke-color': 'rgba(10,14,34,.25)', 'circle-stroke-width': 1 } });
    if (!map.getLayer('crPoiDot')) map.addLayer({ id: 'crPoiDot', type: 'circle', source: CR_POI_SRC, paint: { 'circle-radius': 6, 'circle-color': '#ef476f' } });
    if (!map.getLayer('crPoiTxt')) map.addLayer({ id: 'crPoiTxt',
      type: 'symbol',
      source: CR_POI_SRC,
      layout: { 'text-field': ['get', 'name'], 'text-font': crPoiFont(), 'text-size': 11, 'text-anchor': 'left', 'text-offset': [1.1, 0], 'text-allow-overlap': true },
      paint: { 'text-color': night ? '#e8e8e8' : '#333333', 'text-halo-color': night ? 'rgba(0,0,0,.8)' : 'rgba(255,255,255,.9)', 'text-halo-width': 1.6 } });
  } catch (e) { /* the style may still be loading - the styledata hook re-runs this while creating */ }
}
function crSetBackdrop(on) { // the hide/restore itself lives with the naming owner (setRouteBackdrop, app2.js); this seat keeps the creation POI half
  if (!map || typeof map.setLayoutProperty !== 'function') return;
  setRouteBackdrop(map, on, () => {
    if (on) ensureCrPoiLayers();
    else { for (const id of ['crPoiRing', 'crPoiDot', 'crPoiTxt']) { try { if (map.getLayer(id)) map.removeLayer(id); } catch (e) {} } try { if (map.getSource(CR_POI_SRC)) map.removeSource(CR_POI_SRC); } catch (e) {} }
  });
  syncCrGlow(); // the exit's reliable beat: if a trim session outlived its render, the glow still dies here
}
function crRowEl(n, g) {
  const row = document.createElement('div'); row.className = 'crRow';
  const primary = draft.primaries.has(n);
  const dot = document.createElement('span'); dot.className = 'crDot ' + (primary ? 'primary' : 'sec'); row.appendChild(dot);
  const nm = document.createElement('span'); nm.className = 'crName'; nm.textContent = shortStreetName(n); row.appendChild(nm); // rows display the short name; the draft key behind them is the full map name
  // the preview's rows bill the CHOSEN length through the same helper as the panel's rows and every total
  const ln = document.createElement('span'); ln.className = 'crLen'; ln.textContent = fmtLenM(crStreetChosenM(n, g)); row.appendChild(ln);
  const chip = document.createElement('button'); chip.className = 'crChip ' + (primary ? 'primary' : 'sec'); chip.textContent = primary ? 'PRIMARY' : 'SECONDARY';
  chip.addEventListener('click', () => DRAFT.togglePrimary(n)); // the toggle lives on the DRAFT owner
  row.appendChild(chip);
  const del = document.createElement('button'); del.className = 'crDel'; del.textContent = '✕'; del.title = 'Remove ' + shortStreetName(n);
  del.addEventListener('click', () => crRemoveStreet(n)); // the shared removal path (sector state leaves with the street)
  row.appendChild(del);
  return row;
}
function crPanelRowEl(n, g) { // one row per road: dot, name, length, in-row type chip, x to remove; row tap opens trimming
  const primary = draft.primaries.has(n);
  const row = document.createElement('div'); row.className = 'crPRow';
  const dot = document.createElement('span'); dot.className = 'crDot ' + (primary ? 'primary' : 'sec'); row.appendChild(dot);
  const meta = document.createElement('span'); meta.className = 'crPMeta';
  const nm = document.createElement('span'); nm.className = 'crPName'; nm.textContent = shortStreetName(n); meta.appendChild(nm); // display form, as in the preview rows
  const sub = document.createElement('span'); sub.className = 'crPSub';
  const sel = DRAFT.trimOf(n);
  if (sel) { const rec = crStreetParts(n); sub.textContent = sel.length + ' of ' + (rec ? rec.parts.length : sel.length) + ' sectors · ' + fmtLenM(crStreetChosenM(n, g)); }
  else sub.textContent = 'Entire road · ' + fmtLenM(g[n] ? g[n].total : 0); // the adjust affordance is stated BEFORE a trim exists: an untrimmed row must hint it can be tapped at all
  meta.appendChild(sub);
  // the instruction gets its own line under the length line, in Andrew's words; the styling stays .crPSub
  const hint = document.createElement('span'); hint.className = 'crPSub'; hint.textContent = 'Tap a road to adjust sectors'; meta.appendChild(hint);
  row.appendChild(meta);
  const chip = document.createElement('button'); chip.className = 'crPChip ' + (primary ? 'primary' : 'sec'); chip.textContent = primary ? 'PRIMARY' : 'SECONDARY';
  chip.addEventListener('click', e => { e.stopPropagation(); DRAFT.togglePrimary(n); }); // the toggle lives on the DRAFT owner
  row.appendChild(chip);
  const del = document.createElement('button'); del.className = 'crPDel'; del.textContent = '✕'; del.title = 'Remove ' + shortStreetName(n);
  del.addEventListener('click', e => { e.stopPropagation(); crRemoveStreet(n); });
  row.appendChild(del);
  row.addEventListener('click', () => crOpenSectors(n));
  return row;
}
function renderCrLists() {
  if (!draft) return;
  const g = crDraftGeom(); // shares renderDraft's computation through the draft geometry cache
  const names = draftStreets().sort((a, b) => a.localeCompare(b));
  let tot = 0; for (const n of names) tot += crStreetChosenM(n, g); // totals bill CHOSEN lengths: a trimmed street's unchosen ends never count
  $('crCount').textContent = names.length + ' roads · ' + fmtLenM(tot); // the panel header's count in the mockup's shape ("3 roads · 2,410 m")
  $('pvCount').textContent = names.length + ' streets · ' + draft.primaries.size + ' primaries · ' + fmtLenM(tot); // the preview keeps its fuller count line
  { const el = $('crPickList'); el.innerHTML = ''; for (const n of names) el.appendChild(crPanelRowEl(n, g)); }
  { const el = $('pvList'); el.innerHTML = ''; for (const n of names) el.appendChild(crRowEl(n, g)); }
  for (const pk of Object.keys(crPending).sort()) { // pending streets list in the PICK sheet only: never in the preview, never in the count, never saved
    if (Object.prototype.hasOwnProperty.call(draft.roads, pk)) continue; // an own-key test, not truthiness: 'constructor'/'toString' read truthy via the prototype and hid the pending row
    const row = document.createElement('div'); row.className = 'crRow pending';
    const dot = document.createElement('span'); dot.className = 'crDot sec'; row.appendChild(dot);
    const nm = document.createElement('span'); nm.className = 'crName'; nm.textContent = shortStreetName(pk); row.appendChild(nm); // display form
    const chip = document.createElement('span'); chip.className = 'crChip pend'; chip.textContent = 'PENDING'; row.appendChild(chip);
    const del = document.createElement('button'); del.className = 'crDel'; del.textContent = '✕'; del.title = 'Drop ' + shortStreetName(pk);
    del.addEventListener('click', () => { delete crPending[pk]; renderCrLists(); });
    row.appendChild(del);
    $('crPickList').appendChild(row);
  }
  $('crStripTitle').textContent = names.length ? names.length + (names.length === 1 ? ' road' : ' roads') + ' picked' : 'No roads picked yet'; // the bar always carries the state: at zero picks it says so (the bar exists at zero too)
  $('crStripSub').textContent = names.length ? fmtLenM(tot) + ' · tap Review to see them' : 'Tap roads on the map to add them';
  $('crDoneBtn').disabled = !names.length;
  $('crDoneBtn').textContent = 'Done'; // one word, ALWAYS: Done goes to the check screen from the fresh state and the return state alike
  $('pvSaveBtn').disabled = !names.length;
  syncCrPanel();
}
let crConfirmCb = null;
let crConfirmOneBtn = false; // true while the current confirm is the discard ask (its No reads Cancel, like every two-button confirm)
function crConfirm(title, msg, cb, labels) { $('crModalTitle').textContent = title; $('crModalMsg').textContent = msg; crConfirmCb = cb;
  crConfirmOneBtn = !!(labels && labels.oneBtn); $('crModalYes').textContent = (labels && labels.yes) || 'Discard';
  $('crModalYes').classList.toggle('danger', !!(labels && labels.danger) || crConfirmOneBtn);
  $('crModalNo').textContent = crConfirmOneBtn ? 'Cancel' : ((labels && labels.no) || '✕');
  $('crModalNo').classList.toggle('cancelRed', crConfirmOneBtn || (!!labels && labels.no === 'Cancel')); showSurface($('crModal')); } // two buttons are the only doors
function crConfirmDismiss() { hideSurface($('crModal')); crConfirmCb = null; }
$('crModalYes').addEventListener('click', () => { hideSurface($('crModal')); const cb = crConfirmCb; crConfirmCb = null; if (cb) cb(); });
$('crModalNo').addEventListener('click', crConfirmDismiss);
function parkBootChrome() { const sp = $('splash');
if (sp) sp.style.visibility = 'hidden';
$('routeMenu').classList.remove('show');
const bl = $('brandLayer');
if (bl) bl.classList.add('parked');
/* the title lives in its own layer - the park hides it explicitly */ crBootParked = true; }
function restoreBootChrome() { if (!crBootParked) return;
crBootParked = false;
const sp = $('splash');
if (sp) sp.style.visibility = '';
$('routeMenu').classList.add('show');
const bl = $('brandLayer');
if (bl) bl.classList.remove('parked');
/* Beta 1.155: revive the title layer with the picker */ }
function setCreateStage(stage) {
  if (stage !== 'pick') crSectorReset(); // sector mode is pick-stage only: the preview never inherits its bar (the Cancel snapshot dies with it)
  crStage = stage;
  $('createBar').classList.toggle('on', stage === 'pick');
  if (stage === 'pick') crSyncClear(); // a search text that outlives a stage change shows its clear disc again with the bar
  $('createSheet').classList.toggle('on', stage === 'pick');
  $('previewSheet').classList.toggle('on', stage === 'preview');
  $('createResults').classList.remove('on');
  if (stage === 'pick') crRenderHint(); else $('crHintBtn').style.display = 'none'; // the button is state-driven (crRenderHint owns it): the preparation state must survive stage changes, not be overwritten
  renderCrLists(); renderDraft();
  if (stage === 'preview') fitDraft();
}
function enterCreate(stage) {
  if (!draft) draft = newDraft();
  creating = true;
  crSectorReset(); crSectorSession.collapsed = false; crSettleMorph(); // every creation starts un-trimmed with the panel up (any morph an earlier creation left in flight lands first)
  crSession++; // a fresh creation session: async completions born in any earlier session are obsolete from here (CG-PF-05)
  document.body.classList.add('creating');
  followPaused = true; // the camera belongs to the picking; GPS is device state, not stopped: follow resumes from Locate afterwards
  try { deselect(); } catch (e) {} closeSheets();
  if (routeLoaded) closeRouteMenu(); else parkBootChrome();
  crSetBackdrop(true); // the loaded route's paint steps aside for the picking (POIs only) - see crSetBackdrop
  setCreateStage(stage);
}
function exitCreate() {
  creating = false; draft = null; crStage = 'pick'; crAreaGuess = '';
  crSectorReset(); crSectorSession.collapsed = false; // panel + session state dies with the creation; these calls stand on their own line and run
  crSession++; crCovGen++; // completions born in this session are obsolete at close: they must not land in a later draft
  if (crPrep) { clearInterval(crPrep.ticker); crAbortOp(crPrep.op); crPrep = null; } // and the downloads themselves stop (CG-PF-10)
  if (crGrid) { crGridStop('exit'); crGrid = null; } // the grid's downloads stop too; its committed cells live on in the on-device city cache, by design
  crCacheNote = ''; crCacheNoteCity = ''; // the owner binding resets with the note: no failure state outlives the session
  crPackCtx = null; crPackNote = ''; // the pack context belongs to the closed session's city: the next creation re-decides its source
  crAbortOp(crTopOp); crTopOp = null;
  // state routes through the setter; crFailFromGrid clears with the session, never surviving into a new one
  crCov = null; crCity = null; crSetPrepState('none'); crPrepFail = null; crFailFromGrid = false; crPrepAnchor = null; crPending = {}; crToppedUp = {}; crWanted = null;
  $('crHintBtn').style.display = 'none';
  crResetSearch(); // the close ends the search through the owner: no in-flight suggestion lands after the flow closes
  crIsectClear(); // the street text dies with the session: emptying runs through crIsectClear, so a crossing's marker dies too
  document.body.classList.remove('creating');
  for (const id of ['createBar', 'createSheet', 'previewSheet', 'createResults']) $(id).classList.remove('on');
  crSetBackdrop(false); // the loaded route's paint returns exactly as it was
  renderDraft(); // draft is null: the overlay clears, the active route was never touched
}
function openDoors() { crWarmCityLibrary(); if (!routeLoaded) { restoreBootChrome(); } else openRouteMenu(); showRmPane('rmCreatePane'); } // opening the doors starts the catalogue download, so it is in hand by the list tap
function askDiscard(then) { if (draft && draftStreets().length) crConfirm('Throw away this draft?', 'The ' + draftStreets().length + ' streets you picked will be lost.', then, { oneBtn: true }); else then(); }
function fitDraft() {
  if (!draft || !map) return;
  const bb = computeRouteBox(crFilteredRoads()); if (!bb) return; // the preview frames what will save (chosen sectors); an empty draft computes no box and fires no flight
  // flight is flat overhead, fitting the draft above the sheet: bottom padding is measured height + 24 px
  const sheet = $('previewSheet');
  const pad = { top: 56, left: 56, right: 56, bottom: (sheet ? sheet.offsetHeight : 0) + 24 };
  const b = [[bb.w, bb.s], [bb.e, bb.n]];
  let fit = null; try { fit = map.cameraForBounds(b, { padding: pad }); } catch (e) {}
  if (fit && fit.center && typeof fit.zoom === 'number') { try { map.flyTo({ center: fit.center, zoom: fit.zoom, pitch: 0, bearing: 0, duration: 2000, curve: 1.2, essential: false }); return; } catch (e) {} }
  try { map.fitBounds(b, { padding: pad, pitch: 0, duration: 800 }); } catch (e) {}
}
$('crExit').addEventListener('click', () => { // the back pill only goes back; clearing the search is the clear disc's job - one button, one job
  askDiscard(() => { const wasBoot = !routeLoaded; exitCreate(); if (wasBoot) openDoors(); });
});
$('pvStartOverBtn').addEventListener('click', () => askDiscard(() => { exitCreate(); openDoors(); }));

// ---- The doors: city first (Andrew's amendment) -> prepare the area's street shapes once -> tap roads, resolved locally ----
$('crDoorList').addEventListener('click', () => { showRmPane('rmCityListPane'); crRenderCityChoices(); }); // Select from list: the city rows render fresh on every entry to the list pane
$('rmCityListBack').addEventListener('click', () => showRmPane('rmCreatePane')); // the list pane backs to the doors pane (the mockup's pane-to-pane Back chain)
$('crDoorManual').addEventListener('click', () => { askDiscard(() => { draft = newDraft(); crOpenCityPane('doors'); }); }); // opening the pane starts a fresh draft, so a live draft asks first (askDiscard no-ops on an empty draft)
$('crCityInput').addEventListener('input', () => { // every input change invalidates at the event (bump + abort): no late answer renders into a moved-past field
  crResetCitySearch(); // the invalidation runs through crResetCitySearch, the one owner; the seat's own remaining work is the re-arm below
  if ($('crCityInput').value.trim().length < 3) { crCityBoxSwap(b => { b.innerHTML = ''; }); return; } // the clear animates like every other results change
  const landTypeahead = landIfCurrent(crCitySeq, crCitySearchSeqCurrent); // a search starting first bumps the sequence and the type-ahead stands down
  crCityTimer = setTimeout(() => { crCityTimer = null; landTypeahead(crRunCityTypeahead); }, 500); // the 500 ms debounce is the settle point: only a settled word can reach the service
});
$('crCityBack').addEventListener('click', () => {
  crResetCitySearch(); // leaving the pane kills a held city search too (request AND pending debounce), through crResetCitySearch, the one owner
  if (crCityReturn === 'preview' || crCityReturn === 'pick') { if (!routeLoaded) parkBootChrome(); else closeRouteMenu(); setCreateStage(crCityReturn); }
  else { showRmPane('rmCreatePane'); }
});
$('crCityChange').addEventListener('click', () => crOpenCityPane('pick'));
$('crHintBtn').addEventListener('click', () => { // the action is the same decision that labelled the button (crHintAction): the handler dispatches, never re-interprets
  const act = crHintAction().act;
  if (act === 'cancel') { crCancelPrep(); return; }
  if (act === 'wanted') { crStartPrep(crWanted.anchor); return; } // an outstanding offer (outside-coverage tap / pending street) prepares exactly where it points - it outranks the state remedies
  if (act === 'resume') { crGridResume(); return; } // Resume / Retry missing parts / a failed grid's Retry: only the missing cells fetch (amendments A+B)
  if (act === 'retry-anchor') { if (crPrepAnchor) crStartPrep(crPrepAnchor); return; } // a failed box's Retry: the same anchor again
  if (act === 'prepare-centre') { if (map) { const c = map.getCenter(); crStartPrep({ lat: c.lat, lng: c.lng }); } return; } // Prepare this area: the anchor is the map centre he is looking at
});
onMapReady(() => map.on('moveend', () => { if (creating && crStage === 'pick' && crPrepState === 'none') crRenderHint(); }));
// the Prepare-this-area offer follows the zoom (it appears only at picking zoom) - never a silent download while merely panning
$('crSearchInput').addEventListener('keydown', e => { if (e.key === 'Enter') crSearch(); });
// search as you type (300 ms debounce, 3+ characters, one query per burst); Enter runs it immediately
let crSearchTimer = null, crSearchSeq = 0;
function crResetSearch() { // the search-close owner: clear the debounce, bump the sequence, hide the box; seats keep only their own extras
  if (crSearchTimer) { clearTimeout(crSearchTimer); crSearchTimer = null; }
  crSearchSeq++;
  $('createResults').classList.remove('on');
}
function crSyncClear() { $('crClear').classList.toggle('on', !!$('crSearchInput').value); } // the clear disc exists only while the input holds text
// ---- intersection POI ---- a picked crossing's name in the bar and marker on the map, set and cleared together
const CR_ISECT_SRC = 'crIsect';
let crIsectPoi = null; // { lat, lon, name } while the surface stands, else null
let crIsectRaf = 0; // the pulse's frame handle; 0 = the pulse is not running
let crIsectPushed = null; // the key the source holds ('lat,lon', '' for empty, null = unknown: a fresh source always takes a push)
function crIsectEnsure() { // the layers, (re)seated in the current style: a swap wipes them, so the styledata hook re-runs this
  if (!map || typeof map.addSource !== 'function') return;
  try {
    if (!map.getSource(CR_ISECT_SRC)) { map.addSource(CR_ISECT_SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } }); crIsectPushed = null; }
    const before = crFirstLabelLayerId(); // the pair stacks below the first label layer: street names draw over the marker, never under it
    if (!map.getLayer('crIsectHalo')) map.addLayer({ id: 'crIsectHalo', type: 'circle', source: CR_ISECT_SRC, paint: { 'circle-radius': 7, 'circle-color': '#2C4AD2', 'circle-opacity': 0, 'circle-radius-transition': { duration: 0, delay: 0 }, 'circle-opacity-transition': { duration: 0, delay: 0 } } }, before); // gate fix (Codex P2, PR #158): the frame loop drives the halo's paint - zero-duration transitions, or MapLibre's default 300 ms paint transition would chase each frame's target, smearing the pulse law and gliding across its cycle reset instead of restarting
    if (!map.getLayer('crIsectDot')) map.addLayer({ id: 'crIsectDot', type: 'circle', source: CR_ISECT_SRC, paint: { 'circle-radius': 7, 'circle-color': '#2C4AD2' } }, before);
    const want = crIsectPoi ? crIsectPoi.lat + ',' + crIsectPoi.lon : '';
    if (want !== crIsectPushed) { // push only on change: re-pushing the same point every call feeds the styledata cycle guarded against below
      if (crIsectPoi) map.getSource(CR_ISECT_SRC).setData({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [crIsectPoi.lon, crIsectPoi.lat] } });
      crIsectPushed = want;
    }
  } catch (e) { /* the style may still be loading - the styledata hook retries while creating */ }
}
function crIsectHaloRest() { // the halo's rest frame (core-sized, invisible), set at every stop: no stale mid-pulse frame carries forward
  try { if (map && map.getLayer('crIsectHalo')) { map.setPaintProperty('crIsectHalo', 'circle-radius', 7); map.setPaintProperty('crIsectHalo', 'circle-opacity', 0); } } catch (e) {}
}
function crIsectPulseStart() {
  crIsectPulseStop();
  if (!crIsectPoi) return;
  crIsectHaloRest();
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return; // the motion contract's rest: no pulse under reduced motion - the halo stays invisible and the core stands alone
  const tick = () => {
    if (!crIsectPoi) { crIsectRaf = 0; return; }
    try {
      if (map && map.getLayer('crIsectHalo')) {
        const t = (performance.now() % 1800) / 1800;
        const ease = 1 - (1 - t) * (1 - t); // easeOutQuad, the sample's curve: the halo leaves fast and settles as it fades
        map.setPaintProperty('crIsectHalo', 'circle-radius', 7 + 14 * ease); // 7 -> 21: the core to 3x
        map.setPaintProperty('crIsectHalo', 'circle-opacity', 0.38 * (1 - t));
      }
    } catch (e) {}
    crIsectRaf = requestAnimationFrame(tick);
  };
  crIsectRaf = requestAnimationFrame(tick);
}
function crIsectPulseStop() { if (crIsectRaf) { cancelAnimationFrame(crIsectRaf); crIsectRaf = 0; } }
function crIsectSet(lat, lon, name) { // the surface's ONE writer: state, bar text and marker land together or not at all
  crIsectPoi = { lat, lon, name };
  $('crSearchInput').value = name; crSyncClear(); // the FULL chosen name replaces the typed fragment, and the clear disc stands with it
  crIsectEnsure();
  crIsectPulseStart();
}
function crIsectClear() { // the one teardown: state, pulse, marker and bar text die together; seats keep only their own extras
  crIsectPoi = null; crIsectPulseStop(); crIsectHaloRest();
  try { if (map && map.getSource(CR_ISECT_SRC)) { map.getSource(CR_ISECT_SRC).setData({ type: 'FeatureCollection', features: [] }); crIsectPushed = ''; } } catch (e) {}
  $('crSearchInput').value = ''; crSyncClear();
}
$('crClear').addEventListener('click', () => { // the clear disc empties text and results, keeps focus in the input: it never exits anything
  crResetSearch(); // the close is the owner's; the disc's remaining work is the field (empty it, sync it, keep the focus)
  crIsectClear(); // the field emptying runs through the POI teardown: a standing crossing's marker dies with its name here
  $('crSearchInput').focus();
});
$('crSearchInput').addEventListener('input', () => {
  if (crSearchTimer) { clearTimeout(crSearchTimer); crSearchTimer = null; }
  crSyncClear();
  if (!$('crSearchInput').value) crIsectClear(); // emptying the bar ends the POI surface too: name and marker are one surface, neither outlives the other
  const q = $('crSearchInput').value.trim();
  if (q.length < 3) { crResetSearch(); return; }
  crSearchTimer = setTimeout(() => { crSearchTimer = null; crRunSearch(true); }, 300);
});
function crSearch() { // Enter: cancel any pending debounce and run the typed query NOW
  if (crSearchTimer) { clearTimeout(crSearchTimer); crSearchTimer = null; }
  crRunSearch(false);
}
// the current-check convention: each family's guard is cr<Family>Current(its own inputs) - 'may this landing still write?'
function crSearchCurrent(seq) { return seq === crSearchSeq; } // the street-search family's current-check: the sequence ALONE - no session, by design
function crRunSearch(fromTyping, cont) {
  const q = $('crSearchInput').value.trim(); if (!q) return;
  const seq = ++crSearchSeq;
  const res = crSearchResolve(q);
  if (!crSearchCurrent(seq)) return; // synchronous now, so nothing supersedes mid-run: the check stands because every landing answers to its sequence
  crRenderRows(res, cont);
}
function crRefreshSearch() { // coverage landing under an open search re-runs it; a dismissed search stays dismissed (its box never reopens)
  if (!creating) return;
  const box = $('createResults');
  if (!box.classList.contains('on')) return; // dismissed stays dismissed (see above)
  if (!$('crSearchInput').value.trim()) return; // nothing typed, nothing to refresh
  crRunSearch(false, true);
}
// the search is intersections only, answered entirely on-device: a road name names no place, a crossing is one
function crSearchResolve(q) { // -> { items, streets } for a render, or { hint } when the live filter yields nothing
  const pair = crIntersectionItem(q); // a fully resolving pair narrows to exactly its crossing (the 1.232 path, unchanged)
  if (pair) return { items: [pair], streets: new Set([pair.display_name.split(' & ')[0]]) };
  const parts = crParseTwoStreets(q);
  const got = parts ? crFragmentPairItems(parts[0], parts[1]) : crFragmentStreetItems(q);
  if (got.items.length) return got;
  // the hint is the whole answer on no match: it names the missing step, or teaches the intersection form
  return { hint: crCity ? 'No crossing found - try two streets, like Weston & Rutherford' : 'Choose a city first, then search an intersection' };
}
function crMatchFragment(frag) { // names a fragment can mean, best first: a prefix of the name, its short form, or any word
  if (!crCov || !crCov.byName) return [];
  const key = crNameKey(frag); if (!key) return [];
  const scored = [];
  for (const nm of Object.keys(crCov.byName)) {
    const full = crNameKey(nm), short = crNameKey(shortStreetName(nm));
    let s = -1;
    if (full === key || short === key) s = 0;
    else if (full.startsWith(key) || short.startsWith(key)) s = 1;
    else if (full.split(' ').some(w => w.startsWith(key))) s = 2;
    if (s >= 0) scored.push({ nm, s, len: full.length });
  }
  scored.sort((a, b) => a.s - b.s || a.len - b.len || (a.nm < b.nm ? -1 : a.nm > b.nm ? 1 : 0));
  return scored.map(x => x.nm);
}
function crAlongSorter(name) { // a crossing's sort key: projection on the street's main axis - a through road never doubles back against it
  const ways = (crCov && crCov.byName && crCov.byName[name]) || [];
  let n = 0, mx = 0, my = 0;
  for (const w of ways) for (const p of w.pts) { mx += p[1]; my += p[0]; n++; }
  if (!n) return () => 0;
  mx /= n; my /= n;
  const kx = 111320 * Math.cos(my * Math.PI / 180), ky = 110540; // degree-to-metre scales at the street's own latitude, so the axis is the ground's, not the grid's
  let sxx = 0, syy = 0, sxy = 0;
  for (const w of ways) for (const p of w.pts) { const dx = (p[1] - mx) * kx, dy = (p[0] - my) * ky; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy); // the major axis of the covariance ellipse
  const ax = Math.cos(th), ay = Math.sin(th);
  return pt => (pt[1] - mx) * kx * ax + (pt[0] - my) * ky * ay;
}
function crCrossingRows(name) { // every crossing of one street, ordered along the road, one row per cross street (the first stands)
  const xs = crCrossingsOf(name); if (!xs.length) return [];
  const cityBox = (crCity && crCity.bbox) ? crCity.bbox : null; // the pair bound: a crossing outside the city is not offered (the extract's ways run past the boundary)
  const along = crAlongSorter(name);
  const sorted = xs.filter(x => !cityBox || crInBox(cityBox, x.pt[0], x.pt[1])).map(x => ({ other: x.other, pt: x.pt, a: along(x.pt) })).sort((p, r) => p.a - r.a);
  const seen = new Set(), rows = [];
  for (const x of sorted) { if (seen.has(x.other)) continue; seen.add(x.other); rows.push({ it: { lat: String(x.pt[0]), lon: String(x.pt[1]), display_name: name + ' & ' + x.other, address: {}, _isect: true }, other: x.other }); }
  return rows;
}
function crFragmentStreetItems(frag) { // one fragment: crossings of every street it matches, grouped in closeness order; the list caps at 40
  const items = [], streets = new Set();
  for (const nm of crMatchFragment(frag)) {
    const rows = crCrossingRows(nm); if (!rows.length) continue;
    streets.add(nm);
    for (const r of rows) { items.push(r.it); if (items.length >= 40) return { items, streets }; }
  }
  return { items, streets };
}
function crFragmentPairItems(fa, fb) { // two fragments: crossings matching both sides, either orientation (the mirrored scan answers when the first names none)
  const A = crMatchFragment(fa), B = crMatchFragment(fb);
  if (!A.length || !B.length) return { items: [], streets: new Set() };
  const streets = new Set();
  const scan = (fromNames, toSet) => {
    const out = [];
    for (const nm of fromNames) {
      const rows = crCrossingRows(nm).filter(r => toSet.has(r.other)); if (!rows.length) continue;
      streets.add(nm);
      for (const r of rows) { out.push(r.it); if (out.length >= 40) return out; }
    }
    return out;
  };
  let items = scan(A, new Set(B));
  if (!items.length) items = scan(B, new Set(A));
  return { items, streets };
}
document.addEventListener('pointerdown', (e) => { // tapping outside dismisses it (the pick still runs: this only closes the list, in the capture phase)
  if (!creating) return;
  const box = $('createResults');
  if (!box.classList.contains('on')) return;
  if (e.target && (box.contains(e.target) || $('createBar').contains(e.target))) return;
  crResetSearch(); // dismissing ends the search too (via crResetSearch): an un-invalidated landing would reopen the box over the tap-away
}, true);
let crRowState = new Map(); // the results box's live rows, by row text -> { el, leaving, timer }: the populate animation's bookkeeping
let crRowCtx = null; // the last render's shape: a fresh populate is a new context; a typing re-populate continues the same streets
function crRenderRows(res, cont) { // the render is a diff: entries fade in, leavers fade out in place, survivors keep nodes and never re-stagger
  const box = $('createResults');
  const entries = res.hint ? [{ key: 'hint:' + res.hint, hint: res.hint }] : res.items.map(it => ({ key: it.display_name, it }));
  // fresh means a new context; a refresh (cont) is never fresh - the same search continuing as coverage lands
  const fresh = !cont && (!box.classList.contains('on') || !crRowCtx || crRowCtx.hint !== !!res.hint || (!res.hint && !crSharesStreet(crRowCtx.streets, res.streets)));
  const reduced = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const keep = new Set(entries.map(e => e.key));
  for (const [key, st] of Array.from(crRowState)) {
    if (keep.has(key)) continue;
    if (fresh || reduced) { if (st.timer) clearTimeout(st.timer); st.el.remove(); crRowState.delete(key); } // a fresh context (or reduced motion) drops the old rows at once - no fade out of a closed box
    // 190 ms, just past the fade: the entrance releases first (reflow between), or the fade never starts
    else if (!st.leaving) { st.leaving = true; st.el.classList.remove('crRowIn'); void st.el.offsetWidth; st.el.classList.add('crRowOut'); st.timer = setTimeout(() => { st.el.remove(); crRowState.delete(key); }, 190); }
  }
  let anchor = box.firstChild;
  const place = el => { if (el === anchor) anchor = el.nextSibling; else box.insertBefore(el, anchor); }; // survivors and entering rows take the list's order; leaving rows are stepped over and fade where they stand
  for (let ei = 0; ei < entries.length; ei++) {
    const e = entries[ei];
    let st = crRowState.get(e.key);
    if (st && e.it) st.el._crItem = e.it; // a row's destination refreshes every render: the click reads _crItem at tap time, picking what it displays
    if (st && st.leaving) { // narrowed away and back inside one fade: the leave cancels and the row settles back in
      clearTimeout(st.timer); st.timer = null; st.leaving = false; st.el.classList.remove('crRowOut');
      if (ei < 8) { st.el.classList.add('crRowIn'); st.el.style.animationDelay = (ei * 30) + 'ms'; } // the settle-back joins the first-screenful stagger on the same gate as every entrance (below)
    } else if (!st) {
      const el = e.hint ? crHintRowEl(e.hint) : crResultRowEl(e.it);
      if (ei < 8) { el.classList.add('crRowIn'); el.style.animationDelay = (ei * 30) + 'ms'; } // only the first 8 rows stagger (30 ms steps): past them a row is there when scrolled to
      st = { el, leaving: false, timer: null }; crRowState.set(e.key, st);
    } else if (fresh) { // a survivor re-settles in the first screenful; past it the entrance strips, so no delay holds it invisible
      if (ei < 8) { st.el.classList.remove('crRowIn'); void st.el.offsetWidth; st.el.classList.add('crRowIn'); st.el.style.animationDelay = (ei * 30) + 'ms'; }
      else { st.el.classList.remove('crRowIn'); st.el.style.animationDelay = ''; }
    }
    place(st.el);
  }
  if (fresh) { box.classList.remove('crCardIn'); void box.offsetWidth; box.classList.add('crCardIn'); } // the card fades in with its first names seated (the reflow restarts the fade; fresh renders only)
  box.classList.toggle('on', entries.length > 0);
  crRowCtx = res.hint ? { streets: new Set(), hint: true } : { streets: res.streets, hint: false };
}
function crSharesStreet(a, b) { if (!a || !b) return false; for (const s of a) if (b.has(s)) return true; return false; }
function crHintRowEl(text) { // this row is a message in the card, not a result: a plain div, readable, never tappable
  const d = document.createElement('div'); d.className = 'crHintRow'; d.textContent = text; return d;
}
function crResultRowEl(it) { // one row: the pin + the crossing's name; the name is the row text (no address tail here)
  const box = $('createResults');
  const b = document.createElement('button'); b.className = 'crResult'; // the row: the set's pin (its own teardrop, no chip behind it) + the name
  const pin = document.createElement('span'); pin.className = 'crPin'; pin.innerHTML = ICONS.pin;
  const nameEl = document.createElement('span'); nameEl.className = 'crName'; nameEl.textContent = it.display_name;
  b.append(pin, nameEl);
  b._crItem = it; // the destination this row picks, refreshed on every retaining render; the click reads it at tap time
  b.addEventListener('click', () => {
    crResetSearch(); // a result pick ends the search (via crResetSearch): debounce cleared, sequence bumped, or a burst reopens it
    const cur = b._crItem || it; // the item the row displays now: a re-rendered row picks its crossing's coordinates, not its first render's
    const lat = parseFloat(cur.lat), lon = parseFloat(cur.lon); if (!isFinite(lat) || !isFinite(lon)) return;
    // a crossing carries no address: its area is its city's, so the pick's guess stands instead of blanking
    const a = cur.address || {}; crAreaGuess = a.city || a.town || a.village || a.municipality || a.county || (cur._isect && crCity ? crCity.name : '');
    crIsectSet(lat, lon, cur.display_name); // the pick lands the POI surface (name in the bar, marker on the crossing, one lifecycle: crIsectSet/crIsectClear)
    if (map) map.flyTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), 17), duration: 900 }); // intersections land at zoom 17 (the max() form stands: a pick from closer in never zooms out)
    /* inside the picked city: its grid is the preparation - no second download for a search pick */
    if (crGrid && crCity && crInBox(crGrid.bbox, lat, lon)) { }
    else crStartPrep({ lat, lng: lon }); // outside any city coverage, the pick anchors the fallback box preparation: taps then resolve locally
  });
  return b;
}
// ===== crossings ===== answers come from the extract itself (offline, never invented); junction semantics are crStreetParts', dedupe 15 m
let crXIndexCache = null; // { stamp, cells, segs, cross } - rebuilt whenever crCovStamp() moves
function crSegProjM(p, a, b) { // p projected onto segment a-b, in metres: { pt, d }
  const ax = a[1] * MLNG, ay = a[0] * MLAT, bx = b[1] * MLNG, by = b[0] * MLAT, px = p[1] * MLNG, py = p[0] * MLAT;
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; t = t < 0 ? 0 : (t > 1 ? 1 : t);
  const qx = ax + t * dx, qy = ay + t * dy;
  return { pt: [qy / MLAT, qx / MLNG], d: Math.hypot(px - qx, py - qy) };
}
function crSegCrossPt(a, b, c, d) { // where segments a-b and c-d cross, or null; an endpoint counts (parallel pairs register via the vertex test)
  const ax = a[1] * MLNG, ay = a[0] * MLAT, bx = b[1] * MLNG, by = b[0] * MLAT, cx = c[1] * MLNG, cy = c[0] * MLAT, dx = d[1] * MLNG, dy = d[0] * MLAT;
  const rx = bx - ax, ry = by - ay, sx = dx - cx, sy = dy - cy, den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((cx - ax) * sy - (cy - ay) * sx) / den, u = ((cx - ax) * ry - (cy - ay) * rx) / den;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  const tc = t < 0 ? 0 : (t > 1 ? 1 : t);
  return [(ay + tc * ry) / MLAT, (ax + tc * rx) / MLNG];
}
function crXIndex() { // a lazy segment grid over the whole extract (~220 m cells), keyed by the extract's own stamp
  if (!crCov || !crCov.byName || !Object.keys(crCov.byName).length) return null;
  const stamp = crCovStamp();
  if (crXIndexCache && crXIndexCache.stamp === stamp) return crXIndexCache;
  const CS = 220, cells = new Map(), segs = new Map();
  for (const nm of Object.keys(crCov.byName)) {
    const ss = [];
    for (const w of crCov.byName[nm]) for (let i = 1; i < w.pts.length; i++) ss.push([w.pts[i - 1], w.pts[i]]);
    segs.set(nm, ss);
    for (const s of ss) {
      const a0 = Math.floor(Math.min(s[0][0], s[1][0]) * MLAT / CS), a1 = Math.floor(Math.max(s[0][0], s[1][0]) * MLAT / CS);
      const o0 = Math.floor(Math.min(s[0][1], s[1][1]) * MLNG / CS), o1 = Math.floor(Math.max(s[0][1], s[1][1]) * MLNG / CS);
      for (let a = a0; a <= a1; a++) for (let o = o0; o <= o1; o++) { const k = a + ':' + o; let arr = cells.get(k); if (!arr) { arr = []; cells.set(k, arr); } arr.push([nm, s]); }
    }
  }
  crXIndexCache = { stamp, cells, segs, cross: new Map() };
  return crXIndexCache;
}
function crCrossingsOf(name) { // [{ other, pt }] - every crossing of one street with the rest of the extract, cached per stamp
  const ix = crXIndex(); if (!ix || !ix.segs.has(name)) return [];
  const hit = ix.cross.get(name); if (hit) return hit;
  const CS = 220, byOther = new Map();
  const add = (other, pt) => { let arr = byOther.get(other); if (!arr) { arr = []; byOther.set(other, arr); } for (const p of arr) if (distM(p, pt) <= 15) return; arr.push(pt); };
  const PAD = 4; // the window grows by the junction tolerance (4 m): a vertex within tolerance across a cell boundary still gathers
  for (const s of ix.segs.get(name)) {
    const a0 = Math.floor((Math.min(s[0][0], s[1][0]) - PAD / MLAT) * MLAT / CS), a1 = Math.floor((Math.max(s[0][0], s[1][0]) + PAD / MLAT) * MLAT / CS);
    const o0 = Math.floor((Math.min(s[0][1], s[1][1]) - PAD / MLNG) * MLNG / CS), o1 = Math.floor((Math.max(s[0][1], s[1][1]) + PAD / MLNG) * MLNG / CS);
    const seen = new Set();
    for (let a = a0; a <= a1; a++) for (let o = o0; o <= o1; o++) {
      const cellArr = ix.cells.get(a + ':' + o); if (!cellArr) continue;
      for (const e of cellArr) {
        if (e[0] === name || seen.has(e[1])) continue; seen.add(e[1]);
        const t = e[1], xp = crSegCrossPt(s[0], s[1], t[0], t[1]); if (xp) add(e[0], xp);
        for (const v of [t[0], t[1]]) { const pr = crSegProjM(v, s[0], s[1]); if (pr.d <= 4) add(e[0], pr.pt); }
        for (const v of [s[0], s[1]]) { const pr = crSegProjM(v, t[0], t[1]); if (pr.d <= 4) add(e[0], pr.pt); }
      }
    }
  }
  const out = [];
  byOther.forEach((pts, other) => { for (const pt of pts) out.push({ other, pt }); });
  ix.cross.set(name, out);
  return out;
}
function crClusterPts(pts, r) { // one junction can print as several points (a divided road's two carriageways); the centroid of each cluster is the crossing
  const used = new Array(pts.length).fill(false), out = [];
  for (let i = 0; i < pts.length; i++) {
    if (used[i]) continue; used[i] = true; let sx = pts[i][0], sy = pts[i][1], n = 1;
    for (let j = i + 1; j < pts.length; j++) if (!used[j] && distM(pts[i], pts[j]) <= r) { used[j] = true; sx += pts[j][0]; sy += pts[j][1]; n++; }
    out.push([sx / n, sy / n]);
  }
  return out;
}
const CR_ABBR = { rd: 'road',
  st: 'street',
  ave: 'avenue',
  av: 'avenue',
  dr: 'drive',
  ct: 'court',
  crt: 'court',
  blvd: 'boulevard',
  ln: 'lane',
  cres: 'crescent',
  pl: 'place',
  ter: 'terrace',
  cir: 'circle',
  trl: 'trail',
  pkwy: 'parkway',
  sq: 'square',
  hwy: 'highway' };
function crNameKey(s) { // a typed fragment and a pack name meet on one key: lower-case, dots off, a trailing abbreviation spelled out
  const parts = String(s || '').trim().toLowerCase().replace(/\./g, '').split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  if (CR_ABBR[parts[parts.length - 1]]) parts[parts.length - 1] = CR_ABBR[parts[parts.length - 1]];
  return parts.join(' ');
}
let crNameKeysCache = null; // { stamp, map, stem }: a fragment's key -> pack names, rebuilt when the stamp moves, never per keystroke
const CR_DIR_TOKENS = ['east', 'west', 'north', 'south'];
function crNameKeys() { // key forms per street (full, short), plus trailing-directional stem forms (a stem needs a name before it)
  const stamp = crCovStamp();
  if (crNameKeysCache && crNameKeysCache.stamp === stamp) return crNameKeysCache;
  const map = new Map(), stem = new Map();
  const put = (m, k, nm) => { if (!k) return; let arr = m.get(k); if (!arr) { arr = []; m.set(k, arr); } if (!arr.includes(nm)) arr.push(nm); };
  for (const nm of Object.keys(crCov.byName)) {
    for (const k of [crNameKey(nm), crNameKey(shortStreetName(nm))]) put(map, k, nm);
    const toks = String(nm).trim().split(/\s+/);
    if (toks.length > 2 && CR_DIR_TOKENS.includes(toks[toks.length - 1].toLowerCase().replace(/\./g, ''))) {
      const stemName = toks.slice(0, -1).join(' ');
      for (const k of [crNameKey(stemName), crNameKey(shortStreetName(stemName))]) put(stem, k, nm);
    }
  }
  crNameKeysCache = { stamp, map, stem };
  return crNameKeysCache;
}
function crMatchStreetName(part) { // exact names win: the stem map answers only on an exact miss, so a Bloor Street is never shadowed
  if (!crCov || !crCov.byName) return [];
  const key = crNameKey(part); if (!key) return [];
  const keys = crNameKeys();
  const hit = keys.map.get(key) || keys.stem.get(key);
  return hit ? hit.slice() : [];
}
function crParseTwoStreets(q) { // separators 'and' / '&' / 'at' / ',' split a two-street query into [a, b]; anything else does not
  const m = /^\s*(.+?)\s*(?:,|&)\s*(.+?)\s*$/.exec(q) || /^\s*(.+?)\s+(?:and|at)\s+(.+?)\s*$/i.exec(q);
  if (!m) return null;
  const a = m[1].trim(), b = m[2].trim();
  return (a && b) ? [a, b] : null;
}
function crStreetFamily(part) { // exact names plus their kin, exact first: the family answers only when the exact pair yields no crossing
  if (!crCov || !crCov.byName) return [];
  const key = crNameKey(part); if (!key) return [];
  const keys = crNameKeys();
  const out = [];
  for (const src of [keys.map.get(key), keys.stem.get(key)]) if (src) for (const n of src) if (!out.includes(n)) out.push(n);
  return out;
}
function crIntersectionItem(q) { // piece 1: the crossing of two named streets, resolved from the extract alone - no network involved
  if (!crCov || !crCov.byName || !crCov.boxes.length) return null;
  const parts = crParseTwoStreets(q); if (!parts) return null;
  const As = crMatchStreetName(parts[0]), Bs = crMatchStreetName(parts[1]);
  if (!As.length || !Bs.length) return null;
  const ctr = (typeof map !== 'undefined' && map) ? map.getCenter() : null; // several crossings of one pair: the one nearest the map centre wins - the search's standing map bias
  const cityBox = (crCity && crCity.bbox) ? crCity.bbox : null; // candidates are city-bounded before clustering: an inside+outside pair keeps its inside crossing; only-outside yields none
  const scan = (aNames, bNames) => {
    let best = null;
    for (const A of aNames) {
      const xs = crCrossingsOf(A); if (!xs.length) continue;
      for (const B of bNames) {
        if (B === A) continue;
        const pts = [];
        for (const x of xs) if (x.other === B && (!cityBox || crInBox(cityBox, x.pt[0], x.pt[1]))) pts.push(x.pt);
        if (!pts.length) continue;
        for (const c of crClusterPts(pts, 30)) { const d = ctr ? distM(c, [ctr.lat, ctr.lng]) : 0; if (!best || d < best.d) best = { d, pt: c, A, B }; }
      }
    }
    return best;
  };
  let best = scan(As, Bs);
  if (!best) { // the pair may never touch: retry once with each side widened to its family before the network
    const fA = crStreetFamily(parts[0]), fB = crStreetFamily(parts[1]);
    if (fA.length > As.length || fB.length > Bs.length) best = scan(fA, fB);
  }
  if (!best) return null;
  return { lat: String(best.pt[0]), lon: String(best.pt[1]), display_name: best.A + ' & ' + best.B, address: {}, _isect: true };
}
const CR_SUFFIX = /\s+(Drive|Court|Boulevard|Lane|Street|Avenue|Crescent|Road|Place|Ridge|Way|Terrace|Circle|Gate|Heights|Trail|Parkway)$/;
const CR_ORDINALS = { '1st': 'First', '2nd': 'Second', '3rd': 'Third', '4th': 'Fourth', '5th': 'Fifth', '6th': 'Sixth', '7th': 'Seventh', '8th': 'Eighth', '9th': 'Ninth', '10th': 'Tenth', '11th': 'Eleventh', '12th': 'Twelfth' };
function shortStreetName(osm) { // the app's short-name convention (the sandbox's suffix rule; ordinal avenues spell out - 5th Avenue is Fifth)
  const m = /^(\d+(?:st|nd|rd|th))\s+Avenue$/i.exec(osm);
  if (m && CR_ORDINALS[m[1].toLowerCase()]) return CR_ORDINALS[m[1].toLowerCase()];
  const s = osm.replace(CR_SUFFIX, '');
  return s && s !== osm ? s : osm;
}
function crLineLen(pts) { let s = 0; for (let i = 1; i < pts.length; i++) s += distM(pts[i - 1], pts[i]); return s; }
function chainWays(ways) { // the stitch: greedy endpoint chaining at 1.5 m into runs; a bridged run stores as its stitched line
  const pool = ways.map(w => w.slice());
  const lens = pool.map(w => crLineLen(w)); // way lengths compute once: the seed scan re-reads them per run (re-walking points per scan was quadratic)
  const runs = [];
  while (pool.length) {
    let bi = 0; for (let i = 1; i < pool.length; i++) if (lens[i] > lens[bi]) bi = i;
    const first = pool.splice(bi, 1)[0]; lens.splice(bi, 1);
    let line = first.slice(); const segs = [first]; let exact = true;
    let grew = true;
    while (grew) {
      grew = false;
      for (let i = 0; i < pool.length; i++) {
        const s = pool[i], a = s[0], b = s[s.length - 1], L0 = line[0], L1 = line[line.length - 1];
        const dAL1 = distM(a, L1), dBL1 = distM(b, L1), dBL0 = distM(b, L0), dAL0 = distM(a, L0);
        let addLine = null, addSeg = null, dJoin = 0;
        if (dAL1 <= 1.5) { addLine = s.slice(1); addSeg = s; dJoin = dAL1; line = line.concat(addLine); }
        else if (dBL1 <= 1.5) { addLine = s.slice(0, -1).reverse(); addSeg = s.slice().reverse(); dJoin = dBL1; line = line.concat(addLine); }
        else if (dBL0 <= 1.5) { addLine = s.slice(0, -1); addSeg = s; dJoin = dBL0; line = addLine.concat(line); }
        else if (dAL0 <= 1.5) { addLine = s.slice(1).reverse(); addSeg = s.slice().reverse(); dJoin = dAL0; line = addLine.concat(line); }
        else continue;
        if (dJoin > 0.01) exact = false;
        segs.push(addSeg); pool.splice(i, 1); lens.splice(i, 1); grew = true; break;
      }
    }
    runs.push({ segments: segs, line, exact });
  }
  return runs;
}
const OVERPASS_URLS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']; // primary + fallback (both named in the stamped CSP's connect-src)
async function pickStreet(osmName, lngLat) {
  if (!draft) return;
  const name = osmName; // the draft key IS the full map name; the short form appears only in display text
  const exists = Object.prototype.hasOwnProperty.call(draft.roads, name); // own-property, not a bare read: 'constructor' on a plain object reads as already picked and misroutes the tap
  if (exists && (crPickBusy || !(crCov && crCov.boxes.length))) { crOpenSectors(name); return; } // picked, with no extract to resolve against or a pick in flight: the sectors door, as before
  if (Object.prototype.hasOwnProperty.call(crPending, name)) return; // the same own-property rule for the pending read
  if (crPickBusy) return;
  // taps resolve locally (no network); before the extract lands, a tap identifies its street, never pretending to add
  if (crCov && crCov.boxes.length) {
    const res0 = crResolve(osmName, lngLat);
    if (res0.status === 'ok') {
      if (!exists) { crAddStreet(name, res0.segs); return; }
      if (crRunHeld(name, res0.segs)) { crOpenSectors(name); return; } // the tap landed on a run the draft already holds: the 1.128 sectors door
      crAddRun(name, res0.segs); return; // the tap landed on a DIFFERENT disconnected run of the picked street: it joins the same street entry
    }
    if (exists) {
      if (res0.status === 'edge' && res0.run && !crRunHeld(name, res0.run.exact ? res0.run.segments : [res0.run.line])) return;
      // an unheld run past verified coverage is never half-added over an existing pick; wider preparation + a fresh tap wins
      crOpenSectors(name); return; // absent/nocov against committed coverage, or an edge tap on the held run: the sectors door is the answer
    }
    if (res0.status === 'absent') {
      if (crInAnyBox(crCov.boxes, lngLat.lat, lngLat.lng)) return;
      if (crGrid && crInBox(crGrid.bbox, lngLat.lat, lngLat.lng)) return;
      crPrepAnchor = { lat: lngLat.lat, lng: lngLat.lng }; crWanted = { anchor: { lat: lngLat.lat, lng: lngLat.lng }, label: 'Prepare this area' }; crRenderHint();
      return;
    }
    // past coverage: one fetch for this name over an area, merged by id, resolved again; still past, pending
    const session = crSession, gen = crCovGen, topKey = name + '@' + gen;
    if (crToppedUp[topKey]) { crPendStreet(name, lngLat, res0.run, null); return; }
    crToppedUp[topKey] = true;
    crPickBusy = true;
    const op = {}; crTopOp = op; // exitCreate can stop this download too (CG-PF-10)
    try {
      let openEnd = { lat: lngLat.lat, lng: lngLat.lng };
      if (res0.run && res0.run.line) { for (const end of [res0.run.line[0], res0.run.line[res0.run.line.length - 1]]) { if (!crInAnyBox(crCov.boxes, end[0], end[1])) { openEnd = { lat: end[0], lng: end[1] }; break; } } }
      const box = crBoxAround(openEnd.lat, openEnd.lng, CR_INNER_KM + CR_BUFFER_KM + CR_TOPUP_RING_KM);
      const got = await crSourceExtract(box, osmName, CR_TIMING.topupBudgetMs, CR_TIMING.topupAttempt1Ms, () => creating && crSession === session && crCovGen === gen, op);
      if (!creating || crSession !== session || crCovGen !== gen || !draft) return; // obsolete: land nowhere (CG-PF-05)
      if (!got.ok) {
        if (got.kind === 'error' || got.kind === 'badjson') showBanner(shortStreetName(name) + ' not added', 'The street service answered with an error');
        else if (got.kind !== 'stale' && got.kind !== 'dense') showBanner(shortStreetName(name) + ' not added', 'The street service did not answer');
        crRenderHint();
        return;
      }
      crCovMerge(got.json.elements, null); // the top-up's box verifies this resolution but never joins coverage: a later street earns its own proof
      const res = crResolve(osmName, lngLat, box);
      if (res.status === 'ok') crAddStreet(name, res.segs); else crPendStreet(name, lngLat, res.run, box);
    } finally { if (crTopOp === op) crTopOp = null; crPickBusy = false; } // every exit releases the picker: the busy flag is the in-flight pick's alone, never a newer operation's
    return;
  }
  if (exists) { crOpenSectors(name); return; } // an extract exists but holds no verified box yet - the picked street's sectors are still the honest door
  if (crPrepState === 'preparing') return;
  crPrepAnchor = { lat: lngLat.lat, lng: lngLat.lng };
  crWanted = { anchor: { lat: lngLat.lat, lng: lngLat.lng }, label: 'Prepare this area' }; // the offer names THIS tap's area, and the hint button prepares exactly there (CG-PF-09)
  crRenderHint();
}
function crFeatDistM(lngLat, geom) { // metres from tap to a feature line's nearest point: choice only (which street was meant), never stored
  if (!geom) return Infinity;
  const lines = geom.type === 'LineString' ? [geom.coordinates] : (geom.type === 'MultiLineString' ? geom.coordinates : []);
  const px = lngLat.lng * MLNG, py = lngLat.lat * MLAT;
  let best = Infinity;
  for (const line of lines) {
    if (!Array.isArray(line)) continue;
    for (let i = 0; i < line.length; i++) {
      const ax = line[i][0] * MLNG, ay = line[i][1] * MLAT;
      const d0 = Math.hypot(px - ax, py - ay); if (d0 < best) best = d0;
      if (i > 0) {
        const bx = line[i - 1][0] * MLNG, by = line[i - 1][1] * MLAT;
        const dx = ax - bx, dy = ay - by, L2 = dx * dx + dy * dy;
        let t = L2 ? ((px - bx) * dx + (py - by) * dy) / L2 : 0; t = Math.max(0, Math.min(1, t));
        const d = Math.hypot(px - (bx + t * dx), py - (by + t * dy)); if (d < best) best = d;
      }
    }
  }
  return best;
}
function crFeatDistPx(lngLat, part) { // pixels from tap to a part line's nearest point (projection): fallback is judged in its boxes' unit
  const pt = map.project([lngLat.lng, lngLat.lat]);
  let best = Infinity, prev = null;
  for (const p of part) {
    const q = map.project([p[1], p[0]]);
    if (prev) {
      const dx = q.x - prev.x, dy = q.y - prev.y, L2 = dx * dx + dy * dy;
      let t = L2 ? ((pt.x - prev.x) * dx + (pt.y - prev.y) * dy) / L2 : 0; t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(pt.x - (prev.x + t * dx), pt.y - (prev.y + t * dy)); if (d < best) best = d;
    } else { const d0 = Math.hypot(pt.x - q.x, pt.y - q.y); if (d0 < best) best = d0; }
    prev = q;
  }
  return best;
}
function crMapTap(e) {
  if (!creating || crStage !== 'pick' || !map) return;
  if (crSectorSession.street) { if (!crSectorTap(e.lngLat)) crCancelSectors(); return; } // while trimming, taps speak only to the trimmed street: no sector resolved = tap-away, running crCancelSectors
  // a box query, not a pixel: tile geometry only chooses the street meant, and is never stored
  const roadFeats = (half) => {
    let feats = [];
    try { feats = map.queryRenderedFeatures([[e.point.x - half, e.point.y - half], [e.point.x + half, e.point.y + half]]) || []; } catch (err) {}
    return feats.filter(x => x && x.sourceLayer === 'roads' && x.properties && typeof x.properties.name === 'string' && !!x.properties.name);
  };
  let pick = null;
  for (const half of CR_TAP_BOXES) { // a finger's real tolerance first, one wider retry before giving up (the widths live at CR_TAP_BOXES)
    const named = roadFeats(half);
    if (!named.length) continue;
    let pickD = Infinity;
    for (const f of named) { const d = crFeatDistM(e.lngLat, f.geometry); if (d < pickD) { pickD = d; pick = f.properties.name; } }
    if (!pick) pick = named[0].properties.name; // a named road whose tile line is unusable still names the street - the name is the identity
    break; // the first box that names any road decides
  }
  if (!pick) return;
  pickStreet(pick, e.lngLat);
}
onMapReady(() => map.on('click', crMapTap));
$('crDoneBtn').addEventListener('click', () => { if (draftStreets().length) setCreateStage('preview'); }); // 'Done': the panel footer's ONLY button - tucking belongs to the head's grab/tap gesture, not a footer button
$('crReviewBtn').addEventListener('click', () => crExpandPanel()); // the bar's way back (mockup screen 4)
$('crClearAll').addEventListener('click', () => { // empty the picks at once, behind the confirm (Start over's discipline); the city and session stay
  const n = draft ? draftStreets().length : 0; if (!n) return;
  // the wholesale reset lives on the DRAFT owner (its clearAll method)
  crConfirm('Clear all ' + n + (n === 1 ? ' road?' : ' roads?'), 'Every road you picked will be taken off this route. The city stays loaded.', () => { DRAFT.clearAll(); }, { yes: 'Clear all', no: 'Cancel', danger: true });
});
$('crSbWhole').addEventListener('click',
  () => { const s = crSectorSession.street; if (!s) return; const rec = crStreetParts(s); if (rec) crSetChosen(s, rec, new Set(rec.parts.map((_, i) => i))); renderDraft(); renderCrLists(); renderSectorBar(); });
// Entire road: every sector back on (the pick is stored as no entry again)
$('crSbDone').addEventListener('click', () => crCloseSectors()); // Done: back to the panel
$('crSbDeselect').addEventListener('click', () => crDeselectSectors()); // Deselect: the street leaves entirely through crRemoveStreet (the snapshot restore lives on the tap-away, crCancelSectors)
(() => { // the tuck-away gesture: drag/flick the handle down, or tap it, to collapse; header buttons keep their taps
  const sheet = $('createSheet'), head = $('crPanelHead'); if (!sheet || !head) return; // the drag moves the SURFACE (the one card), not a face inside it
  let pid = null, startY = 0, lastY = 0, samples = [], moved = false;
  head.addEventListener('pointerdown', e => {
    if (pid !== null || e.target.closest('button')) return;
    pid = e.pointerId; startY = lastY = e.clientY; samples = [{ t: performance.now(), y: e.clientY }]; moved = false;
    cancelSheetSpring(sheet); crSettleMorph(); // a grab mid-settle takes the surface over from its live position (and lands any face morph in flight)
  });
  head.addEventListener('pointermove', e => {
    if (pid === null || e.pointerId !== pid) return;
    lastY = e.clientY;
    samples.push({ t: performance.now(), y: e.clientY }); if (samples.length > 8) samples.shift();
    const dy = lastY - startY;
    if (Math.abs(dy) > 4) { if (!moved) { moved = true; try { head.setPointerCapture(pid); } catch (err) {} } }
    if (moved && dy > 0) { sheet.style.transform = 'translateY(' + dy + 'px)'; e.preventDefault(); }
  });
  const up = e => {
    if (pid === null || (e && e.pointerId !== pid)) return;
    pid = null;
    if (!moved) { crCollapsePanel(0, 0); return; } // a tap on the handle/header tucks the panel away
    const dy = Math.max(0, lastY - startY);
    const now = performance.now(); const s0 = samples.find(s => now - s.t <= 130) || samples[0];
    const dt = now - s0.t; const vy = dt >= 30 ? (lastY - s0.y) / dt : 0; // px/ms, positive = downward (the sheets' release-velocity rule)
    if (dy > 70 || vy > 0.45) crCollapsePanel(dy, vy * 1000);
    else springSheet(sheet, dy, 0, vy * 1000, q => { sheet.style.transform = 'translateY(' + q + 'px)'; }, () => { sheet.style.transform = ''; });
  };
  head.addEventListener('pointerup', up);
  head.addEventListener('pointercancel', up);
})();
$('pvAddBtn').addEventListener('click', () => { // back to picking for more; Done there returns to this same preview (the button's label never changes)
  if (crCity) { setCreateStage('pick'); return; }
  if (draft && draft.area) { crCity = { name: draft.area, lat: null, lon: null, bbox: null }; setCreateStage('pick'); return; } // a draft that names its city pre-answers the city step - still changeable from the pick sheet's city chip
  crOpenCityPane('preview');
});

