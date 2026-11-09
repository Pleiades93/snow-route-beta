// Beta 1.153 (Andrew): the loaded-city confirmation pill's self-dismissal clock.
// crPillKey is the confirmation currently on its 4 s clock; crPillGone is the one
// already dismissed this create session (road taps re-render the hint - a dismissed
// confirmation stays dismissed). Failures, progress, offers and disclosures never
// ride this clock: they are not confirmations.
let crPillT = 0, crPillKey = '', crPillGone = '';
function crRenderHint() { // the ONE writer of the pick-stage hint + its action button + the sheet's city chip: state-driven, so no stale text survives a state change
  if (!creating || crStage !== 'pick') return;
  // The confirmation is exactly ONE render state: ready, restored from the
  // on-device cache, with nothing outstanding - no wanted offer pending and no
  // cache/pack note riding the text (a disclosure is not a confirmation).
  const pillKey = (!crSectorSession.street && crPrepState === 'ready' && crGrid && crGrid.fromCache && crGrid.savedAt && !crWanted && !(crCacheNote && crCity && crCacheNoteCity === crCity.name) && !(crPackNote && crCity)) ? crGrid.name + '@' + crGrid.savedAt : '';
  if (pillKey) {
    if (crPillKey !== pillKey) { // a NEW confirmation: start its clock (a re-render of the same one leaves the clock running)
      if (crPillT) clearTimeout(crPillT);
      crPillKey = pillKey;
      const key = pillKey;
      crPillT = setTimeout(() => { crPillT = 0; if (crPillKey !== key) return; crPillKey = ''; crPillGone = key; $('createHint').classList.remove('on'); $('crHintBtn').style.display = 'none'; }, 4000);
    }
  } else if (crPillKey) { if (crPillT) clearTimeout(crPillT); crPillT = 0; crPillKey = ''; }
  const hint = $('createHint'), btn = $('crHintBtn');
  if (crSectorSession.street) { hint.textContent = 'Tap sectors to add or remove them'; hint.classList.add('on'); btn.style.display = 'none'; return; } // Beta 1.127 (mockup screen 1): while trimming, the pill says the one thing there is to do
  let text = '', btnLabel = '';
  const secs = t0 => Math.max(0, Math.round((Date.now() - t0) / 1000));
  if (crPrepState === 'preparing' && crPrep) { text = 'Preparing street shapes for ' + (crCity ? crCity.name : 'this area') + '… ' + secs(crPrep.startedAt) + ' s'; btnLabel = 'Cancel'; } // the fallback box, when IT is the in-flight operation: it outranks the grid text - a settled (or still-loading) city grid must not label a box wait with stale part counts
  else if (crPrepState === 'preparing' && crGrid) { // the city grid: REAL progress - parts landed of parts total, and elapsed (amendment B: no fake percentages, the count is the count)
    const done = crGridDoneCount(), total = crGrid.cells.length, failed = crGridFailedCount();
    if (crGrid.fromPack && !crPackNote) text = 'Loading ' + crGrid.name + ' from the app’s own library… ' + secs(crGrid.startedAt) + ' s'; // Beta 1.123: a pack load is ONE download, not parts - the wording names the fast path and keeps only the honest elapsed clock (no part counts, no percentages, and never the service's name for the library's work)
    else text = 'Loading ' + crGrid.name + ' — part ' + done + ' of ' + total + ' · ' + secs(crGrid.startedAt) + ' s' + (failed ? ' · ' + failed + ' failed so far' : '');
    btnLabel = 'Cancel';
  }
  else if (crPrepState === 'degraded' && crGrid) {
    if (crGrid.stopped === 'cancelled') { text = 'Loading stopped — ' + crGridDoneCount() + ' of ' + crGrid.cells.length + ' parts of ' + crGrid.name + ' loaded'; btnLabel = 'Resume'; }
    else { text = crGrid.name + ' loaded except ' + (crGridFailedCount() + crGridPendingCount()) + ' part' + ((crGridFailedCount() + crGridPendingCount()) === 1 ? '' : 's') + ' — streets there may be missing'; btnLabel = 'Retry missing parts'; }
    if (crWanted) btnLabel = crWanted.label;
  }
  else if (crPrepState === 'failed') { text = crFailText(crPrepFail); btnLabel = crGrid ? 'Retry' : ((crPrepFail && crPrepFail.kind === 'dense') ? 'Prepare this area' : 'Retry'); if (crWanted) btnLabel = crWanted.label; } // grid failure: Retry resumes the missing cells. Box dense: Retry at the same anchor cannot help (fixed footprint) - the button prepares wherever the map now sits (CG-PF-09). Beta 1.154 (B3 build): the wanted override applies in this branch too, as it always did in the degraded/ready branches - through 1.153 an outstanding offer's button read 'Retry' here while the click actually started the fallback preparation at the wanted anchor (the 2026-11-09 lifecycle trace's label wart); with no offer outstanding the label stays 'Retry', and the click is then genuinely a retry
  else if (crPrepState === 'ready') {
    if (crGrid && crGrid.fromCache && crGrid.savedAt) { const d = new Date(crGrid.savedAt); text = crGrid.name + ' — loaded ' + d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }); } // Beta 1.153 (Andrew): the pill is a load confirmation ONLY - city + when it loaded, no 'tap a road', and no Refresh button: a city that loaded fine offers no reload. The failed state's Retry (grid resume / re-prepare) is the one working remedy, and it predates this change.
    else text = draftStreets().length ? 'Tap a road on the map to add it' : 'Street shapes ready — tap a road';
    if (crWanted) btnLabel = crWanted.label; // an outstanding offer (a tap outside coverage, a pending street) keeps its working button in the ready state too (CG-PF-09: the first build's ready state hid it) - since Beta 1.153 removed the healthy-state Refresh, it is the ready state's only button
  }
  else { text = crCity ? 'Search for a street in ' + crCity.name + ', or zoom in and prepare this area' : 'Search, fly to a street, then tap it on the map'; if (crWanted) btnLabel = crWanted.label; else if (map && map.getZoom() >= 14) btnLabel = 'Prepare this area'; }
  if (crCacheNote && crCity && crCacheNoteCity === crCity.name) text += ' · ' + crCacheNote; // the disclosed cache state rides the hint (amendment C: degradation is said, never silent) - Beta 1.143 (DA-06): only when the note belongs to the city on screen
  if (crPackNote && crCity) text += ' · ' + crPackNote; // Beta 1.123: the disclosed pack state rides the hint the same way - a fallen-back load says the library didn't load, in every state the hint shows
  hint.textContent = text; hint.classList.toggle('on', !(pillKey && crPillGone === pillKey)); // Beta 1.153: a confirmation already dismissed this session does not reappear on re-renders
  if (btnLabel) { btn.textContent = btnLabel; btn.style.display = ''; } else btn.style.display = 'none';
  const cc = $('crCityChange'); if (cc) { if (crCity) { cc.textContent = 'City: ' + crCity.name + ' — change'; cc.style.display = ''; } else cc.style.display = 'none'; }
}
function crAddStreet(name, segs) { // Beta 1.144 (Package C, DA-04): the draft keys on the FULL map name - through 1.143 the key was shortStreetName(osmName), so two distinct streets sharing a shortened name (Addington Avenue / Addington Place) collided: only the first could ever enter a draft, and tapping the second opened the first's sectors. shortStreetName survives ONLY as the display form (toasts, rows, the sector bar's title); every key in the draft - roads, mains, sectors, parts, pending - is the full name, and the saved pack inherits the full names, so both streets can live in one route.
  draft.roads[name] = segs; draft.osmNames[name] = name; crGeomGen++; // a tapped street joins as a SECONDARY (fork 3) - flip it to MAIN in the list if it is one. Beta 1.135 (N3): the generation bump is the draft-geometry cache's invalidation for this in-place join (see crDraftGeom)
  delete crPending[name];
  renderDraft(); renderCrLists(); crRenderHint();
  // Beta 1.153 (Andrew): no 'Added' popup - the road's own picked state on the map and in the panel is the feedback.
}
function crRunHeld(name, segs) { // Beta 1.144 (OPT-L1): is this resolved run ALREADY part of the draft street? Segment identity is exact - a run's stored segments are the extract's way point arrays (or its stitched line when the run was bridged), and resolving the same run again reproduces them deterministically, so set membership on the serialized segments is the identity test
  const held = new Set((draft.roads[name] || []).map(sg => JSON.stringify(sg)));
  return segs.length > 0 && segs.every(sg => held.has(JSON.stringify(sg)));
}
function crAddRun(name, segs) { // Beta 1.144 (OPT-L1): a further DISCONNECTED run of an already-picked street joins the SAME street entry - the segment list grows (the run's parts append after the existing runs' parts: runs form in segment order, so existing sector indexes keep their meaning), the geometry cache invalidates, and the cached sector record dies so boundaries recompute over the fuller street. A trimmed street keeps its trim AND gains the new run's parts as chosen - the tap that added the run was a pick, so its parts join the chosen set explicitly rather than falling out of the save by omission; an untrimmed street simply stays whole.
  const before = (draft.sectors && draft.sectors[name]) ? crStreetParts(name) : null;
  draft.roads[name] = draft.roads[name].concat(segs); crGeomGen++;
  if (draft.parts) delete draft.parts[name];
  if (before) {
    const rec = crStreetParts(name);
    if (rec) { const set = crChosenSet(name, before); for (let i = before.parts.length; i < rec.parts.length; i++) set.add(i); crSetChosen(name, rec, set); }
  }
  renderDraft(); renderCrLists(); crRenderHint();
  // Beta 1.153 (Andrew): no 'Added the other part' popup either - same rule as crAddStreet.
}
function crRemoveStreet(name) { // Beta 1.127: the ONE removal path - the panel's x, the preview's x and Clear all land here (Beta 1.128: those are the ONLY doors; a map tap on a picked street opens its sectors instead), so a street leaves with ALL of its draft state (geometry, main flag, names, sector pick, cached parts) and every face re-renders from the same state
  if (!draft || !draft.roads[name]) return;
  delete draft.roads[name]; draft.mains.delete(name); delete draft.osmNames[name]; crGeomGen++; // Beta 1.135 (N3): the removal invalidates the shared draft geometry (see crDraftGeom)
  if (draft.sectors) delete draft.sectors[name];
  if (draft.parts) delete draft.parts[name];
  delete crPending[name];
  if (crSectorSession.street === name) crSectorReset();
  renderDraft(); renderCrLists(); crRenderHint();
}
// ---- sectors (Beta 1.127, Andrew's approved mockups in beta1/work/create-sectors-mockups/):
// a picked street can be trimmed to the junction-to-junction pieces he
// actually cleans - a long road that runs past his subdivision enters
// the route only as far as he cleans it. Sector state lives ONLY in
// the draft (draft.sectors[name] = chosen part indexes; absent = the
// whole road); at Save the stored pack's roads[name] holds only the
// chosen sectors' polylines, so the pack format is unchanged and
// everything downstream derives from the stored geometry as always.
// Beta 1.144 (DA-02/C1): a street's sectors span ALL its disconnected
// runs - the parts list is the runs' pieces concatenated in run order,
// so non-adjacent picks (sectors 0 and 2, a middle skipped) save as
// disconnected segments and the saved route tracks every chosen metre.
function crStreetParts(name) { // the street's sectors: its stitched runs cut where OTHER streets of the prepared extract meet them - computeStretches' own cut rule (4 m join tolerance, cuts merged under 15 m, no cut within 12 m of an end) with the EXTRACT as the junction set. The extract, not the draft, is the context on purpose: the pieces are the real junction-to-junction pieces, and a street's sector boundaries never move as other streets join or leave the draft. Computed once per street per draft (cached on draft.parts); vertices are bbox-prefiltered to the run's neighbourhood, so a whole city's extract costs one bounded pass per run, paid only when sector mode first opens for the street. Beta 1.144: the cutting runs PER RUN (stitchRuns) and the record carries runs alongside the principal line - a single-run street's record is exactly the pre-1.144 one.
  if (!draft || !draft.roads[name]) return null;
  draft.parts = draft.parts || {};
  if (draft.parts[name]) return draft.parts[name];
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
    const rParts = finishJunctionCuts(line, cum, rTotal, cuts); // Beta 1.131 (programme N2): the finishing policy is shared with computeStretches - see finishJunctionCuts (app1). Only the junction SOURCE differs (the prepared extract, collected above); the policy exists exactly once.
    runs.push({ line, cum, total: rTotal, parts: rParts });
    for (const rp of rParts) parts.push(rp);
    total += rTotal;
  }
  const rec = { line: runs[0].line, cum: runs[0].cum, total, parts, runs };
  draft.parts[name] = rec;
  return rec;
}
function crChosenSet(name, rec) { const sel = draft && draft.sectors ? draft.sectors[name] : null; return new Set(sel || rec.parts.map((_, i) => i)); } // no entry = every sector chosen (the whole road)
function crSetChosen(name, rec, set) { // a FULL set stores as NO entry - "whole road" stays the draft's default state, so an untrimmed street carries no sector baggage into counts or the save
  draft.sectors = draft.sectors || {};
  if (set.size >= rec.parts.length) delete draft.sectors[name];
  else draft.sectors[name] = [...set].sort((a, b) => a - b);
}
function crChosenLenM(name, rec) { const set = crChosenSet(name, rec); let s = 0; for (const i of set) if (rec.parts[i]) s += crLineLen(rec.parts[i]); return s; }
function crStreetChosenM(name, g) { // a street's length AS PICKED - the whole street, or only its chosen sectors when trimmed. Every length the create flow states (panel header + rows, preview count, name-it summary) reads through here, so a trimmed street never bills its unchosen ends
  const sel = draft && draft.sectors ? draft.sectors[name] : null;
  if (!sel) return g && g[name] ? g[name].total : 0;
  const rec = crStreetParts(name); if (!rec) return 0;
  let s = 0; for (const i of sel) if (rec.parts[i]) s += crLineLen(rec.parts[i]);
  return s;
}
function crFilteredRoads() { // the roads object the SAVE stores: a trimmed street contributes ONLY its chosen sectors' polylines (each sector as one segment). The pack format is untouched (roads = segment lists); the unchosen ends simply never enter the pack
  const out = {};
  for (const n of draftStreets()) {
    const sel = draft.sectors ? draft.sectors[n] : null;
    if (sel && sel.length) { const rec = crStreetParts(n); out[n] = rec ? sel.map(i => rec.parts[i]).filter(p => p && p.length > 1) : draft.roads[n]; }
    else out[n] = draft.roads[n];
  }
  return out;
}
function crToggleSector(name, idx) {
  const rec = crStreetParts(name); if (!rec || idx < 0 || idx >= rec.parts.length) return;
  if (rec.parts.length === 1) { toast(shortStreetName(name) + ' is one piece — there are no cross-streets to trim it at', 2600); return; } // Beta 1.128: a one-piece street's only sector IS the whole road - tapping it in 1.127 un-picked the street entirely, the exact trap behind Andrew's report; the bar says it plainly and the tap changes nothing
  const set = crChosenSet(name, rec);
  if (set.has(idx)) set.delete(idx); else set.add(idx);
  if (!set.size) { crRemoveStreet(name); toast(shortStreetName(name) + ' removed - no sectors left picked', 2400); return; } // un-picking every sector removes the street (crRemoveStreet also closes its sector mode)
  crSetChosen(name, rec, set);
  renderDraft(); renderCrLists(); renderSectorBar();
}
// Beta 1.156 (Andrew, device feedback 2026-11-09): the create flow's tap
// discipline - the two query-box half-widths (px) BOTH tap handlers search
// around a tap, first reach then one wider retry, and the reach
// crSectorTap's geometry fallback honours. Through 1.155 the boxes were
// [16, 28] (Beta 1.119, set after point queries hit nothing); Andrew on
// device: he could tap pretty far left or right of a road and still select
// it. Narrowed to [12, 20] - still a fingertip's tolerance plus a retry,
// but a tap must be honestly near the line. One literal for the whole
// discipline: both loops and the fallback cap read it here.
const CR_TAP_BOXES = [12, 20];
function crSectorTap(lngLat) { // a map tap while trimming: the sector under the tap toggles. The rendered draft features answer first (the wide invisible crDraftHit layer, the street pick's own CR_TAP_BOXES box discipline); the geometry fallback - the nearest part of THIS street - covers what the renderer cannot answer, and never reaches for another street
  const name = crSectorSession.street; if (!name || !draft || !draft.roads[name]) return;
  const rec = crStreetParts(name); if (!rec) return;
  let idx = -1;
  if (map && typeof map.queryRenderedFeatures === 'function' && typeof map.project === 'function') {
    try {
      const pt = map.project([lngLat.lng, lngLat.lat]);
      for (const half of CR_TAP_BOXES) {
        const feats = (map.queryRenderedFeatures([[pt.x - half, pt.y - half], [pt.x + half, pt.y + half]], { layers: ['crDraftHit'] }) || []).filter(f => f && f.properties && f.properties.name === name && typeof f.properties.sector === 'number' && f.properties.sector >= 0);
        if (!feats.length) continue;
        let bd = Infinity;
        for (const f of feats) { const d = crFeatDistM(lngLat, f.geometry); if (d < bd) { bd = d; idx = f.properties.sector; } }
        break;
      }
    } catch (e) {}
  }
  if (idx < 0) {
    // Beta 1.156: the fallback is judged in the boxes' own unit - projected
    // pixels - not only in metres. Through 1.155 its only cap was 75 m
    // (~87 px at zoom 17, ~44 px at zoom 16), far looser than any box, so a
    // far tap could still toggle a sector whenever the renderer answered
    // nothing. The nearest part now answers only inside the retry box's
    // reach (CR_TAP_BOXES[1]); the 75 m rule stays on top as an absolute
    // guard (it binds first when zoomed far out, where 20 px spans more
    // than 75 m). Without a projection there are no pixels to judge by and
    // the metre rule stands alone, exactly as before.
    let bd = Infinity;
    const canPx = !!(map && typeof map.project === 'function');
    for (let i = 0; i < rec.parts.length; i++) { const d = canPx ? crFeatDistPx(lngLat, rec.parts[i]) : crFeatDistM(lngLat, { type: 'LineString', coordinates: rec.parts[i].map(p => [p[1], p[0]]) }); if (d < bd) { bd = d; idx = i; } }
    if (idx >= 0 && bd > (canPx ? CR_TAP_BOXES[1] : 75)) idx = -1; // beyond the tap discipline's reach - not a sector tap
    else if (idx >= 0 && canPx && crFeatDistM(lngLat, { type: 'LineString', coordinates: rec.parts[idx].map(p => [p[1], p[0]]) }) > 75) idx = -1; // the standing 75 m absolute guard
  }
  if (idx >= 0) crToggleSector(name, idx);
}
function crOpenSectors(name) { // opens a picked street's trimming - TWO doors since Beta 1.128 (Andrew's fork, decided from his 1.127 device session): the panel row (1.127) AND a map tap on the already-picked street (pickStreet routes here), which is where his finger went on device. Beta 1.129: entry SNAPSHOTS the street's pick as it stands (whole road, or the trim in force) - the sector bar's Cancel restores that snapshot exactly
  if (!draft || !draft.roads || !Object.prototype.hasOwnProperty.call(draft.roads, name)) return; // Beta 1.150: own-property at this door too - a prototype member must not read as a held run and carry the call into the parts work below
  if (!crStreetParts(name)) return;
  if (crSectorSession.street !== name) crSectorSession.snapshot = (draft.sectors && draft.sectors[name]) ? draft.sectors[name].slice() : null; // a fresh entry only - re-entering the same street's open session must not move Cancel's restore point
  crSectorSession.street = name;
  renderSectorBar();
  const sheet = $('createSheet');
  if (sheet && sheet.classList.contains('on')) crMorphTo('bar');
  else syncCrPanel();
  renderDraft(); crRenderHint();
}
function crCloseSectors() { if (!crSectorSession.street) return; crSectorReset(); const sheet = $('createSheet'); if (sheet && sheet.classList.contains('on')) crMorphTo(crWantedFace()); else syncCrPanel(); crRenderHint(); }
function crCancelSectors() { // Beta 1.129 (Andrew: "I still need a way to cancel selections while I'm selecting something"): the deliberate back-out of a sector session - the street's pick returns EXACTLY as it was when sector mode was entered (the whole road, or the trim then in force), every face repaints from the restored state, and sector mode closes back to the panel. Distinct from un-picking every sector by toggles, which still removes the street - that is a selection, this is an abandonment of the session's edits
  const s = crSectorSession.street; if (!s || !draft) return;
  if (crSectorSession.snapshot) { draft.sectors = draft.sectors || {}; draft.sectors[s] = crSectorSession.snapshot.slice(); }
  else if (draft.sectors) delete draft.sectors[s];
  crCloseSectors();
  renderDraft(); renderCrLists();
}
function renderSectorBar() {
  const s = crSectorSession.street; if (!s || !draft || !draft.roads[s]) return;
  const rec = crStreetParts(s); if (!rec) return;
  const chosen = crChosenSet(s, rec);
  $('crSbName').textContent = shortStreetName(s); // Beta 1.144 (DA-04): the bar's title is a display surface - the short name, while the draft keys on the full one
  if (rec.parts.length === 1) { $('crSbSub').textContent = 'One piece · ' + fmtLenM(rec.total) + ' — no cross-streets to split it at, so it goes into your route whole'; return; } // Beta 1.128: honest about the streets the cut rules cannot split (measured on the shipped Vaughan pack: 221 of 1,299 streets ≥ 500 m compute to exactly one part) - 1.127's "tap sectors to trim it" promised a trim whose only outcome was deleting the road
  $('crSbSub').textContent = chosen.size >= rec.parts.length
    ? 'Entire road picked · ' + fmtLenM(rec.total) + ' — tap sectors to trim it'
    : chosen.size + ' of ' + rec.parts.length + ' sectors picked · ' + fmtLenM(crChosenLenM(s, rec)) + ' — the grey ends stay out of your route';
}
// ---- the pick sheet's ONE surface (Beta 1.129): the panel, the
// tucked-away strip and the sector bar are three CONTENTS of a single
// card - #createSheet itself, which carries the card's background,
// radius and shadow in every state (the .crG-* classes in head.html
// hold the three resting geometries; the contents carry none). A face
// change morphs the surface's OWN geometry - height, side insets,
// bottom inset and all four corner radii travel together on the
// sheets' closed-form spring, so the box contracts toward the bar's
// footprint on ALL sides at once (Andrew: "retracts into the pill
// form like it's being absorbed from all angles") while the two
// contents cross-fade INSIDE it. 1.127 hard-swapped three elements
// mid-spring; 1.128 sprang the sheet's height and slid the faces but
// the faces were still three separate boxes with their own margins
// and radii, landing in a rest state the eye had not been watching -
// on device it still read as: slides down, disappears, a pill
// appears. Now the thing on screen at the start of the motion IS the
// thing on screen at the end of it, at every frame between: one box,
// never display:none, never teleported.
let crMorph = null; // { from, to } while the surface morphs between faces, else null
const CR_FACES = { panel: { el: 'crPanel', cls: null }, strip: { el: 'crStrip', cls: 'crG-strip' }, bar: { el: 'crSectorBar', cls: 'crG-bar' } }; // Beta 1.136 (programme F): the sheet's faces in ONE table - element id + geometry class per face. Through 1.135 the face list was written out at five sites (the element lookup, the rest-state toggles + display lines, the morph cleanup loop, the morph's two class flips); every one reads this table now, so a fourth face joins in exactly one place
function crFaceEl(face) { return $(CR_FACES[face].el); }
function crFaceClasses(sheet, face) { for (const f of Object.keys(CR_FACES)) { const cls = CR_FACES[f].cls; if (cls) sheet.classList.toggle(cls, f === face); } } // the sheet wears the named face's geometry: its class on, every other face's class off (the panel's geometry is the absence of both classes)
function crWantedFace() { // the face the current state asks for: the sector bar while trimming; the strip whenever the panel is tucked away (Beta 1.128: at ANY pick count, zero included - an empty draft retracts too, where 1.127's strip demanded a non-empty draft and collapse at zero sprang down and bounced back); else the panel
  if (crSectorSession.street && draft && draft.roads[crSectorSession.street]) return 'bar';
  if (crSectorSession.collapsed) return 'strip';
  return 'panel';
}
function syncCrPanel() { // the REST state: the surface wears the wanted face's geometry class and exactly that face's content shows. Animated switches run through crMorphTo and land here; renders and stage changes call this directly. While a morph is in flight this no-ops - the morph's finish lands the rest state, so a mid-flight re-render can never tear the surface
  const sheet = $('createSheet'); if (!sheet) return;
  const els = {}; for (const f of Object.keys(CR_FACES)) { els[f] = crFaceEl(f); if (!els[f]) return; }
  if (crMorph) return;
  const want = crWantedFace();
  crSectorSession.face = want;
  crFaceClasses(sheet, want);
  for (const f of Object.keys(CR_FACES)) els[f].style.display = f === want ? '' : 'none';
  if (want === 'bar') renderSectorBar();
}
function crGeoOf(sheet) { // the surface's border-box geometry as plain numbers - content height, the three insets, the four corner radii - read from computed style, so calc()/env() are already resolved to px by the engine
  const cs = getComputedStyle(sheet);
  const rad = (cs.borderRadius || '0px').trim().split(/\s+/).map(v => parseFloat(v) || 0);
  const R = rad.length === 1 ? [rad[0], rad[0], rad[0], rad[0]] : rad.length === 2 ? [rad[0], rad[1], rad[0], rad[1]] : rad.length === 3 ? [rad[0], rad[1], rad[2], rad[1]] : rad.slice(0, 4);
  return { h: sheet.offsetHeight, ml: parseFloat(cs.marginLeft) || 0, mr: parseFloat(cs.marginRight) || 0, mb: parseFloat(cs.marginBottom) || 0, r: R };
}
function crMorphCleanup() { // the surface returns to class-driven rest: every inline geometry/position the morph set is cleared, so the rest state the eye lands on is exactly the CSS geometry of the destination face
  const sheet = $('createSheet'); if (sheet) { sheet.style.height = ''; sheet.style.overflow = ''; sheet.style.marginLeft = ''; sheet.style.marginRight = ''; sheet.style.marginBottom = ''; sheet.style.borderRadius = ''; sheet.style.transform = ''; }
  for (const f of Object.keys(CR_FACES)) { const el = crFaceEl(f); if (!el) continue; el.style.position = ''; el.style.top = ''; el.style.left = ''; el.style.right = ''; el.style.bottom = ''; el.style.opacity = ''; }
  crMorph = null;
}
function crSettleMorph() { if (!crMorph) return; cancelSheetSpring($('createSheet')); crMorphCleanup(); syncCrPanel(); } // land an in-flight morph NOW (a grab on the panel head, or a new face decision superseding it)
function crMorphTo(to, opts) { // THE face change: one surface, its geometry springing between the two faces' resting shapes while the contents cross-fade inside. opts: { dy, v0 } from the head-drag release - the surface is already displaced dy px by the finger's transform, so the morph starts from that displaced bottom edge at the finger's own speed
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
  const mb0 = opts.dy ? -opts.dy : G0.mb; // the finger left the surface dy px below its rest - the morph's bottom edge starts there, not at the rest position
  if (!G0.h || !G1.h || (Math.abs(G1.h - G0.h) < 2 && Math.abs(G1.ml - G0.ml) < 1 && Math.abs(G1.mb - mb0) < 1)) { syncCrPanel(); return; } // nothing to travel (or nothing measurable): land the rest state directly
  for (const el of [fromEl, toEl]) { el.style.display = ''; el.style.position = 'absolute'; el.style.top = '0px'; el.style.left = '0px'; el.style.right = '0px'; el.style.bottom = '0px'; } // both contents live inside the one surface for the motion
  fromEl.style.opacity = '1'; toEl.style.opacity = '0';
  sheet.style.transform = '';
  sheet.style.overflow = 'hidden'; sheet.style.height = G0.h + 'px';
  sheet.style.marginLeft = G0.ml + 'px'; sheet.style.marginRight = G0.mr + 'px'; sheet.style.marginBottom = mb0 + 'px';
  sheet.style.borderRadius = G0.r[0] + 'px ' + G0.r[1] + 'px ' + G0.r[2] + 'px ' + G0.r[3] + 'px';
  crMorph = { from, to };
  const L = (a, b, p) => a + (b - a) * p;
  springSheet(sheet, G0.h, G1.h, opts.v0 || 0, h => { // the closed-form spring drives the HEIGHT (px, the quantity its settle thresholds are calibrated for); every other property follows the same progress
    const p = Math.min(1, Math.max(0, (h - G0.h) / (G1.h - G0.h)));
    sheet.style.height = h + 'px';
    sheet.style.marginLeft = L(G0.ml, G1.ml, p) + 'px'; sheet.style.marginRight = L(G0.mr, G1.mr, p) + 'px';
    sheet.style.marginBottom = L(mb0, G1.mb, p) + 'px';
    sheet.style.borderRadius = L(G0.r[0], G1.r[0], p) + 'px ' + L(G0.r[1], G1.r[1], p) + 'px ' + L(G0.r[2], G1.r[2], p) + 'px ' + L(G0.r[3], G1.r[3], p) + 'px';
    fromEl.style.opacity = String(1 - Math.min(1, p / 0.45));
    toEl.style.opacity = String(Math.min(1, Math.max(0, (p - 0.3) / 0.7)));
  }, () => { crMorphCleanup(); syncCrPanel(); });
}
function crCollapsePanel(fromY, v0) { // tuck the surface away to the bottom bar: the one box contracts (Beta 1.129) - at any pick count, zero included
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
function crPendStreet(name, lngLat, run, boundary) { // fail-closed (Codex (c)): the shape reaches past verified coverage even after its one top-up - listed as PENDING, never added half-known; a wider preparation can still complete it (crSweepPending). Beta 1.144 (DA-04): keyed by the full map name, like every other draft structure
  let openEnd = null;
  if (run && run.line) { for (const end of [run.line[0], run.line[run.line.length - 1]]) { const inside = crCov && crInAnyBox(crCov.boxes, end[0], end[1]); if (!inside) { openEnd = { lat: end[0], lng: end[1] }; break; } } } // an end is OPEN only when no COMMITTED coverage holds it (the sweep's union rule): the top-up's box (the boundary argument) was fetched for this name only and never becomes coverage, so an end inside it but outside every committed box is still open; an end inside a loaded city cell needs no preparation - anchoring the wider preparation on either wrong end could never complete the street
  crPending[name] = { osmName: name, lngLat, openEnd };
  if (openEnd) crWanted = { anchor: openEnd, label: 'Prepare wider area' }; // verify round (CG-PF-09): the promised wider preparation is a REAL button - it prepares around the street's own open end, the point coverage must grow from
  renderCrLists(); crRenderHint();
  toast(shortStreetName(name) + ' runs past the prepared area — it is pending, not added. Prepare a wider area to complete it', 4200);
}
// ---- the city step (Andrew's amendment): Door 2 STARTS here ----
function crCityNameOf(it) { const a = (it && it.address) || {}; return a.city || a.town || a.village || a.municipality || a.county || String((it && it.display_name) || '').split(',')[0].trim(); }
function crIsPlace(it) { // populated places only: a city/town/village place, or an administrative boundary (a city's own boundary relation) - never a street, a POI or a postcode area
  if (!it) return false;
  const cls = it.category || it.class; // the app requests format=jsonv2, and jsonv2 names this field `category` - `class` was the older format's name and does not exist in a jsonv2 payload. 1.121 read only `class`, so EVERY real result was rejected here and the suggestion list silently emptied on Andrew's phone (the typed city search dead end, 2026-11-06). The battery's fixture cities carried the old field name, which is why the rig never saw it; drive153 stubs the real jsonv2 shape.
  if (cls === 'place') return ['city', 'town', 'village', 'hamlet', 'suburb'].includes(it.type);
  if (cls === 'boundary') return it.type === 'administrative';
  return false;
}
function crPickCity(it) {
  crCityLookupSeq++; if (crCityLastCtl) { try { crCityLastCtl.abort(); } catch (e) {} crCityLastCtl = null; } // a real pick supersedes any held last-city lookup (CG-PF-11)
  const lat = parseFloat(it.lat), lon = parseFloat(it.lon); if (!isFinite(lat) || !isFinite(lon)) return;
  const name = crCityNameOf(it); if (!name) return;
  let bbox = null;
  if (Array.isArray(it.boundingbox) && it.boundingbox.length === 4) { const bb = it.boundingbox.map(Number); if (bb.every(isFinite)) bbox = { s: bb[0], n: bb[1], w: bb[2], e: bb[3] }; }
  crCity = { name, lat, lon, bbox };
  crAreaGuess = name;
  if (draft && !draft.area) draft.area = name;
  try { lsSet(LS_GLOBAL.lastArea, name); } catch (e) {}
  crEnterPickFromCity();
}
function crEnterPickFromCity() { // the city is chosen: land in the pick stage, the map flown to the city, and its whole-city preparation started (from the on-device cache when saved - crCityPrepare)
  if (!creating) enterCreate('pick'); else { if (!routeLoaded) parkBootChrome(); else closeRouteMenu(); setCreateStage('pick'); }
  if (map && crCity && crCity.lat != null) { try { map.flyTo({ center: [crCity.lon, crCity.lat], zoom: 12, duration: 900 }); } catch (e) {} }
  crCityPrepare();
  crRenderHint();
}
// ---- the create gate: TWO DOORS, then the list (Beta 1.124, Andrew's
// redesign, approved from the rendered mockup 2026-11-06) ----
// The first screen of Create is "Create new route" with two primary
// doors: Select from list and Search manually (the photo door sits
// quieter below a divider). Select from list opens its own pane listing
// the library's cities as clean rows - no typing required to proceed.
// The list IS packs/index.json (the same catalogue the seam reads): a
// city appears the day its pack is published, and the app carries no
// hardcoded city names. Both entries into Create - the cold-start
// picker and the Routes menu - show the SAME routeMenu and the SAME
// panes, so this one surface is the gate for both.
function crRenderCityChoices() {
  const boxEl = $('crCityList'); if (!boxEl) return;
  boxEl.innerHTML = '';
  boxEl.appendChild(routeRowShell('div', 'Loading cities…', 'Getting the city library', { cls: 'crLoadingRow' })); // Beta 1.130: while the catalogue is genuinely in flight, the pane shows a ROW in the city rows' own styling (the shape the list itself takes) - the wait reads as the list arriving, not a bare note floating on an empty pane (the second, cosmetic half of Andrew's "loading screen" stutter; the wait itself is attacked by crWarmCityLibrary)
  crPackIndexLoad().then(entries => {
    if (!boxEl.isConnected) return;
    boxEl.innerHTML = '';
    if (!entries || !entries.length) { const d = document.createElement('div'); d.className = 'rmNote'; d.textContent = 'The city library isn’t available right now — go back and use Search manually.'; boxEl.appendChild(d); return; } // honest unavailability, and the manual door behind Back still works - the gate never dead-ends
    const last = (lsGet(LS_GLOBAL.lastArea) || '').toLowerCase();
    const sorted = entries.slice().sort((a, b) => (((b.name || '').toLowerCase() === last) ? 1 : 0) - (((a.name || '').toLowerCase() === last) ? 1 : 0)); // the last-used city rides first when the library holds it (a convenience, never a requirement - the full list is always there)
    for (const e of sorted) {
      if (!e || !e.name || !e.slug || !Array.isArray(e.bbox) || e.bbox.length !== 4) continue;
      const b = routeRowShell('button', e.name, (typeof e.streets === 'number' && isFinite(e.streets) ? e.streets.toLocaleString('en-US') + ' streets · ' : '') + 'ready to load', { chevron: true });
      if (String(e.name).toLowerCase() === last) { const lu = document.createElement('span'); lu.className = 'crLastUsed'; lu.textContent = ' · last used'; const area = b.querySelector('.routeArea'); if (area) area.appendChild(lu); } // Beta 1.139 (Andrew): the last-used tag is its own gold span so it stands out - it was plain text trailing the sub-line
      b.addEventListener('click', () => crPackPickCity(e));
      boxEl.appendChild(b);
    }
  });
}
function crPackPickCity(e) { // a chooser tap IS a city pick: it lands in the same crPickCity the typed search uses, with the catalogue's own bounds - so preparation, caching and the pick stage behave identically whichever door named the city. Beta 1.147 (hypothesis H2 hardening): the reset + pick run through askDiscard, so the discard guard is local to this handler and not just a property of the pane graph - askDiscard no-ops on an empty draft, so first entry is unchanged
  const s = +e.bbox[0], w = +e.bbox[1], n = +e.bbox[2], ee = +e.bbox[3];
  askDiscard(() => { draft = newDraft();
  crPickCity({ lat: String((s + n) / 2), lon: String((w + ee) / 2), boundingbox: [String(s), String(n), String(w), String(ee)], display_name: e.name + ', Ontario, Canada', address: { city: e.name, state: 'Ontario', country: 'Canada', country_code: 'ca' } }); });
}
function crOpenCityPane(ret) {
  crCityLookupSeq++; if (crCityLastCtl) { try { crCityLastCtl.abort(); } catch (e) {} crCityLastCtl = null; } // reopening the pane supersedes any held lookup (CG-PF-11)
  crCitySeq++; if (crCityCtl) { try { crCityCtl.abort(); } catch (e) {} crCityCtl = null; } if (crCityTimer) { clearTimeout(crCityTimer); crCityTimer = null; } // Beta 1.143 (DA-12): reopening the pane supersedes a held city SEARCH too - its late answer must not repopulate the pane it was asked from
  crCityReturn = ret;
  const last = lsGet(LS_GLOBAL.lastArea), lb = $('crCityLast');
  if (last) { lb.textContent = 'Use ' + last; lb.style.display = ''; } else lb.style.display = 'none';
  $('crCityInput').value = ''; $('crCityResults').innerHTML = '';
  if (creating) { if (!routeLoaded) restoreBootChrome(); else openRouteMenu(); }
  showRmPane('rmCityPane');
}
let crCityTimer = null, crCitySeq = 0, crCityCtl = null;
let crCityLookupSeq = 0, crCityLastCtl = null; // the one-tap last-city lookup's generation + abort handle (CG-PF-11: it is an async completion like any other - it binds to its generation, and any competing pick, Back, pane reopen or exit kills it)
function crCitySearchCurrent(seq, session) { return seq === crCitySeq && session === crSession; } // Beta 1.154 (B3 build, G3 option (i)): the city-search LANDING's current-check - sequence AND session (the convention is stated at crSearchCurrent above)
function crCitySearchSeqCurrent(seq) { return seq === crCitySeq; } // Beta 1.154: the city-search CATCH's current-check - sequence ONLY, deliberately weaker than the landing's: exitCreate does not bump crCitySeq (lifecycle trace T7: +0 across four exits), so a late failure from a closed session whose sequence still matches stays silent here exactly as it did inline through 1.153; the name carries the asymmetry so it is never "fixed" by accident
function crCityLookupCurrent(seq, session) { return seq === crCityLookupSeq && session === crSession && $('rmCityPane').classList.contains('on'); } // Beta 1.154: the last-city lookup's current-check (CG-PF-11) - sequence + session + its pane still open; the handler's stillMine closure delegates here
async function crRunCitySearch() {
  const q = $('crCityInput').value.trim(), box = $('crCityResults');
  if (q.length < 3) { crCitySeq++; if (crCityCtl) { try { crCityCtl.abort(); } catch (e) {} crCityCtl = null; } box.innerHTML = ''; return; } // Beta 1.143 (DA-12): a short/cleared query invalidates like every other input change - through 1.142 this branch returned before the sequence bump + abort below, so the in-flight answer still held the current sequence when it landed and repopulated the cleared field
  const seq = ++crCitySeq, session = crSession;
  if (crCityCtl) { try { crCityCtl.abort(); } catch (e) {} }
  const ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null; crCityCtl = ctl;
  try {
    const r = await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&featuretype=city&limit=6&q=' + encodeURIComponent(q), { headers: { 'Accept': 'application/json' }, signal: ctl ? ctl.signal : undefined });
    if (!r.ok) throw new Error('city search HTTP ' + r.status);
    const list = await r.json();
    if (!crCitySearchCurrent(seq, session)) return; // superseded, or the creation it belonged to has closed (CG-PF-05)
    box.innerHTML = '';
    const places = (Array.isArray(list) ? list : []).filter(crIsPlace);
    for (const it of places) {
      const dn = it.display_name || '', cut = dn.indexOf(',');
      const b = routeRowShell('button', cut > 0 ? dn.slice(0, cut).trim() : dn, (cut > 0 && dn.slice(cut + 1).trim()) ? dn.slice(cut + 1).trim() : null); // Beta 1.125 (Andrew): manual-search results wear the SAME neat row as the city list - name on its own line, the rest of the address small and dim under it; full .rmBtn boxes stacked with no gap read as one bunched wall
      b.addEventListener('click', () => crPickCity(it));
      box.appendChild(b);
    }
    if (!places.length) { const d = document.createElement('div'); d.className = 'rmNote'; d.textContent = 'No city matched that search — check the spelling, or go Back and pick from the list.'; box.appendChild(d); } // Beta 1.123: an empty answer SAYS so in the pane - 1.121 rendered nothing at all, which reads as a dead app (the same silence as the class/category defect, and just as unhelpful)
  } catch (e) { if (crCitySearchSeqCurrent(seq) && !(e && e.name === 'AbortError')) { box.innerHTML = ''; toast('City search needs an internet connection — try again', 3000); } }
}

// ---- draft geometry cache (Beta 1.135, maintainability programme N3): through 1.134 a
// single sector toggle recomputed computeStretches(draft.roads) TWICE - once in
// renderDraft, once in renderCrLists - ~87k segment tests per toggle on a six-street
// draft and ~1M on a full-size one, for geometry the toggle never touched. crDraftGeom
// computes it ONCE per draft-geometry change and every consumer shares the result.
// Invalidation is exact, keyed on identity + generation: the draft object and its roads
// object are replaced wholesale by every structural change except two (new draft,
// photo-door import, Clear all, exit), which the identity keys catch; the only in-place
// geometry mutations are crAddStreet joining a street and crRemoveStreet removing one,
// and both bump crGeomGen. Selection-only changes - sector picks, MAIN/2ND flips - touch
// neither key and never recompute. Identity-proven in the 1.135 fixture harness (the
// cached geometry deep-equals a fresh computeStretches at every step); drives 156-158
// judge the flows.
let crGeomCache = null, crGeomGen = 0; // Beta 1.154 (B3 build, G3): crGeomGen is a CACHE KEY, not a currency counter - it is part of this cache's identity, no async landing ever checks it, and the 2026-11-09 lifecycle trace observed it unmoved (+0) across every preparation transition; it deliberately stands outside the cr<Family>Current convention stated at crSearchCurrent
function crDraftGeom() {
  if (crGeomCache && crGeomCache.draft === draft && crGeomCache.roads === draft.roads && crGeomCache.gen === crGeomGen) return crGeomCache.g;
  const g = computeStretches(draft.roads);
  crGeomCache = { draft, roads: draft.roads, gen: crGeomGen, g };
  return g;
}
const DRAFT_SRC = 'crDraft';
function ensureDraftLayers() {
  if (!map || typeof map.addSource !== 'function') return;
  try {
    if (!map.getSource(DRAFT_SRC)) map.addSource(DRAFT_SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    if (!map.getLayer('crDraftCase')) map.addLayer({ id: 'crDraftCase', type: 'line', source: DRAFT_SRC, filter: ['==', ['get', 'chosen'], 1], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': 'rgba(10,14,34,.55)', 'line-width': 8.5 } }); // Beta 1.127: the casing underlines CHOSEN geometry only - an unchosen sector wears no casing, like the mockup's plain grey ends
    if (!map.getLayer('crDraftLine')) map.addLayer({ id: 'crDraftLine', type: 'line', source: DRAFT_SRC, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['case', ['==', ['get', 'chosen'], 1], ['case', ['==', ['get', 'main'], 1], '#ffc233', '#ef476f'], '#b9c1cb'], 'line-width': ['case', ['==', ['get', 'chosen'], 1], 4.5, 3] } }); // Beta 1.127: chosen = category colour at full width; unchosen = thin grey
    if (!map.getLayer('crDraftHit')) map.addLayer({ id: 'crDraftHit', type: 'line', source: DRAFT_SRC, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#000000', 'line-opacity': 0, 'line-width': 24 } }); // Beta 1.127: the sector pick's fat-finger target - invisible, queryable (crSectorTap)
  } catch (e) { /* the style may still be loading - renderDraft retries on every change */ }
}
function renderDraft() { // the DRAFT renders through its own GeoJSON source, computed from the draft's own roads - the active route's geometry, engine sources and storage are never touched by the create flow. Beta 1.127: a street carrying a sector pick (or open in sector mode) renders PER SECTOR - chosen sectors in its category colour, unchosen thin grey (the approved mockup's language); every other street renders as its whole line, exactly as before.
  ensureDraftLayers();
  if (!map || typeof map.getSource !== 'function') return;
  const src = map.getSource(DRAFT_SRC); if (!src) return;
  const feats = [];
  if (draft) {
    const g = crDraftGeom(); // Beta 1.135 (N3): the shared draft geometry - computed once per geometry change, not once per render
    for (const n of draftStreets()) {
      const main = draft.mains.has(n) ? 1 : 0;
      const sel = draft.sectors ? draft.sectors[n] : null;
      if (sel || crSectorSession.street === n) {
        const rec = crStreetParts(n); if (!rec) continue;
        const set = crChosenSet(n, rec);
        for (let i = 0; i < rec.parts.length; i++) { const L = rec.parts[i]; if (L && L.length > 1) feats.push({ type: 'Feature', properties: { name: n, main, chosen: set.has(i) ? 1 : 0, sector: i }, geometry: { type: 'LineString', coordinates: L.map(p => [p[1], p[0]]) } }); }
      } else {
        const st = g[n]; if (st) for (const run of st.runs) { const L = run.line; if (L && L.length > 1) feats.push({ type: 'Feature', properties: { name: n, main, chosen: 1, sector: -1 }, geometry: { type: 'LineString', coordinates: L.map(p => [p[1], p[0]]) } }); } // Beta 1.144 (C1): an untrimmed street draws all its runs - one feature per run, never a line bridging them
      }
    }
  }
  src.setData({ type: 'FeatureCollection', features: feats });
}
onMapReady(() => map.on('styledata', () => { if (creating) { renderDraft(); crSetBackdrop(true); } })); // a basemap swap mid-create wipes custom layers - redraw the draft and re-hide the backdrop
onMapReady(() => { if (creating) crSetBackdrop(true); }); // creation entered before the map existed (boot mode): the backdrop lands when the map does

// ---- creation backdrop (Beta 1.120, Andrew's design): while creating, the
// loaded route's painted streets and selection would cover the very map he
// is picking from. They hide entirely, and in their place the map shows a
// POINT OF INTEREST for every route in the database - the same marker the
// map itself shows when zoomed out (white ring, raspberry dot, the route's
// name) at each pack's centre (the engine's ROUTEPOI is exactly that
// centre for the active pack; a pack's `spot` is its per-STREET label
// anchors, not the route POI). Orientation with zero clutter. The draft's
// own overlay (crDraft) is untouched, and exitCreate restores the exact
// visibility every hidden layer had before. ----
const CR_ROUTE_LAYERS = ['t1-casing', 't1-casingb', 't1-surface', 't1-band', 't1-edge', 't1-sel', 't1-selband', 't1-sele', 'sel-core-s', 'sel-core-b', 'hit', 'routepoi-ring', 'routepoi-dot', 'routepoi-txt']
  .concat([1, 2, 3, 4].map(t => 'streetnamespt' + t), [1, 2, 3, 4, 5].flatMap(i => ['sel-glow' + i + '-s', 'sel-glow' + i + '-b']));
let crHiddenLayers = null; // [[id, visibilityBefore], ...] recorded on the first hide; null = backdrop off
const CR_POI_SRC = 'crPoi';
function crPoiFeatures() {
  return ROUTE_PACKS.map(p => { const bb = computeRouteBox(p.roads); if (!bb) return null; return { type: 'Feature', properties: { name: p.name || '' }, geometry: { type: 'Point', coordinates: [(bb.w + bb.e) / 2, (bb.s + bb.n) / 2] } }; }).filter(Boolean);
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
    if (!map.getLayer('crPoiTxt')) map.addLayer({ id: 'crPoiTxt', type: 'symbol', source: CR_POI_SRC, layout: { 'text-field': ['get', 'name'], 'text-font': crPoiFont(), 'text-size': 11, 'text-anchor': 'left', 'text-offset': [1.1, 0], 'text-allow-overlap': true }, paint: { 'text-color': night ? '#e8e8e8' : '#333333', 'text-halo-color': night ? 'rgba(0,0,0,.8)' : 'rgba(255,255,255,.9)', 'text-halo-width': 1.6 } });
  } catch (e) { /* the style may still be loading - the styledata hook re-runs this while creating */ }
}
function crSetBackdrop(on) {
  if (!map || typeof map.setLayoutProperty !== 'function') return;
  if (on) {
    if (!crHiddenLayers) {
      crHiddenLayers = [];
      for (const id of CR_ROUTE_LAYERS) { try { if (map.getLayer(id)) crHiddenLayers.push([id, map.getLayoutProperty(id, 'visibility') || 'visible']); } catch (e) {} }
    }
    for (const pair of crHiddenLayers) { try { map.setLayoutProperty(pair[0], 'visibility', 'none'); } catch (e) {} }
    ensureCrPoiLayers();
  } else {
    if (crHiddenLayers) { for (const pair of crHiddenLayers) { try { if (map.getLayer(pair[0])) map.setLayoutProperty(pair[0], 'visibility', pair[1]); } catch (e) {} } crHiddenLayers = null; }
    for (const id of ['crPoiRing', 'crPoiDot', 'crPoiTxt']) { try { if (map.getLayer(id)) map.removeLayer(id); } catch (e) {} }
    try { if (map.getSource(CR_POI_SRC)) map.removeSource(CR_POI_SRC); } catch (e) {}
  }
}
function crRowEl(n, g) {
  const row = document.createElement('div'); row.className = 'crRow';
  const main = draft.mains.has(n);
  const dot = document.createElement('span'); dot.className = 'crDot ' + (main ? 'main' : 'sec'); row.appendChild(dot);
  const nm = document.createElement('span'); nm.className = 'crName'; nm.textContent = shortStreetName(n); row.appendChild(nm); // Beta 1.144 (DA-04): rows display the short name; the draft key behind them is the full map name
  const ln = document.createElement('span'); ln.className = 'crLen'; ln.textContent = fmtLenM(crStreetChosenM(n, g)); row.appendChild(ln); // Beta 1.130 (maintainability re-scan N1): the preview's rows bill the CHOSEN length through the same helper as the panel's rows and every total - through 1.129 this read g[n].total, so a sector-trimmed street showed its WHOLE length on the check screen while the panel billed the trim and the preview's own total (renderCrLists sums crStreetChosenM) disagreed with its rows
  const chip = document.createElement('button'); chip.className = 'crChip ' + (main ? 'main' : 'sec'); chip.textContent = main ? 'MAIN' : '2ND';
  chip.addEventListener('click', () => { if (draft.mains.has(n)) draft.mains.delete(n); else draft.mains.add(n); renderDraft(); renderCrLists(); });
  row.appendChild(chip);
  const del = document.createElement('button'); del.className = 'crDel'; del.textContent = '✕'; del.title = 'Remove ' + shortStreetName(n);
  del.addEventListener('click', () => crRemoveStreet(n)); // Beta 1.127: the shared removal path (sector state leaves with the street)
  row.appendChild(del);
  return row;
}
function crPanelRowEl(n, g) { // Beta 1.127 (Andrew's approved mockup, screen 2): one short row per picked road - category dot, name, "Entire road · X m" or "N of M sectors · X m", the MAIN/2ND chip IN the row (one tap flips the road's type), x to remove; tapping the row itself opens the street's sector trimming
  const main = draft.mains.has(n);
  const row = document.createElement('div'); row.className = 'crPRow';
  const dot = document.createElement('span'); dot.className = 'crDot ' + (main ? 'main' : 'sec'); row.appendChild(dot);
  const meta = document.createElement('span'); meta.className = 'crPMeta';
  const nm = document.createElement('span'); nm.className = 'crPName'; nm.textContent = shortStreetName(n); meta.appendChild(nm); // Beta 1.144 (DA-04): display form, as in the preview rows
  const sub = document.createElement('span'); sub.className = 'crPSub';
  const sel = draft.sectors ? draft.sectors[n] : null;
  if (sel) { const rec = crStreetParts(n); sub.textContent = sel.length + ' of ' + (rec ? rec.parts.length : sel.length) + ' sectors · ' + fmtLenM(crStreetChosenM(n, g)) + ' — tap row to adjust'; }
  else sub.textContent = 'Entire road · ' + fmtLenM(g[n] ? g[n].total : 0) + ' — tap row to adjust'; // Beta 1.128: the adjust affordance is stated BEFORE any trim exists - in 1.127 it appeared only after one, so an untrimmed row gave no hint it could be tapped at all
  meta.appendChild(sub); row.appendChild(meta);
  const chip = document.createElement('button'); chip.className = 'crPChip ' + (main ? 'main' : 'sec'); chip.textContent = main ? 'MAIN' : '2ND';
  chip.addEventListener('click', e => { e.stopPropagation(); if (draft.mains.has(n)) draft.mains.delete(n); else draft.mains.add(n); renderDraft(); renderCrLists(); });
  row.appendChild(chip);
  const del = document.createElement('button'); del.className = 'crPDel'; del.textContent = '✕'; del.title = 'Remove ' + shortStreetName(n);
  del.addEventListener('click', e => { e.stopPropagation(); crRemoveStreet(n); });
  row.appendChild(del);
  row.addEventListener('click', () => crOpenSectors(n));
  return row;
}
function renderCrLists() {
  if (!draft) return;
  const g = crDraftGeom(); // Beta 1.135 (N3): shares renderDraft's computation through the draft geometry cache
  const names = draftStreets().sort((a, b) => a.localeCompare(b));
  let tot = 0; for (const n of names) tot += crStreetChosenM(n, g); // Beta 1.127: totals bill CHOSEN lengths - a trimmed street's unchosen ends never count
  $('crCount').textContent = names.length + ' roads · ' + fmtLenM(tot); // Beta 1.127: the panel header's count in the mockup's shape ("3 roads · 2,410 m")
  $('pvCount').textContent = names.length + ' streets · ' + draft.mains.size + ' mains · ' + fmtLenM(tot); // the preview keeps its fuller count line
  { const el = $('crPickList'); el.innerHTML = ''; for (const n of names) el.appendChild(crPanelRowEl(n, g)); }
  { const el = $('pvList'); el.innerHTML = ''; for (const n of names) el.appendChild(crRowEl(n, g)); }
  for (const pk of Object.keys(crPending).sort()) { // Beta 1.121: pending streets (shape reaches past verified coverage) list in the PICK sheet only - never in the preview, never in the count, never saved
    if (draft.roads[pk]) continue;
    const row = document.createElement('div'); row.className = 'crRow pending';
    const dot = document.createElement('span'); dot.className = 'crDot sec'; row.appendChild(dot);
    const nm = document.createElement('span'); nm.className = 'crName'; nm.textContent = shortStreetName(pk); row.appendChild(nm); // Beta 1.144 (DA-04): display form
    const chip = document.createElement('span'); chip.className = 'crChip pend'; chip.textContent = 'PENDING'; row.appendChild(chip);
    const del = document.createElement('button'); del.className = 'crDel'; del.textContent = '✕'; del.title = 'Drop ' + shortStreetName(pk);
    del.addEventListener('click', () => { delete crPending[pk]; renderCrLists(); });
    row.appendChild(del);
    $('crPickList').appendChild(row);
  }
  $('crStripTitle').textContent = names.length ? names.length + (names.length === 1 ? ' road' : ' roads') + ' picked' : 'No roads picked yet'; // the tucked-away bar always carries the state (mockup screen 4) - Beta 1.128: at zero picks it says so, because the bar now exists at zero too
  $('crStripSub').textContent = names.length ? fmtLenM(tot) + ' · tap Review to see them' : 'Tap roads on the map to add them';
  $('crDoneBtn').disabled = !names.length;
  $('crDoneBtn').textContent = 'Done'; // Beta 1.128 (Andrew): one word, ALWAYS - the 1.127 "Looks right" / "Done - back to check" rewrite is gone with the confusion it caused; Done goes to the check screen from the fresh state and the return-from-preview state alike
  $('pvSaveBtn').disabled = !names.length;
  syncCrPanel();
}
let crConfirmCb = null;
let crConfirmOneBtn = false; // Beta 1.132: true while the current confirm wears the one-button shape (the discard ask)
function crConfirm(title, msg, cb, labels) { $('crModalTitle').textContent = title; $('crModalMsg').textContent = msg; crConfirmCb = cb; crConfirmOneBtn = !!(labels && labels.oneBtn); $('crModalYes').textContent = (labels && labels.yes) || 'Discard'; $('crModalYes').classList.toggle('danger', !!(labels && labels.danger) || crConfirmOneBtn); $('crModalNo').textContent = (labels && labels.no) || '✕'; $('crModalNo').style.display = crConfirmOneBtn ? 'none' : ''; $('crModalX').style.display = crConfirmOneBtn ? '' : 'none'; $('crModal').classList.remove('hidden'); } // Beta 1.124: labels are optional; route deletion passes {yes:'Delete', no:'Cancel', danger:true}. Beta 1.132 (Andrew): the DISCARD ask (askDiscard) passes {oneBtn:true} and changes shape - ONE red Discard button, nothing else in the row; dismissal lives on the card's plain red corner X (crModalX, styled by the shared corner-X rule in head.html) and on a tap of the backdrop, and dismissing always means keep editing. Every other confirm keeps its two-button row exactly as before. The card itself is the --card token surface in BOTH themes - the confirm never hardcodes a light background.
function crConfirmDismiss() { $('crModal').classList.add('hidden'); crConfirmCb = null; }
$('crModalYes').addEventListener('click', () => { $('crModal').classList.add('hidden'); const cb = crConfirmCb; crConfirmCb = null; if (cb) cb(); });
$('crModalNo').addEventListener('click', crConfirmDismiss);
$('crModalX').addEventListener('click', crConfirmDismiss);
$('crModal').addEventListener('click', (e) => { if (crConfirmOneBtn && e.target === $('crModal')) crConfirmDismiss(); }); // Beta 1.132: a backdrop tap dismisses ONLY in the one-button shape
function parkBootChrome() { const sp = $('splash'); if (sp) sp.style.visibility = 'hidden'; $('routeMenu').classList.remove('show'); const bl = $('brandLayer'); if (bl) bl.classList.add('parked'); /* Beta 1.155: the title lives in its own layer now, not inside the menu - the park hides it explicitly (through 1.154 it hid as the menu's child) */ crBootParked = true; }
function restoreBootChrome() { if (!crBootParked) return; crBootParked = false; const sp = $('splash'); if (sp) sp.style.visibility = ''; $('routeMenu').classList.add('show'); const bl = $('brandLayer'); if (bl) bl.classList.remove('parked'); /* Beta 1.155: revive the title layer with the picker */ }
function setCreateStage(stage) {
  if (stage !== 'pick') crSectorReset(); // Beta 1.127: sector mode belongs to the pick stage - the preview never inherits a half-trimmed street's bar (Beta 1.129: its Cancel snapshot dies with it)
  crStage = stage;
  $('createBar').classList.toggle('on', stage === 'pick');
  $('createSheet').classList.toggle('on', stage === 'pick');
  $('previewSheet').classList.toggle('on', stage === 'preview');
  $('createResults').classList.remove('on');
  $('createHint').classList.toggle('on', stage === 'pick');
  if (stage === 'pick') crRenderHint(); else $('crHintBtn').style.display = 'none'; // Beta 1.121: the hint is state-driven now (crRenderHint owns it) - the preparation state must survive stage changes, not be overwritten by a static line
  renderCrLists(); renderDraft();
  if (stage === 'preview') fitDraft();
}
function enterCreate(stage) {
  if (!draft) draft = newDraft();
  creating = true;
  if (crPillT) clearTimeout(crPillT); crPillT = 0; crPillKey = ''; crPillGone = ''; // Beta 1.153: a new create session re-arms the confirmation pill (a cached city confirms again on entry)
  crSectorReset(); crSectorSession.collapsed = false; crSettleMorph(); // Beta 1.127: every creation starts un-trimmed with the panel up (Beta 1.129: any surface morph a previous creation left in flight lands first)
  crSession++; // a fresh creation session: async completions born in any earlier session are obsolete from here (CG-PF-05)
  document.body.classList.add('creating');
  followPaused = true; // the camera belongs to the picking now; GPS is device state and is not stopped - follow resumes from the Locate tab afterwards
  try { deselect(); } catch (e) {} closeSheets();
  if (routeLoaded) closeRouteMenu(); else parkBootChrome();
  crSetBackdrop(true); // Beta 1.120: the loaded route's paint steps aside for the picking (POIs only) - see crSetBackdrop
  setCreateStage(stage);
}
function exitCreate() {
  creating = false; draft = null; crStage = 'pick'; crAreaGuess = '';
  if (crPillT) clearTimeout(crPillT); crPillT = 0; crPillKey = ''; crPillGone = ''; // Beta 1.153: the pill's clock dies with the session, like every other create timer here crSectorReset(); crSectorSession.collapsed = false; // Beta 1.127: the panel + sector session state dies with the creation
  crSession++; crCovGen++; // every async completion born in this session is obsolete the moment the flow closes - it must not land in a later draft, hint or busy state (CG-PF-05)
  if (crPrep) { clearInterval(crPrep.ticker); crAbortOp(crPrep.op); crPrep = null; } // and the downloads themselves stop (CG-PF-10)
  if (crGrid) { crGridStop('exit'); crGrid = null; } // the grid's downloads stop too; its committed cells live on in the on-device city cache, by design
  crCacheNote = ''; crCacheNoteCity = ''; // Beta 1.143 (DA-06): the owner binding resets with the note - no failure state outlives the session
  crPackCtx = null; crPackNote = ''; // Beta 1.123: the pack context belongs to the closed session's city - the next creation re-decides its source
  crAbortOp(crTopOp); crTopOp = null;
  crCityLookupSeq++; if (crCityLastCtl) { try { crCityLastCtl.abort(); } catch (e) {} crCityLastCtl = null; } // a held last-city lookup dies with the session (CG-PF-11)
  crCov = null; crCity = null; crSetPrepState('none'); crPrepFail = null; crFailFromGrid = false; crPrepAnchor = null; crPending = {}; crToppedUp = {}; crWanted = null; // Beta 1.154 (B3 build): the state write routes through the prep record's setter, and crFailFromGrid clears with the session (the 2026-11-09 lifecycle trace's latch finding) - it must not survive into a new session
  $('crHintBtn').style.display = 'none';
  if (crSearchTimer) { clearTimeout(crSearchTimer); crSearchTimer = null; }
  crSearchSeq++; if (crSearchCtl) { try { crSearchCtl.abort(); } catch (e) {} crSearchCtl = null; } // no in-flight suggestion may land after the flow has closed
  document.body.classList.remove('creating');
  for (const id of ['createBar', 'createSheet', 'previewSheet', 'createResults', 'createHint']) $(id).classList.remove('on');
  crSetBackdrop(false); // Beta 1.120: the loaded route's paint returns exactly as it was
  renderDraft(); // draft is null: the overlay clears, the active route was never touched
}
function openDoors() { crWarmCityLibrary(); if (!routeLoaded) { restoreBootChrome(); } else openRouteMenu(); showRmPane('rmCreatePane'); } // Beta 1.124: the doors pane needs no render on entry - the city list renders when ITS door is tapped. Beta 1.130: the doors ARE the create gate - opening them starts the catalogue download (crWarmCityLibrary), so it is in hand by the list tap
function askDiscard(then) { if (draft && draftStreets().length) crConfirm('Throw away this draft?', 'The ' + draftStreets().length + ' streets you picked will be lost.', then, { oneBtn: true }); else then(); }
function fitDraft() {
  if (!draft || !map) return;
  const bb = computeRouteBox(crFilteredRoads()); if (!bb) return; // Beta 1.127: the preview frames what will save (chosen sectors), not the whole streets
  try { map.fitBounds([[bb.w, bb.s], [bb.e, bb.n]], { padding: 56, duration: 800 }); } catch (e) {}
}
$('crExit').addEventListener('click', () => { // Beta 1.120: the ✕ beside the search first CLEARS the search (text + open results) when there is anything to clear - that is what a ✕ beside a search bar means; pressed with an empty search it exits creating, as before
  const box = $('createResults');
  if (box.classList.contains('on') || $('crSearchInput').value) {
    box.classList.remove('on'); $('crSearchInput').value = '';
    if (crSearchTimer) { clearTimeout(crSearchTimer); crSearchTimer = null; }
    crSearchSeq++; if (crSearchCtl) { try { crSearchCtl.abort(); } catch (e) {} }
    return;
  }
  askDiscard(() => { const wasBoot = !routeLoaded; exitCreate(); if (wasBoot) openDoors(); });
});
$('pvStartOverBtn').addEventListener('click', () => askDiscard(() => { exitCreate(); openDoors(); }));

// ---- Door 1: photo -> waiting state -> draft import ----
$('crDoorPhoto').addEventListener('click', () => showRmPane('rmPhotoPane'));
$('crPhotoBack').addEventListener('click', () => showRmPane('rmCreatePane')); // Beta 1.124: the photo pane backs to the doors pane it came from (1.123's chooser pane was that pane's old shape)
$('crPhotoBtn').addEventListener('click', () => $('crPhotoFile').click());
$('crPhotoFile').addEventListener('change', () => {
  const f = $('crPhotoFile').files && $('crPhotoFile').files[0]; $('crPhotoFile').value = '';
  if (!f) return;
  crPhoto = f;
  $('crPhotoName').textContent = f.name || 'photo';
  $('crPhotoPick').style.display = 'none'; $('crPhotoWait').style.display = '';
  const sh = $('crShareBtn');
  let can = false; try { can = !!(navigator.canShare && navigator.canShare({ files: [f] })); } catch (e) {}
  sh.style.display = can ? '' : 'none'; // the share affordance exists only where the platform offers it - silent absence otherwise
});
$('crShareBtn').addEventListener('click', () => { if (crPhoto && navigator.share) navigator.share({ files: [crPhoto] }).catch(() => {}); });
$('crImportBtn').addEventListener('click', () => $('crDraftFile').click());
$('crDraftFile').addEventListener('change', async () => {
  const f = $('crDraftFile').files && $('crDraftFile').files[0]; $('crDraftFile').value = '';
  if (!f) return;
  let text = ''; try { text = await f.text(); } catch (e) { toast('That draft file could not be read', 3200); return; }
  importDraft(text);
});
function importDraft(text) { // fail closed, named errors, nothing half-applied - the same discipline as a backup restore
  let obj; try { obj = JSON.parse(text); } catch (e) { toast('That draft file could not be read — it is not valid JSON', 3600); return; }
  let raw = obj;
  if (obj && typeof obj === 'object' && !Array.isArray(obj) && obj.roads === undefined) { // the sandbox pipeline's candidate shape: a bare roads object
    const vals = Object.values(obj);
    if (vals.length && vals.every(v => Array.isArray(v))) raw = { roads: obj };
    else { toast('That draft file has no roads in it — nothing was imported', 3600); return; }
  }
  const v = normalizePack(raw, { draft: true });
  if (!v.ok) { toast('Draft not imported — ' + v.error, 4000); return; }
  draft = newDraft();
  draft.roads = v.pack.roads; draft.mains = new Set(v.pack.main); draft.name = v.pack.name || ''; draft.area = v.pack.area || ''; draft.tileNames = v.pack.tileNames.slice();
  enterCreate('preview');
  toast('Draft loaded — check it over', 2600);
}

// ---- Door 2: city first (Andrew's amendment) -> prepare the area's street shapes once -> tap roads, resolved locally ----
$('crDoorList').addEventListener('click', () => { showRmPane('rmCityListPane'); crRenderCityChoices(); }); // Beta 1.124: Select from list - the city rows render fresh on every entry to the list pane
$('rmCityListBack').addEventListener('click', () => showRmPane('rmCreatePane')); // the list pane backs to the doors pane (the mockup's pane-to-pane Back chain)
$('crDoorManual').addEventListener('click', () => { askDiscard(() => { draft = newDraft(); crOpenCityPane('doors'); }); }); // Beta 1.147 (hypothesis H2 hardening): the same local askDiscard wrap as crPackPickCity - no-op on an empty draft, so first entry is unchanged
$('crCityInput').addEventListener('input', () => { // Beta 1.143 (DA-12, verify cycle 1): EVERY input change invalidates the in-flight search AT THE EVENT - bump + abort here, not when the debounce next runs the search (a response landing inside the 500 ms window otherwise renders into a field the user has already moved past). The street search's handler below has always had this shape; crRunCitySearch's own bump remains the backstop for programmatic calls
  crCitySeq++; if (crCityCtl) { try { crCityCtl.abort(); } catch (e) {} crCityCtl = null; }
  if (crCityTimer) { clearTimeout(crCityTimer); crCityTimer = null; }
  if ($('crCityInput').value.trim().length < 3) { $('crCityResults').innerHTML = ''; return; }
  crCityTimer = setTimeout(() => { crCityTimer = null; crRunCitySearch(); }, 500);
});
$('crCityLast').addEventListener('click', async () => {
  const last = lsGet(LS_GLOBAL.lastArea); if (!last) return;
  // resolve the remembered NAME back to a place (centre + bounds) through the same city search; if the lookup fails, the name alone still scopes the creation - anchors then come from street-search picks and Prepare this area.
  // CG-PF-11 (verify round): this completion binds to (lookup generation, creation session, the pane still being open) - a slow lookup must never overwrite a city picked in the meantime, and Back / exit / a competing pick abort it outright.
  const seq = ++crCityLookupSeq, session = crSession;
  if (crCityLastCtl) { try { crCityLastCtl.abort(); } catch (e) {} }
  const ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null; crCityLastCtl = ctl;
  const stillMine = () => crCityLookupCurrent(seq, session);
  try {
    const r = await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&featuretype=city&limit=6&q=' + encodeURIComponent(last), { headers: { 'Accept': 'application/json' }, signal: ctl ? ctl.signal : undefined });
    if (r.ok) { const list = await r.json(); if (!stillMine()) return; const hit = (Array.isArray(list) ? list : []).find(crIsPlace); if (hit) { crPickCity(hit); return; } }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  if (!stillMine()) return;
  crCity = { name: last, lat: null, lon: null, bbox: null };
  crAreaGuess = last; if (draft && !draft.area) draft.area = last;
  crEnterPickFromCity();
});
$('crCityBack').addEventListener('click', () => {
  crCityLookupSeq++; if (crCityLastCtl) { try { crCityLastCtl.abort(); } catch (e) {} crCityLastCtl = null; } // leaving the pane kills a held lookup (CG-PF-11)
  crCitySeq++; if (crCityCtl) { try { crCityCtl.abort(); } catch (e) {} crCityCtl = null; } if (crCityTimer) { clearTimeout(crCityTimer); crCityTimer = null; } // Beta 1.143 (DA-12): leaving the pane kills a held city search too - request AND pending debounce, as reopening does
  if (crCityReturn === 'preview' || crCityReturn === 'pick') { if (!routeLoaded) parkBootChrome(); else closeRouteMenu(); setCreateStage(crCityReturn); }
  else { showRmPane('rmCreatePane'); }
});
$('crCityChange').addEventListener('click', () => crOpenCityPane('pick'));
$('crHintBtn').addEventListener('click', () => {
  if (crPrepState === 'preparing') { crCancelPrep(); return; }
  if (crWanted) { crStartPrep(crWanted.anchor); return; } // an outstanding offer (outside-coverage tap / pending street) prepares exactly where it points - it outranks the state remedies below
  if (crPrepState === 'degraded') { crGridResume(); return; } // Resume / Retry missing parts: only the missing cells fetch (amendments A+B)
  if (crPrepState === 'failed') {
    if (crFailFromGrid) { crGridResume(); return; } // a failed GRID retries its missing cells
    if (crPrepFail && crPrepFail.kind === 'dense') { if (map) { const c = map.getCenter(); crStartPrep({ lat: c.lat, lng: c.lng }); } } // the dense remedy: prepare wherever the map now sits (CG-PF-09)
    else if (crPrepAnchor) crStartPrep(crPrepAnchor); // Retry: the same anchor again
    return;
  }
  if (map) { const c = map.getCenter(); crStartPrep({ lat: c.lat, lng: c.lng }); } // Prepare this area: the anchor is the map centre he is looking at. (Beta 1.153: the ready state's Refresh dispatch is GONE with the button - a healthy cached city offers no reload, so no state routes here to crGridRefresh any more.)
});
onMapReady(() => map.on('moveend', () => { if (creating && crStage === 'pick' && crPrepState === 'none') crRenderHint(); })); // the Prepare-this-area offer follows the zoom (it appears only at picking zoom) - never a silent download while merely panning
$('crSearchBtn').addEventListener('click', crSearch);
$('crSearchInput').addEventListener('keydown', e => { if (e.key === 'Enter') crSearch(); });
// Beta 1.120 (Andrew): search AS YOU TYPE. 1.118/1.119 searched only on
// the Search button - his call then; on the phone he asked for
// suggestions while typing, and this supersedes it. The volume stays
// honest: a keystroke burst becomes ONE query (500 ms debounce, 3+
// characters), a newer query aborts and supersedes the one in flight
// (sequence token + AbortController, so a slow earlier answer can never
// overwrite newer results), and the Search button / Enter still run the
// typed query immediately. Results are biased toward the visible map
// (viewbox, bounded=0 - a bias, never a restriction).
let crSearchTimer = null, crSearchSeq = 0, crSearchCtl = null;
$('crSearchInput').addEventListener('input', () => {
  if (crSearchTimer) { clearTimeout(crSearchTimer); crSearchTimer = null; }
  $('crSearchBtn').disabled = false;
  const q = $('crSearchInput').value.trim();
  if (q.length < 3) { crSearchSeq++; if (crSearchCtl) { try { crSearchCtl.abort(); } catch (e) {} } $('createResults').classList.remove('on'); return; }
  crSearchTimer = setTimeout(() => { crSearchTimer = null; crRunSearch(true); }, 500);
});
function crSearch() { // the button / Enter: cancel any pending debounce and run the typed query NOW
  if (crSearchTimer) { clearTimeout(crSearchTimer); crSearchTimer = null; }
  crRunSearch(false);
}
// Beta 1.154 (B3 build, G3 option (i) - Andrew's decision): THE CURRENT-CHECK
// CONVENTION. Every counter family's landing guard is a predicate named
// cr<Family>Current(<that family's own invalidation inputs>), answering one
// question: "may this landing still write?" The families' shapes DELIBERATELY
// differ - the 2026-11-09 lifecycle trace proved no unified (gen, session)
// shape exists: the street-search family below is session-free (its
// invalidation rides on exitCreate's bump), the city-search family's catch
// is seq-only while its landing is seq+session (S10 does not bump crCitySeq,
// so the asymmetry is semantic), the last-city lookup adds a UI conjunct
// (its pane still open), and crGeomGen is not a currency counter at all (a
// cache key - see its declaration). The members: crPrepCurrent(gen,
// session) + crGridCurrent(g) (create-citydata.js / create-cache.js),
// crSearchCurrent(seq), crCitySearchCurrent(seq, session) +
// crCitySearchSeqCurrent(seq), crCityLookupCurrent(seq, session).
function crSearchCurrent(seq) { return seq === crSearchSeq; } // the street-search family's current-check: the sequence ALONE - no session, by design
async function crRunSearch(fromTyping) {
  const q = $('crSearchInput').value.trim(); if (!q) return;
  const seq = ++crSearchSeq;
  if (crSearchCtl) { try { crSearchCtl.abort(); } catch (e) {} }
  const ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null; crSearchCtl = ctl;
  if (!fromTyping) $('crSearchBtn').disabled = true;
  try {
    let url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&q=' + encodeURIComponent(q);
    const scoped = !!(crCity && crCity.bbox); // Beta 1.153 (Andrew): with a city loaded, suggestions come from THAT city only. The 1.121 bias (bounded=0: "a bias, never a restriction") becomes a bound (bounded=1) and the returned list is ALSO filtered to the box below, so a service that ignores the bound cannot leak an out-of-city suggestion. With NO city loaded, the visible-map bias is exactly the old behaviour.
    try { // Beta 1.121: with a city chosen, the street search centres on the CITY (its Nominatim bounding box) - preparation and search live inside the city he picked; without one, the visible map biases as before.
      if (scoped) url += '&viewbox=' + [crCity.bbox.w, crCity.bbox.n, crCity.bbox.e, crCity.bbox.s].map(v => +v.toFixed(5)).join(',') + '&bounded=1';
      else if (map) { const b = map.getBounds(); url += '&viewbox=' + [b.getWest(), b.getNorth(), b.getEast(), b.getSouth()].map(v => +v.toFixed(5)).join(',') + '&bounded=0'; }
    } catch (e) {}
    const r = await fetch(url, { headers: { 'Accept': 'application/json' }, signal: ctl ? ctl.signal : undefined });
    if (!r.ok) throw new Error('search HTTP ' + r.status);
    const list = await r.json();
    if (!crSearchCurrent(seq)) return; // superseded while in flight - a newer query owns the dropdown
    let results = Array.isArray(list) ? list : [];
    if (scoped) results = results.filter(it => { const la = parseFloat(it.lat), lo = parseFloat(it.lon); return isFinite(la) && isFinite(lo) && crInBox(crCity.bbox, la, lo); }); // Beta 1.153: the city bound, enforced on the results themselves
    renderCrResults(results);
    if (!fromTyping && !results.length) toast('No places matched that search', 3000);
  } catch (e) {
    if (crSearchCurrent(seq) && !(e && e.name === 'AbortError') && !fromTyping) toast('Search needs an internet connection — try again', 3200);
  }
  if (!fromTyping && crSearchCurrent(seq)) $('crSearchBtn').disabled = false;
}
document.addEventListener('pointerdown', (e) => { // Beta 1.120 (Andrew): tapping anywhere outside the results dropdown dismisses it - map taps included (the pick still runs: this only closes the list, in the capture phase, before the map's own click)
  if (!creating) return;
  const box = $('createResults');
  if (!box.classList.contains('on')) return;
  if (e.target && (box.contains(e.target) || $('createBar').contains(e.target))) return;
  box.classList.remove('on');
}, true);
function renderCrResults(list) {
  const box = $('createResults'); box.innerHTML = '';
  for (const it of list) {
    const b = document.createElement('button'); b.className = 'crResult'; b.textContent = it.display_name || '';
    b.addEventListener('click', () => {
      box.classList.remove('on');
      const lat = parseFloat(it.lat), lon = parseFloat(it.lon); if (!isFinite(lat) || !isFinite(lon)) return;
      const a = it.address || {}; crAreaGuess = a.city || a.town || a.village || a.municipality || a.county || '';
      if (map) map.flyTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), 15), duration: 900 });
      if (crGrid && crCity && crInBox(crGrid.bbox, lat, lon)) { /* inside the picked city: its grid is the preparation (already running or saved) - no second download for a search pick */ }
      else crStartPrep({ lat, lng: lon }); // Beta 1.121: outside any city coverage, the search pick ANCHORS the fallback box preparation (anchor rule (a)) - taps then resolve locally from the extract
    });
    box.appendChild(b);
  }
  box.classList.toggle('on', list.length > 0);
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
function chainWays(ways) { // the sandbox's stitch: greedy endpoint chaining at 1.5 m tolerance into runs. A run whose joins were all exact keeps its ways as segments (the app's own stitcher re-chains them identically); a run with a bridged join is stored as its single stitched line.
  const pool = ways.map(w => w.slice());
  const runs = [];
  while (pool.length) {
    let bi = 0; for (let i = 1; i < pool.length; i++) if (crLineLen(pool[i]) > crLineLen(pool[bi])) bi = i;
    const first = pool.splice(bi, 1)[0];
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
        segs.push(addSeg); pool.splice(i, 1); grew = true; break;
      }
    }
    runs.push({ segments: segs, line, exact });
  }
  return runs;
}
const OVERPASS_URLS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']; // primary + fallback (both named in the stamped CSP's connect-src)
// Beta 1.121: overpassQuery + fetchStreetGeometry are GONE - they were the
// per-tap fetch (and the malformed query's home). All Overpass traffic now
// goes through crOverpassFetch with queries built by crQL/crAreaQL/
// crNameQL (see the preparation block above); taps resolve locally.
async function pickStreet(osmName, lngLat) {
  if (!draft) return;
  const name = osmName; // Beta 1.144 (DA-04): the draft key IS the full map name; the short form appears only in display text (shortStreetName at the toast sites below)
  const exists = Object.prototype.hasOwnProperty.call(draft.roads, name); // Beta 1.150 (security-audit fix round, finding covfromways-prototype-name-throw): own-property, not a bare read - on a plain object a street named 'constructor' reads Object.prototype's member as if the street were already picked, and the tap was routed to the sectors door for a street that was never picked
  if (exists && (crPickBusy || !(crCov && crCov.boxes.length))) { crOpenSectors(name); return; } // already picked, and either no prepared extract to resolve the tap against or a pick is in flight: the 1.128 sectors door, exactly as before (the pre-1.144 order - the picked check always outranked the busy flag)
  if (Object.prototype.hasOwnProperty.call(crPending, name)) { toast(shortStreetName(name) + ' is pending — it runs past the prepared area and is not in your route yet', 3400); return; } // Beta 1.150: the same own-property rule for the pending read
  if (crPickBusy) return;
  // Beta 1.121: the tap resolves LOCALLY from the prepared extract - no
  // network on the ordinary path (CG-PF-04). Before the extract is ready
  // the tap still IDENTIFIES the street and says so honestly; it never
  // pretends to add it - nothing appears added until accurate geometry
  // is in hand and validated (the line the whole create flow holds).
  // A tap inside a part of the city that has ALREADY landed resolves
  // even while the rest still loads - progress is real (amendment B).
  if (crCov && crCov.boxes.length) {
    const res0 = crResolve(osmName, lngLat);
    if (res0.status === 'ok') {
      if (!exists) { crAddStreet(name, res0.segs); return; }
      if (crRunHeld(name, res0.segs)) { crOpenSectors(name); return; } // the tap landed on a run the draft already holds: the 1.128 sectors door
      crAddRun(name, res0.segs); return; // Beta 1.144 (OPT-L1): the tap landed on a DIFFERENT disconnected run of the picked street - it joins the same street entry (docs/ARCHITECTURE.md carries the rule)
    }
    if (exists) {
      if (res0.status === 'edge' && res0.run && !crRunHeld(name, res0.run.exact ? res0.run.segments : [res0.run.line])) { toast('The other part of ' + shortStreetName(name) + ' runs past the prepared area — it was not added. Prepare a wider area, then tap it again', 4200); return; } // an unheld run that reaches past verified coverage is never half-added over an existing pick; the wider preparation + a fresh tap is the honest path
      crOpenSectors(name); return; // absent/nocov against committed coverage, or an edge tap on the held run itself: the sectors door is the answer the 1.128 fork chose
    }
    if (res0.status === 'absent') {
      if (crInAnyBox(crCov.boxes, lngLat.lat, lngLat.lng)) { toast('No shape found for ' + shortStreetName(name) + ' here — the map data holds no line for it', 3600); return; }
      if (crGrid && crInBox(crGrid.bbox, lngLat.lat, lngLat.lng)) {
        const cell = crGrid.cells.find(c => crInBox(c.box, lngLat.lat, lngLat.lng));
        if (cell && cell.state === 'failed') toast('That part of ' + crGrid.name + ' didn’t load — ' + shortStreetName(name) + ' can be added after Retry missing parts', 3800);
        else toast('That part of ' + (crCity ? crCity.name : 'the city') + ' is still loading — ' + shortStreetName(name) + ' can be added as soon as it lands', 3400);
        return;
      }
      crPrepAnchor = { lat: lngLat.lat, lng: lngLat.lng }; crWanted = { anchor: { lat: lngLat.lat, lng: lngLat.lng }, label: 'Prepare this area' }; crRenderHint(); toast(shortStreetName(name) + ' is outside the prepared area — prepare this area, then tap it again', 3800);
      return;
    }
    // edge (Codex (c)): the run reaches beyond verified coverage - ONE
    // targeted fetch for this name over an expanded bounded area (centred
    // on the run's open end), merged by way id, then resolved again
    // against that wider boundary. Still beyond afterwards: PENDING.
    const session = crSession, gen = crCovGen, topKey = name + '@' + gen;
    if (crToppedUp[topKey]) { crPendStreet(name, lngLat, res0.run, null); return; }
    crToppedUp[topKey] = true;
    crPickBusy = true;
    const hint = $('createHint'); hint.textContent = 'Checking the whole of ' + shortStreetName(name) + '…'; hint.classList.add('on');
    const op = {}; crTopOp = op; // exitCreate can stop this download too (CG-PF-10)
    try {
      let openEnd = { lat: lngLat.lat, lng: lngLat.lng };
      if (res0.run && res0.run.line) { for (const end of [res0.run.line[0], res0.run.line[res0.run.line.length - 1]]) { if (!crInAnyBox(crCov.boxes, end[0], end[1])) { openEnd = { lat: end[0], lng: end[1] }; break; } } }
      const box = crBoxAround(openEnd.lat, openEnd.lng, CR_INNER_KM + CR_BUFFER_KM + CR_TOPUP_RING_KM);
      const got = await crSourceExtract(box, osmName, CR_TIMING.topupBudgetMs, CR_TIMING.topupAttempt1Ms, () => creating && crSession === session && crCovGen === gen, op);
      if (!creating || crSession !== session || crCovGen !== gen || !draft) return; // obsolete: land nowhere (CG-PF-05)
      if (!got.ok) {
        if (got.kind === 'dense') toast('That area is too dense to check ' + shortStreetName(name) + ' against — it stays out of your route for now', 4000);
        else if (got.kind === 'error' || got.kind === 'badjson') toast('The street-shape service answered with an error — ' + shortStreetName(name) + ' was not added', 3800);
        else if (got.kind !== 'stale') toast('The street-shape service didn’t answer — ' + shortStreetName(name) + ' was not added', 3800);
        crRenderHint();
        return;
      }
      crCovMerge(got.json.elements, null); // merged by way id; the top-up's box verifies THIS resolution (below) but does not join the coverage set - a later street must earn its own proof
      const res = crResolve(osmName, lngLat, box);
      if (res.status === 'ok') crAddStreet(name, res.segs); else crPendStreet(name, lngLat, res.run, box);
    } finally { if (crTopOp === op) crTopOp = null; crPickBusy = false; } // Beta 1.120: EVERY exit path releases the picker - 1.119's early return on a null shape skipped this line and one refused fetch wedged tapping for the whole session (Andrew, on device). The session/generation guards above are what bind the COMPLETION (CG-PF-05); the busy flag can only be held by the one pick in flight, so releasing it here can never clear a newer operation's state.
    return;
  }
  if (exists) { crOpenSectors(name); return; } // an extract exists but holds no verified box yet - the picked street's sectors are still the honest door
  if (crPrepState === 'preparing') { toast('Still preparing street shapes — ' + shortStreetName(name) + ' can be added as soon as they are ready', 3200); return; }
  crPrepAnchor = { lat: lngLat.lat, lng: lngLat.lng };
  crWanted = { anchor: { lat: lngLat.lat, lng: lngLat.lng }, label: 'Prepare this area' }; // the offer names THIS tap's area, and the hint button prepares exactly there (CG-PF-09)
  toast('Street shapes aren’t ready for this area yet — tap Prepare this area, then tap ' + shortStreetName(name) + ' again', 3800);
  crRenderHint();
}
function crFeatDistM(lngLat, geom) { // metres from the tap to the nearest point of a tile feature's line(s), in distM's flat-earth metres. CHOICE ONLY (see crMapTap): the number judges which named street a tap meant - it is never stored and never shapes the route
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
function crFeatDistPx(lngLat, part) { // pixels from the tap to the nearest point of a part line ([lat, lng] pairs), in the map's own projection - crSectorTap's geometry fallback is judged in the same pixels its query boxes are measured in (Beta 1.156). The caller guards map.project before calling
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
  if (crSectorSession.street) { crSectorTap(e.lngLat); return; } // Beta 1.127: while trimming, a map tap speaks only to the street being trimmed - it can neither add nor remove another street
  // Beta 1.119: query a small BOX around the tap, not the tap's single pixel.
  // Rendered road lines are a few px wide and a fingertip lands +/-10-20 px
  // off them, so the 1.118 point query almost never held a road and every
  // real tap toasted "No road there" (Andrew, on device). The tile
  // geometry's ONLY job here is to choose WHICH named street the tap meant
  // (the line passing closest to the tap wins); it is never stored - the
  // street's stored shape still comes from the accurate source - the
  // prepared Overpass extract (identity from the tile name, shape from
  // the extract - the approved reconciliation; display tiles re-segment
  // streets and misplace joins).
  const roadFeats = (half) => {
    let feats = [];
    try { feats = map.queryRenderedFeatures([[e.point.x - half, e.point.y - half], [e.point.x + half, e.point.y + half]]) || []; } catch (err) {}
    return feats.filter(x => x && x.sourceLayer === 'roads' && x.properties && typeof x.properties.name === 'string' && !!x.properties.name);
  };
  let pick = null;
  for (const half of CR_TAP_BOXES) { // a finger's real tolerance first; one wider retry before giving up (the widths live at CR_TAP_BOXES - Beta 1.156 narrowed them from [16, 28] on Andrew's device report: at 28 a tap far off the line still selected the road)
    const named = roadFeats(half);
    if (!named.length) continue;
    let pickD = Infinity;
    for (const f of named) { const d = crFeatDistM(e.lngLat, f.geometry); if (d < pickD) { pickD = d; pick = f.properties.name; } }
    if (!pick) pick = named[0].properties.name; // a named road whose tile line is unusable still names the street - the name is the identity
    break; // the first box that names any road decides
  }
  if (!pick) { toast('No road there — tap right on a road line', 2400); return; }
  pickStreet(pick, e.lngLat);
}
onMapReady(() => map.on('click', crMapTap));
$('crDoneBtn').addEventListener('click', () => { if (draftStreets().length) setCreateStage('preview'); }); // "Done" (Beta 1.128: the panel footer's ONLY button - the 1.127 "+ Add a street" ghost is gone; it never added anything, it only tucked the panel, and tucking belongs to the head's grab/tap gesture)
$('crReviewBtn').addEventListener('click', () => crExpandPanel()); // the bar's way back (mockup screen 4)
$('crClearAll').addEventListener('click', () => { // Andrew's addition (2026-11-06): empty the picks at once - behind the shared confirm, the same discipline as Start over and route deletion; the city and the session stay
  const n = draft ? draftStreets().length : 0; if (!n) return;
  crConfirm('Clear all ' + n + (n === 1 ? ' road?' : ' roads?'), 'Every road you picked will be taken off this route. The city stays loaded.', () => {
    draft.roads = {}; draft.mains.clear(); draft.osmNames = {}; draft.sectors = {}; draft.parts = {};
    crSectorReset();
    renderDraft(); renderCrLists(); crRenderHint();
  }, { yes: 'Clear all', no: 'Cancel', danger: true });
});
$('crSbWhole').addEventListener('click', () => { const s = crSectorSession.street; if (!s) return; const rec = crStreetParts(s); if (rec) crSetChosen(s, rec, new Set(rec.parts.map((_, i) => i))); renderDraft(); renderCrLists(); renderSectorBar(); }); // Entire road: every sector back on (the pick is stored as no entry again)
$('crSbDone').addEventListener('click', () => crCloseSectors()); // Done: back to the panel
$('crSbCancel').addEventListener('click', () => crCancelSectors()); // Cancel (Beta 1.129): restore the pick as it was when sector mode was entered, and leave
(() => { // the panel's tuck-away gesture (mockup screens 3-4): drag or flick the grab handle / header downward to collapse; a plain tap there collapses too. Buttons inside the header keep their own taps (the check below), and the rows below scroll natively - drags never start there
  const sheet = $('createSheet'), head = $('crPanelHead'); if (!sheet || !head) return; // Beta 1.129: the drag moves the SURFACE (the one card), not a face inside it
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
$('pvAddBtn').addEventListener('click', () => { // back to picking for more streets; Done there returns to this same preview (Beta 1.128: the panel button never changes its label, so no return-mode state is needed)
  if (crCity) { setCreateStage('pick'); return; }
  if (draft && draft.area) { crCity = { name: draft.area, lat: null, lon: null, bbox: null }; setCreateStage('pick'); return; } // Beta 1.121: a draft that already names its city (the photo door) pre-answers the city step - still changeable from the pick sheet's city chip
  crOpenCityPane('preview');
});

