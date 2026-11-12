// ---- name it + save (Beta 1.128: the step STAYS its own - a draft of
// this build folded naming into the preview and Andrew vetoed it the
// same evening; the preview's button is labelled "Save route" and
// advances here, and this pane's "Save route" remains the only save) ----
$('pvSaveBtn').addEventListener('click', openNameIt);
function openNameIt() {
  if (!draft || !draftStreets().length) return;
  $('crNameInput').value = draft.name || nextRouteNameGuess();
  $('crAreaInput').value = draft.area || crAreaGuess || lsGet(LS_GLOBAL.lastArea) || '';
  const g = crDraftGeom(); let tot = 0; for (const n of draftStreets()) tot += crStreetChosenM(n, g); // Beta 1.127: the summary bills what will actually save. Beta 1.135 (N3): the geometry comes through the shared cache like every other consumer
  $('crNameSummary').textContent = draftStreets().length + ' streets · ' + draft.mains.size + ' mains · ' + fmtLenM(tot) + ' of road';
  if (!routeLoaded) restoreBootChrome(); else openRouteMenu();
  showRmPane('rmNamePane');
}
$('crNameBack').addEventListener('click', () => { if (!routeLoaded) parkBootChrome(); else closeRouteMenu(); setCreateStage('preview'); });
$('crSaveBtn').addEventListener('click', saveDraftRoute);
let crSaveInFlight = false; // Beta 1.170 (Carbon fix round Phase 2, D-03): single-flight for the save - the function is async (the store write awaits) and had no re-entrancy guard through 1.169, and the button carries no tap guard, so a double-tap ran it twice: both calls computed the same uniqueRouteId before either registered the pack, the second overwrote the first's store record, and the pack was pushed twice under one id; a late tap landing after a completed save's exitCreate had nulled the draft threw on draft.mains instead
async function saveDraftRoute() {
  if (crSaveInFlight) return;
  crSaveInFlight = true;
  try {
  const name = $('crNameInput').value.trim();
  if (!name) { toast('Give the route a name first', 2600); return; }
  const area = $('crAreaInput').value.trim();
  const v = normalizePack({ name, area, mains: [...draft.mains], roads: crFilteredRoads(), reference: {} }, { tileNames: [...Object.values(draft.osmNames), ...(draft.tileNames || [])] }); // Beta 1.127: the SAVE stores chosen sectors only - the draft keeps the whole streets, the pack never sees the unchosen ends
  if (!v.ok) { toast('Could not save — ' + v.error, 4000); return; }
  const pack = v.pack; pack.id = uniqueRouteId(name);
  if (!(await upPut(pack.id, pack))) { toast('Storage problem — the route could not be saved', 4000); return; } // Beta 1.166: the save is ONE route's own verified store write (create-packs.js) - the DA-05 hazard class is gone by construction: there is no whole-record read-modify-write left to erase another route, a corrupt legacy record cannot block a save it is no longer part of, and a failed write refuses THIS route only, before it is registered anywhere
  userPackCache[pack.id] = pack; // the backup picture joins the commit (create-packs.js: the cache moves only at verified commit points)
  ROUTE_PACKS.push(pack); // live in the runtime list at once - listed and switchable without a reload
  try { lsSet(routeKeys(pack.id).pre, JSON.stringify({ at: 0, saved: 0, total: preloadUrlList().length, routeSaved: 0, routeTotal: packTileUrls(pack).size })); } catch (e) {} // F5: the new route starts with an honest preload record - none of its area is downloaded yet; Status offers the (grown) union download
  if (area) lsSet(LS_GLOBAL.lastArea, area);
  const wasBoot = !routeLoaded, newId = pack.id;
  exitCreate();
  toast('Route saved — its maps are not downloaded yet; get them in Settings → Status → Download', 4600);
  if (wasBoot) { restoreBootChrome(); if (window.__bootPickRoute) window.__bootPickRoute(newId); }
  else { openRouteMenu(); showRmPane('rmListPane'); }
  } finally { crSaveInFlight = false; }
}

