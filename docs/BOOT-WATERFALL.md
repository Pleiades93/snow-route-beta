# Boot waterfall audit (GF3)

Status: diagnostic only, measured on Beta 1.305 (main 69472803). This round
changed no app code and proposes no budget. The budget field stays as GF1
left it:

```
budget: null
```

## The short version: where the seconds and bytes go

On the slow profile (Slow 3G + 4x CPU, the GF1 profile) the settled picker
paint lands at a median of 21,063 ms. The chain that adds up to it:

| Step | Slow leg | Fast leg | What it is |
| --- | ---: | ---: | --- |
| The shell document downloads | 15,213 ms | 92 ms | One HTML file: 472,344 wire bytes. On the slow leg about 2,000 ms is link latency before the first byte; the rest is the stream, shared with the transfers below. |
| The bundle evaluates | 352 ms | 1,840 ms | On the fast leg most of this is not evaluation: the parser waits for the MapLibre script (lands ~1,815 ms) before running the bundle. Pure evaluation after that: ~150 ms fast, ~350 ms slow. |
| The splash intro tail runs out | 2,651 ms | 1,829 ms | The map may not start until the splash intro's trigger fires (`__bootTail`, parts/app5.js): the animation-end path on the fast leg, the 2,600 ms fallback timer on the slow leg. |
| Map start to picker reveal | 1,014 ms | 1,031 ms | `bootMap` constructs the map while the picker's reveal (armed on its own intro floor, GF2) paints in. |
| Reveal to settled picker paint | 1,848 ms | 985 ms | The reveal's paint-in plus the city catalogue warm fetch starting inside the same window. |

Phase medians are per-phase distributions; the slow-leg chain sums to
21,078 ms against a 21,063 ms total, the fast-leg chain to 5,777 ms
against 6,027 ms.

The map itself is ready later than the picker on both legs: 25,107 ms
slow (4,044 ms after the picker), 7,506 ms fast (1,479 ms after). That is
the GF2 design working: the picker no longer waits for the map.

The bytes that cross the wire before the picker settles (slow leg,
688,734 total): the shell document 472,344 (69%), the MapLibre library
175,275 (25%), the browser's own icon and manifest fetches 32,800 (5%),
the MapLibre stylesheet 8,314 (1%). Everything else is zero or near it.
Two numbers kill most "quick win" ideas: the two embedded map styles
together gzip to 8,440 bytes (1.8% of the shell), and the city catalogue
file is 3,391 bytes. The one big lever the numbers support is shrinking
the shell itself: a scratch minification of the shipped bundle (method
below) cuts 129,865 wire bytes, about 2.6 s of slow-leg link time.

