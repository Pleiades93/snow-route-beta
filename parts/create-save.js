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
function saveDraftRoute() {
  const name = $('crNameInput').value.trim();
  if (!name) { toast('Give the route a name first', 2600); return; }
  const area = $('crAreaInput').value.trim();
  const v = normalizePack({ name, area, mains: [...draft.mains], roads: crFilteredRoads(), reference: {} }, { tileNames: [...Object.values(draft.osmNames), ...(draft.tileNames || [])] }); // Beta 1.127: the SAVE stores chosen sectors only - the draft keeps the whole streets, the pack never sees the unchosen ends
  if (!v.ok) { toast('Could not save — ' + v.error, 4000); return; }
  const pack = v.pack; pack.id = uniqueRouteId(name);
  const rec = readUserPacks(); // Beta 1.142 (Package B, DA-05): STRICT - saving is a read-modify-write of the WHOLE record, so a read that throws or parses corrupt refuses the save outright. The lenient loader's {} here silently erased every other created route's definition (their progress stayed, unregistered and unreachable); deleteRoute has read strictly since 1.124 for exactly this reason, and the lenient loader remains only for boot/display.
  if (rec === null) { toast('Storage problem — the route could not be saved', 4000); return; }
  rec[pack.id] = pack;
  if (!lsSet(USERPACKS_KEY, JSON.stringify(rec))) { toast('Storage problem — the route could not be saved', 4000); return; }
  ROUTE_PACKS.push(pack); // live in the runtime list at once - listed and switchable without a reload
  try { lsSet(routeKeys(pack.id).pre, JSON.stringify({ at: 0, saved: 0, total: preloadUrlList().length, routeSaved: 0, routeTotal: packTileUrls(pack).size })); } catch (e) {} // F5: the new route starts with an honest preload record - none of its area is downloaded yet; Status offers the (grown) union download
  if (area) lsSet(LS_GLOBAL.lastArea, area);
  const wasBoot = !routeLoaded, newId = pack.id;
  exitCreate();
  toast('Route saved — its maps are not downloaded yet; get them in Settings → Status → Download', 4600);
  if (wasBoot) { restoreBootChrome(); if (window.__bootPickRoute) window.__bootPickRoute(newId); }
  else { openRouteMenu(); showRmPane('rmListPane'); }
}