(() => {
  const sp = $('splash'); if (!sp) return;
  const t0 = Date.now(); let gone = false;
  const finish = () => { if (gone) return; gone = true; clearInterval(iv); sp.remove(); const bl = $('brandLayer'); if (bl) bl.classList.add('off'); /* Beta 1.155: the title's layer is parked with the menu (through 1.154 the title rode inside the menu and parked as its child); unloadRouteToBoot revives it */ document.documentElement.classList.remove('boot'); /* Beta 1.85: the splash is gone - the root frame returns to the app's own colour (the html.boot rule) */ const rm = $('routeMenu'); if (rm) { rm.classList.add('notrans'); rm.classList.remove('boot', 'show', 'bye'); void rm.offsetWidth; rm.classList.remove('notrans'); } /* Beta 1.178: the 1.165 pill-wait gate (rmMain's .hold/.go classes) retired with the cut - no held state exists to strip at a pick any more */ }; // Beta 1.78: park the menu below the screen without animating the swap
  const arm = () => { const wait = Math.max(0, (((window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) ? 1900 : 2700) - (Date.now() - t0)); setTimeout(() => { crWarmCityLibrary(); /* Beta 1.130: Andrew's own suggestion, adjudicated to the catalogue ONLY - the packs/index.json download fires in this deferred boot slot (the menu-arming moment: first tiles are in or the 6 s escape has passed, the splash floor has run (Beta 1.160: 2700 ms on the animated path - arm() flips at the Option-3 sequence's 2.7 s mark, after the block's 1.25 s fade-in and the hold (Beta 1.163: the arrivals are the original SEPARATE ones again, per Andrew's correction of 1.162 - the icon fades in at 1.25 s and the title slides in at 1.5 s, the animations back on the children inside #brandBlock exactly as through 1.161; 1.162's shared block fade stood for one release; the floor itself is unchanged); under reduced motion nothing animates, so the floor stays 1900 ms exactly as through 1.159), so it never competes with first paint), and a cold open has the catalogue in hand before Create is ever opened. The city PACK FILES stay on-demand per city - 6.5 MB of gzip across the library is not boot work. The cached promise keeps it to one fetch per session; the gate/menu warm calls remain as no-op re-triggers */ if (!gone) { const __bl = $('brandLayer'); if (__bl) __bl.classList.add('cut'); /* Beta 1.178 (Andrew, 2026-11-12 - he picked variant A, 'Cut', from the intro-transition demo): at this moment - the splash sequence complete - the brand DISAPPEARS INSTANTLY: #brandLayer.cut is display:none (head.html), a hard cut with no fade, no drift and no scale, and the doors menu stands SOLO from here on - no icon and no title on the main pane or any other, in any later state of the session: .cut is never removed (finish() still parks the layer with .off at a pick, and unloadRouteToBoot's clearing of .off/.bye leaves .cut standing, so the return to the picker is solo too; a fresh load replays the splash and cuts again here). Under reduced motion the same cut applies on the unchanged 1900ms floor - an instant disappearance is this transition's motion-safe form. RETIRED with the cut: the 1.162-1.164 FLIP (the block's 1.3s flight to the calc(35.49% - 209.42px) landing pose; the pose rules are removed from head.html) and the 1.165 pill-wait gate (rmMain's .hold/.go, the flight watch and its fallbacks - no flight remains to clear the pills' path; the pills fade in on the pane's own .35s fade as .show lands below). The snow is NOT coupled to the brand block: the canvas lives in #splash and its engine (brand-snow.js) keys the scene off .bye/.off, never .cut, so the menu's falling snow runs exactly as before until a pick ends the scene. */ sp.classList.add('menu'); $('routeMenu').classList.add('show'); document.documentElement.classList.remove('boot'); /* Beta 1.86: the boot state also ends HERE, when the menu arms - the still-to-live handover window (the unsettled first frames the chrome-absence protects) is long past by the gate's splash-floor minimum, and the opaque menu covers the chrome while it paints beneath. Every later state (a post-reload session at the menu, the pick, a direct load) must find a functional shell; the pick/loadRoute/finish removals stay as backstops */ } }, wait); };
  const iv = setInterval(() => {
    if (!map && Date.now() - t0 > 4000) __bootTail();
    if ((typeof glOk !== 'undefined' && glOk && typeof tilesOk !== 'undefined' && tilesOk > 0) || Date.now() - t0 > 6000) { clearInterval(iv); arm(); }
  }, 120);
  window.__bootPickRoute = id => { loadRoute(id); document.documentElement.classList.remove('boot'); /* Beta 1.86: the boot state flips FIRST, while both blue layers are still opaque - the finished app (chrome included) paints beneath them, and the fade below reveals it whole, instead of the chrome popping in after the blue is gone (the 1.67 weirdness Andrew flagged) */ let faded = false; const fade = () => { if (faded) return; faded = true; sp.classList.add('go'); $('routeMenu').classList.add('bye'); const __bl2 = $('brandLayer'); if (__bl2) __bl2.classList.add('bye'); /* Beta 1.155: the landed title fades WITH the menu on a pick - its layer carries the same .bye shape (through 1.154 it faded as the menu's child) */ setTimeout(finish, 780); }; requestAnimationFrame(fade); setTimeout(fade, 150); }; // the boot-mode row pick (app2 wires the rows and the pane buttons): load the route, flip the boot state, fade both blue layers, then finish() removes the splash and parks the menu
})();

