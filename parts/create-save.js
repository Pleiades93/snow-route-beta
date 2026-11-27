// ---- name it + save ---- naming stays its own step; this pane's Save route is the only save
$('pvSaveBtn').addEventListener('click', openNameIt);
/** @returns {void} */
function openNameIt() {
  if (!draft || !draftStreets().length) return;
  $('crNameInput').value = draft.name || nextRouteNameGuess();
  $('crAreaInput').value = draft.area || crAreaGuess || lsGet(LS_GLOBAL.lastArea) || '';
  const g = crDraftGeom(); let tot = 0; for (const n of draftStreets()) tot += crStreetChosenM(n, g); // the summary bills what will actually save; the geometry comes through the shared cache like every other consumer
  $('crNameSummary').textContent = draftStreets().length + ' streets · ' + draft.primaries.size + ' primaries · ' + fmtLenM(tot) + ' of road';
  if (!routeLoaded) restoreBootChrome(); else openRouteMenu();
  showRmPane('rmNamePane');
}
$('crNameBack').addEventListener('click', () => { if (!routeLoaded) parkBootChrome(); else closeRouteMenu(); setCreateStage('preview'); });
$('crSaveBtn').addEventListener('click', saveDraftRoute);
let crSaveInFlight = false; // single-flight, or a double-tap runs the save twice under one id: the write awaits, the button is unguarded
/** @returns {Promise<void>} */
async function saveDraftRoute() {
  if (crSaveInFlight) return;
  crSaveInFlight = true;
  try {
  const name = $('crNameInput').value.trim();
  if (!name) return;
  const area = $('crAreaInput').value.trim();
  const roads = crFilteredRoads();
  const ends = (() => { // the pack carries boundary ends computed from the same extract as the sectors; no prepared coverage, no records
    try {
      if (!crCov || !crCov.byName) return {};
      const all = /** @type {RoadsMap} */ ({});
      for (const nm of Object.keys(crCov.byName)) { const ways = crCov.byName[nm].map(w => w && w.pts).filter(p => Array.isArray(p) && p.length > 1); if (ways.length) all[nm] = ways; }
      const be = computeBoundaryEnds(roads, all);
      const de = computeDeadEnds(roads, all); // dead ends join the same field, computed by the sibling computation from the same extract
      for (const k of Object.keys(de)) be[k] = (be[k] || []).concat(de[k]);
      return be;
    } catch (e) { return {}; }
  })();
  // the save stores chosen sectors only: the draft keeps whole streets, the pack never sees unchosen ends
  const v = normalizePack({ name, area, primaries: [...(/** @type {CrDraft} */ (draft)).primaries], roads, reference: {}, ends },
    { tileNames: [...Object.values((/** @type {CrDraft} */ (draft)).osmNames), ...((/** @type {CrDraft} */ (draft)).tileNames || [])] });
  if (!v.ok) { showBanner('Route not saved', (/** @type {{ok: false, error: string}} */ (v)).error); return; }
  const pack = v.pack; pack.id = uniqueRouteId(name);
  if (!(await upPut(pack.id, pack))) { showBanner('Route not saved'); return; } // one route's verified write: no whole-record rewrite remains to erase another route; a failure refuses this route only
  userPackCache[pack.id] = pack; // the backup picture joins the commit (create-packs.js: the cache moves only at verified commit points)
  ROUTE_PACKS.push(pack); // live in the runtime list at once - listed and switchable without a reload
  // a new route's preload record is honest: nothing downloaded yet; Status offers the (grown) union download
  try { lsSet(routeKeys(pack.id).pre, JSON.stringify({ at: 0, saved: 0, total: preloadUrlList().length, routeSaved: 0, routeTotal: packTileUrls(pack).size }))
    /* write-safe: every reader treats a missing record as this same zero state */; } catch (e) {}
  if (area) lsSet(LS_GLOBAL.lastArea, area) /* write-safe: only the next area suggestion can be stale */;
  const wasBoot = !routeLoaded, newId = pack.id;
  exitCreate();

  if (wasBoot) { restoreBootChrome(); if (window.__bootPickRoute) window.__bootPickRoute(newId); }
  else { openRouteMenu(); showRmPane('rmListPane'); }
  } finally { crSaveInFlight = false; }
}

(() => {
  const sp = $('splash'); if (!sp) return;
  const t0 = Date.now(); let gone = false;
  const finish = () => { if (gone) return; gone = true; clearInterval(iv); sp.remove(); const bl = $('brandLayer'); if (bl) bl.classList.add('off'); /* Beta 1.155: the title's layer is parked with the menu (through 1.154 the title rode inside the menu and parked as its child); unloadRouteToBoot revives it */ document.documentElement.classList.remove('boot'); /* Beta 1.85: the splash is gone - the root frame returns to the app's own colour (the html.boot rule) */ const rm = $('routeMenu'); if (rm) { rm.classList.add('notrans'); rm.classList.remove('boot', 'show', 'bye'); void rm.offsetWidth; rm.classList.remove('notrans'); } /* Beta 1.178: the 1.165 pill-wait gate (rmMain's .hold/.go classes) retired with the cut - no held state exists to strip at a pick any more */ }; // Beta 1.78: park the menu below the screen without animating the swap
  const arm = () => { const wait = Math.max(0, ((((/** @type {any} */ (window)).matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) ? 1900 : 2700) - (Date.now() - t0));
    setTimeout(() => { crWarmCityLibrary(); /* Beta 1.130: the catalogue download fires in this deferred boot slot, before Create ever opens */
      if (!gone) { const __bl = $('brandLayer'); if (__bl) __bl.classList.add('cut'); /* Beta 1.178: at the splash floor the brand cuts instantly (display:none) and never returns */
        sp.classList.add('menu'); $('routeMenu').classList.add('show'); document.documentElement.classList.remove('boot'); /* Beta 1.86: the boot state also ends here, when the menu arms */ } }, wait); };
  const iv = setInterval(() => {
    if (!map && Date.now() - t0 > 4000) __bootTail();
    if ((typeof glOk !== 'undefined' && glOk && typeof tilesOk !== 'undefined' && tilesOk > 0) || Date.now() - t0 > 6000) { clearInterval(iv); arm(); }
  }, 120);
  window.__bootPickRoute = id => { loadRoute(id); document.documentElement.classList.remove('boot'); /* Beta 1.86: the boot state flips FIRST, while both blue layers are still opaque - the finished app (chrome included) paints beneath them, and the fade below reveals it whole, instead of the chrome popping in after the blue is gone (the 1.67 weirdness Andrew flagged) */ let faded = false; const fade = () => { if (faded) return; faded = true; sp.classList.add('go'); $('routeMenu').classList.add('bye'); const __bl2 = $('brandLayer'); if (__bl2) __bl2.classList.add('bye'); /* Beta 1.155: the landed title fades WITH the menu on a pick - its layer carries the same .bye shape (through 1.154 it faded as the menu's child) */ setTimeout(finish, 780); }; requestAnimationFrame(fade); setTimeout(fade, 150); }; // the boot-mode row pick (app2 wires the rows and the pane buttons): load the route, flip the boot state, fade both blue layers, then finish() removes the splash and parks the menu
})();