(() => {
  const sp = $('splash'); if (!sp) return;
  const t0 = Date.now(); let gone = false;
  const finish = () => { if (gone) return; gone = true; clearInterval(iv); sp.remove(); const bl = $('brandLayer'); if (bl) bl.classList.add('off'); /* Beta 1.155: the title's layer is parked with the menu (through 1.154 the title rode inside the menu and parked as its child); unloadRouteToBoot revives it */ document.documentElement.classList.remove('boot'); /* Beta 1.85: the splash is gone - the root frame returns to the app's own colour (the html.boot rule) */ const rm = $('routeMenu'); if (rm) { rm.classList.add('notrans'); rm.classList.remove('boot', 'show', 'bye'); void rm.offsetWidth; rm.classList.remove('notrans'); } }; // Beta 1.78: park the menu below the screen without animating the swap
  const arm = () => { const wait = Math.max(0, 1900 - (Date.now() - t0)); setTimeout(() => { crWarmCityLibrary(); /* Beta 1.130: Andrew's own suggestion, adjudicated to the catalogue ONLY - the packs/index.json download fires in this deferred boot slot (the menu-arming moment: first tiles are in or the 6 s escape has passed, the 1900 ms splash floor has run, so it never competes with first paint), and a cold open has the catalogue in hand before Create is ever opened. The city PACK FILES stay on-demand per city - 6.5 MB of gzip across the library is not boot work. The cached promise keeps it to one fetch per session; the gate/menu warm calls remain as no-op re-triggers */ if (!gone) { const __t = $('splashTitle'), __bl = $('brandLayer'); if (__t && __bl && !__bl.classList.contains('menu')) { /* Beta 1.155 (Andrew: the splash screen text and the text in the second menu "are two separate things - we have to make them one, so it's just a smooth transition"): the title is NEVER reparented. It lives in #brandLayer (head.html), whose splash pose reproduces its brand box by construction and whose .menu pose is its menu slot; arm() flips the layer's pose class and FLIPs the title inside the layer (measure, flip, invert, play) over 1.3s cubic-bezier(.65,0,.35,1), at ONE size as it rises. Beta 1.157 (Andrew, on his 1.155 phone test): four refinements on this flip - the duration stretches .95s -> 1.3s ("slow it down a little bit, make it a smooth transition") on a gentle-start easing; the 37px -> 28px shrink is RETIRED (".menu" no longer sets a smaller font - "the same size throughout... it should just animate up"), so the measured scale here is 1 and the flip is translate-only; the icon is back on its pre-update box (the #brandMirror restoration in head.html - the hold gap is the original 26px, not the -8px overlap 1.155 shipped); and the brand's fade at the flip runs .3s, so the icon is gone before the rising title reaches its box. drive180 measures all four. The 1.153 design lifted the node into #routeMenu at this point and FLIPped it there - and the menu is mid-entrance at this moment (visibility hidden until +150 ms, opacity ramping in from 0, translateX(-26px) still sliding home), so the painted title vanished at the flip and faded back in part-risen on its new parent's ramp: two texts trading places, exactly as Andrew reported (drive180's rAF trace measures it). The layer itself never transforms, fades or hides during the travel, so the animation's first painted frame IS the splash hold frame. The entrance animation's fill owns the title's transform/opacity until cleared, so both are reset inline first; the whole flip happens in one synchronous block, so no intermediate state can paint. Under reduced motion the pose simply lands, matching the app's existing convention. */ const __r0 = __t.getBoundingClientRect(); __t.style.animation = 'none'; __t.style.opacity = '1'; __bl.classList.add('menu'); if (!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) { const __r1 = __t.getBoundingClientRect(); const __dx = (__r0.left + __r0.width / 2) - (__r1.left + __r1.width / 2), __dy = (__r0.top + __r0.height / 2) - (__r1.top + __r1.height / 2), __s = __r1.height ? __r0.height / __r1.height : 1; __t.style.transition = 'none'; __t.style.transform = 'translate(' + __dx + 'px, ' + __dy + 'px) scale(' + __s + ')'; void __t.offsetWidth; __t.style.transition = 'transform 1.3s cubic-bezier(.65,0,.35,1)'; __t.style.transform = ''; __t.addEventListener('transitionend', () => { __t.style.transition = ''; __t.style.transform = ''; }, { once: true }); } } sp.classList.add('menu'); $('routeMenu').classList.add('show'); document.documentElement.classList.remove('boot'); /* Beta 1.86: the boot state also ends HERE, when the menu arms - the still-to-live handover window (the unsettled first frames the chrome-absence protects) is long past by the gate's 1900ms minimum, and the opaque menu covers the chrome while it paints beneath. Every later state (a post-reload session at the menu, the pick, a direct load) must find a functional shell; the pick/loadRoute/finish removals stay as backstops */ } }, wait); };
  const iv = setInterval(() => {
    if (!map && Date.now() - t0 > 4000) __bootTail();
    if ((typeof glOk !== 'undefined' && glOk && typeof tilesOk !== 'undefined' && tilesOk > 0) || Date.now() - t0 > 6000) { clearInterval(iv); arm(); }
  }, 120);
  window.__bootPickRoute = id => { loadRoute(id); document.documentElement.classList.remove('boot'); /* Beta 1.86: the boot state flips FIRST, while both blue layers are still opaque - the finished app (chrome included) paints beneath them, and the fade below reveals it whole, instead of the chrome popping in after the blue is gone (the 1.67 weirdness Andrew flagged) */ let faded = false; const fade = () => { if (faded) return; faded = true; sp.classList.add('go'); $('routeMenu').classList.add('bye'); const __bl2 = $('brandLayer'); if (__bl2) __bl2.classList.add('bye'); /* Beta 1.155: the landed title fades WITH the menu on a pick - its layer carries the same .bye shape (through 1.154 it faded as the menu's child) */ setTimeout(finish, 780); }; requestAnimationFrame(fade); setTimeout(fade, 150); }; // the boot-mode row pick (app2 wires the rows and the pane buttons): load the route, flip the boot state, fade both blue layers, then finish() removes the splash and parks the menu
})();