The update probe, measured fresh for this audit: when it fires inside
the boot window it receives zero bytes and is aborted by its own
1,500 ms timer, every time. On this profile it can never succeed (the
link's round trip alone is 2,000 ms). Details under "Update probe".

## Method: how this waterfall was drawn, and how to re-draw it

- Tool: `tests/browser/coldstart.mjs --waterfall` (this round). It runs
  the GF1 protocol unchanged (5 alternating slow/control pairs, fresh
  profile per run, same validity checks, same settled-picker-paint
  endpoint) and derives the phases and the byte account from the same
  run's captured request table and in-page stamps. The baseline,
  default and profile modes are untouched and return the same checks
  as before this round.
- One clock: every stamp is milliseconds since navigation start on the
  performance timeline. In-page stamps (`__tailAt`, `__bootAt`, the
  picker's reveal and settle stamps) are converted through
  `performance.timeOrigin`; request spans come from the CDP Network
  stream of the same run. No wall clocks are mixed.
- Validity: 10 of 10 runs valid, 30 of 30 checks green. Every figure
  below is the median of the 5 valid runs of its leg unless a single
  run is named.
- Rig: the maintainer VM (1.5 shared CPUs behind the egress proxy,
  Chrome for Testing 158). Like GF1's baseline, this is a rig yardstick
  for comparing changes, not a claim about any phone.
- Named exclusions. Traffic on the service worker's own target is not
  captured (the worker's install fetches). Sprite and glyph responses
  are relayed through the map's worker and report 0 encoded bytes to
  the page capture; their spans are measured and their real sizes were
  read directly (listed in the byte account). Repeat visits are out of
  scope: a returning user is served by the service worker, not by this
  cold path.

Re-draw it with:

```
CHROME_BIN=<chromium> node tests/browser/coldstart.mjs --waterfall
```

## The waterfall in detail

Sequential chain (medians, ms since navigation start):

| Phase | Slow start | Slow end | Fast start | Fast end | Seat in code |
| --- | ---: | ---: | ---: | ---: | --- |
| document | 0 | 15,213 | 0 | 92 | The shell request; response start 2,058 slow / 48 fast. |
| bundle-eval | 15,213 | 15,565 | 92 | 1,932 | Document end to `__tailAt` (parts/app5.js). Fast leg includes the wait for the library script. |
| intro-tail-wait | 15,565 | 18,216 | 1,932 | 3,761 | `__tailAt` to `__bootAt`: the splash intro trigger (animation-end + 700 ms, or the 2,600 ms fallback at parts/app5.js) gates `__bootTail`. |
| map-to-reveal | 18,216 | 19,230 | 3,761 | 4,792 | `bootMap` (parts/app2.js) constructs the map; the splash IIFE's `arm()` (parts/create-save.js) reveals the picker on its own floor. |
| reveal-to-settled | 19,230 | 21,063 | 4,792 | 6,027 | Reveal to the settled picker paint (the GF1/GF2 endpoint). |
| map-ready (branch) | 18,216 | 25,107 | 3,761 | 7,506 | `bootMap` to `glOk && tilesOk > 0`: style load plus the first parsed basemap tile. Runs beside the picker chain, lands after it. |

Parallel spans inside the same window (medians):

| Span | Slow | Fast | Notes |
| --- | ---: | ---: | --- |
| MapLibre stylesheet | starts 2,128, span 3,022 | starts 140, span 1,323 | 8,314 wire bytes; the span is nearly all latency and queueing on a separate origin. |
| MapLibre script | starts 4,328, ends 13,324 (span 8,996) | starts 141, ends 1,815 (span 1,674) | Parser-blocking: the bundle may not run before it lands. On the slow leg the parser reaches its tag late, behind the stylesheet. |
| First paint | 5,216 | 1,548 | The splash's frame paints from the streamed head long before the shell lands. First contentful paint: 15,824 slow / 2,064 fast. |
| City catalogue warm | starts ~19,200, still in flight at settle | starts ~4,800, lands in ~198 | `crWarmCityLibrary` fires inside the reveal sequence (parts/create-save.js). 3,548 wire bytes when it lands. |
| Sprite fetches | other set ~16,600; boot pair ~18,700 | ~2,600 / ~3,900 | The other theme's set is pre-warmed ~1 s after the bundle evaluates (parts/app5.js) so a theme flip never waits; the boot pair is the map's own load. |
| Glyph fetches | start ~20,700, in flight at settle | start ~5,240 | The map's first label rendering. Each glyph range file is 76,044 bytes read directly; they belong to map readiness, not the picker. |
| Tile requests | none start before settle | none start before settle | Zero `.mvt` requests begin before the settled picker paint on either leg, in any of the 10 runs. All tile traffic is a post-picker, map-readiness cost. |

Waited-on edges, stated plainly:

- The bundle waits on the document stream, and on the library script
  where the script lands later than the document (the fast leg).
- `bootMap` waits on the splash intro trigger, not on the network:
  by the time it runs, the library has been sitting ready for ~4.9 s
  on the slow leg (landed 13,324; map starts 18,216).
- The picker reveal waits on its own intro floor and the reveal
  sequence, not on the map (GF2): in this capture the reveal follows
  map start closely because both are gated by timers armed at the
  same moment, not because one calls the other.
- Map readiness waits on the style's sprites and glyphs and the first
  tile, all of which start only after the map exists.
- Main-thread work before the picker settles (longtasks over 50 ms):
  4,093 ms total across a median of 23 tasks on the slow leg (longest
  606 ms), 2,204 ms across 16 tasks on the fast leg (longest 284 ms).
  The bundle's own evaluation task is ~449 ms on the slow leg.

## Byte account

Every request that started before the settled picker paint, grouped,
medians of the 5 valid runs per leg. The groups sum exactly to each
run's observed pre-picker total (verified per run; tolerance zero):

| Group | Slow bytes | Fast bytes | Requests | Needed |
| --- | ---: | ---: | ---: | --- |
| Shell document (the whole app: markup, styles, bundle) | 472,344 | 472,344 | 1 | needed-before-picker |
| MapLibre library script (CDN) | 175,275 | 175,251 | 1 | needed-before-picker |
| Icons and manifest (favicon.svg 10,585; icon-192.png 21,270; manifest.json 945) | 32,800 | 32,800 | 3 | not-needed-at-boot |
| MapLibre stylesheet (CDN) | 8,314 | 8,317 | 1 | needed-before-picker |
| City catalogue (packs/index.json) | 0 (in flight at settle) | 3,548 | 1 | not-needed-at-boot |
| Update probe | 0 | not seen in window | 0-1 | not-needed-at-boot |
| Sprites (both themes' sets) | 0 reported | 0 reported | 6 | needed-before-map |
| Glyphs (label font ranges) | 0 reported | 0 reported | 3-4 | needed-before-map |
| Data-URL images (the brand artwork, inline) | 0 | 0 | 31 | needed-before-picker |
| Tiles | 0 | 0 | 0 | needed-before-map |
| **Total** | **688,734** | **692,261** | 44-48 | |

Notes on the account:

- The fast leg's total is higher because the catalogue fetch lands
  before settle there; on the slow leg it is still in flight.
- Sprite and glyph rows report 0 because those responses are relayed
  through the map's worker (see Method). Read directly, the sprite
  files are: light.json 3,549; light.png 16,174; light@2x.png 28,852;
  dark@2x.png 28,407; each glyph range file 76,044. The pre-warm set
  (the other theme's four sprite files, ~52 KB) crosses inside the
  boot window by design.
- Inside the shell (composition, not traffic): the inline bundle is
  1,103,202 raw bytes of the 1,327,329-byte document. The two embedded
  map styles (parts/pmstyles.js, 132,987 raw) gzip to 8,440 bytes.
- The service worker script itself (18,443 bytes) is fetched on the
  worker's target during install and is outside this account.

## Update probe

The boot update probe (parts/app5.js, calling `probeServedVer` in
parts/app4.js) re-requests the entire shell with `cache: no-store` to
read the served version label, under a 1,500 ms abort timer. Measured
fresh in this capture:

- Slow leg: the probe started inside the boot window in 3 of 5 runs
  (at ~15,800-16,000 ms, just after the bundle evaluated and the
  service worker registration resolved). In all 3 it received 0 bytes
  and ended `net::ERR_ABORTED`. In 2 of 5 runs it had not started when
  the picker settled; its start waits on registration, so its place in
  the boot is racy, not fixed.
- Fast leg: it never appeared inside the window in 5 of 5 runs.
- It cannot succeed on the slow profile: the emulated round trip is
  2,000 ms and the abort fires at 1,500 ms, before the first response
  byte can arrive. On links where it can complete, its cost is the
  whole 472,344-byte shell, re-transferred inside the boot window.
- GF1 saw the same shape (aborted in 4 of 5 throttled runs there);
  this capture confirms it with the request in the table.

## Ranked proposals

Each proposal names the change in one sentence, the expected effect
with its derivation, the risk, and the A/B that would judge it. The
judging instrument for all of them is the GF1/GF2 cold-start protocol
(5 alternating pairs, medians, spreads must not overlap to claim a
win), plus the full PR gate. Nothing here is built; Andrew picks.

1. **Minify the shipped bundle at build time.**
   Effect: a scratch run of esbuild `--minify` over the exact shipped
   bundle (1,103,202 raw bytes) produced 657,764 raw bytes and cut the
   document's gzip from 470,634 to 340,769: 129,865 fewer wire bytes,
   which at the slow profile's 50,000 B/s is ~2.6 s off the shell's
   stream, before any evaluation-time saving (unmeasured; the A/B
   reads it). Derivation is a measurement on the real bundle, not an
   estimate from ratios.
   Risk: a build-pipeline change. Identifier renaming must preserve
   the names read from outside the bundle (the test drives read app
   globals; window-pinned properties survive as properties, bare
   globals need a reserved list or a no-rename setting, which saves
   less). The minifier must be pinned in the toolchain and the
   CSP/parity stamps re-derived by the build as today.
   Judged by: coldstart profile mode, picker medians both legs, plus
   the full gate.

2. **Start the map under the splash intro instead of after it.**
   Effect: `bootMap` currently waits 2,651 ms (slow) / 1,829 ms (fast)
   for the intro trigger while the library sits ready; starting the
   boot tail when the bundle evaluates moves map readiness earlier by
   about that wait on both legs. The picker does not move (it arms on
   its own floor, GF2). Note: the boot tail also applies the theme, so
   this overlaps the queued startup round's theme-before-first-paint
   fix; it belongs inside that round's scope, not a separate one.
   Risk: main-thread contention with the splash animation on weak
   hardware (the evaluation and map construction would run during the
   intro). The intro's fallback timer must stay as the stuck-intro
   guard for whatever still waits on it.
   Judged by: coldstart waterfall mode (mapReadyMs and picker,
   both legs) and the frame-rate drives that guard the menus.

3. **Move the update probe out of the boot window.**
   Effect: start the probe after the picker settles (or at first
   idle). Measured basis above: in-window it is guaranteed futile on
   slow links (0 bytes, aborted at 1,500 ms against a 2,000 ms round
   trip) and on mid-speed links it re-transfers the whole shell
   during boot. The picker gain on this exact profile is small (the
   probe moves ~0 bytes here); the gain is removing a 1.5 s fetch
   from the map-boot window and the full-shell transfer from slower
   real-world boots. An update found seconds later reloads exactly
   the same way.
   Risk: near zero. The session guard and the reload behaviour are
   unchanged; only the start time moves.
   Judged by: coldstart waterfall mode (the probe no longer appears
   before settle) with picker and map-ready medians compared.

4. **Inline the MapLibre stylesheet into the shell.**
   Effect: the stylesheet is 8,314 wire bytes but a 3,022 ms span on
   the slow leg (separate origin: connection plus 2,000 ms latency),
   and the library script's fetch starts behind it. Its `url()`
   references are all data URIs (verified), so inlining breaks no
   asset. Removing the separate fetch lets the library's fetch start
   with the document and removes one latency round trip from the
   map's critical path; the picker is unaffected (GF2), map readiness
   gains up to ~2-3 s of span on the slow leg. The shell grows by
   roughly the stylesheet's own compressed size.
   Risk: the stylesheet's SRI pin goes away (the copy becomes ours,
   like the rest of the shell); a library upgrade must re-inline it,
   which is a build step.
   Judged by: coldstart waterfall mode (library span, mapReadyMs).

5. **Self-host the MapLibre library script.**
   Effect: the library is 175,275 wire bytes on a separate origin;
   its slow-leg span is 8,996 ms including its own connection and
   latency. Served from the app's own origin (GitHub Pages, HTTP/2)
   it shares the document's connection: the span should shrink by
   roughly the extra origin's latency (~2 s on this profile) and
   start earlier. Map readiness gains; the picker does not move.
   Risk: the repo carries the library file and the service worker's
   core list grows by its size; version bumps become file swaps
   instead of URL edits. The SRI pin is replaced by same-origin
   trust, the same trust the shell itself already has.
   Judged by: coldstart waterfall mode (library span, mapReadyMs).

6. **Trim the two icon files the browser fetches at boot.**
   Effect: favicon.svg (10,585) and icon-192.png (21,270) transfer
   inside the boot window (slow leg: ~16,100-18,800 ms), sharing the
   link with the map's first fetches. They block nothing; halving
   both would free ~16 KB, about 0.3 s of link time in that window.
   The picker gain is ~0; this is listed because the account has to
   explain the bytes, and the files are larger than they need to be.
   Risk: the icon is the app's face on the home screen; any change
   needs Andrew's eye on the result. Ranked last on purpose.
   Judged by: coldstart waterfall mode byte account (the icons row).

## Rejected candidates

- **Split off the other theme's embedded map style.** Killed by the
  number: both styles together (parts/pmstyles.js) gzip to 8,440
  bytes, 1.8% of the shell's wire size. Splitting would also break
  the offline theme switch, which is local by design.
- **Shrink, defer or drop the city catalogue warm fetch.** Killed by
  the number: packs/index.json is 3,391 bytes (3,548 on the wire),
  starts after the reveal begins and blocks nothing. The two named
  create-flow gaps in docs/SNAPSHOT-FIRST.md are about the catalogue
  having no on-device snapshot, not about this fetch's size.
- **Preload or prefetch basemap tiles or route data.** Rejected by
  the standing rule against speculative preloading, and measured
  pointless for the picker: zero tile requests start before the
  picker settles on either leg.
- **Let the update probe finish (raise its 1,500 ms abort).** Killed
  by the probe's own numbers: anywhere it can finish, it transfers
  the whole 472,344-byte shell inside the boot window. The fix
  direction is out of the window (proposal 3), not a longer leash.
- **Defer the MapLibre library until after the picker.** Killed by
  GF2's measurement: the picker no longer waits for the library
  (drive233 arms it with every request failing), so deferring buys
  the picker nothing and delays map readiness by the library's whole
  span.
- **Cache headers / repeat-visit tuning.** Out of scope by method:
  this waterfall is the cold first load; repeat visits are served by
  the service worker and are a different measurement.
