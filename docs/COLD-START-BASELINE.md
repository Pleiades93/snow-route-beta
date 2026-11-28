# Cold-start baseline

Measure the shipped boot path before proposing any picker
budget. The baseline compares the same build with and
without combined network and CPU throttling, on one named
rig. It is a repeatable yardstick for A/B comparisons
(GF3 measures against exactly this), not a claim about
any particular phone: CI runners differ, and the phone
differs again.

## The tool

`tests/browser/coldstart.mjs` boots the assembled app
over local HTTP in a fresh Chrome profile per run, with
no request interception - Chromium itself transfers the
gzip shell over loopback and the live page resources
(the MapLibre CDN files, the basemap sprites, glyphs and
tiles) under CDP network emulation. It is a measuring
instrument, not a merge gate: it runs on dispatch
(`.github/workflows/coldstart.yml`) or directly, and its
timings are evidence, never verdicts.

```sh
python3 scripts/assemble.py
CHROME_BIN=<chrome> node tests/browser/coldstart.mjs            # one throttled run
CHROME_BIN=<chrome> node tests/browser/coldstart.mjs --baseline # five alternating pairs
CHROME_BIN=<chrome> node tests/browser/coldstart.mjs --profile  # diagnostic CPU capture
```

Full JSON goes to stdout; keep the files as evidence.

## The profile

One throttled leg, named by its numbers. CDP network
emulation: latency 2,000 ms, download 50,000 B/s, upload
50,000 B/s; CPU throttling rate 4. These are the exact
values Chromium DevTools sends for its "3G" preset
(devtools-frontend `Slow3GConditions`: download and
upload `500*1000/8*.8` = 50,000 B/s, latency `400*5` =
2,000 ms against a 400 ms target RTT), verified against
that source on 2026-11-28. The control leg applies no
emulation and native CPU. A milder second profile would
cost five more fresh browser starts carrying live remote
traffic per baseline; this protocol measures two legs.

## What is timed

The primary interval runs from HTTP navigation to the
settled picker paint: the route menu's reveal transitions
finished, a further paint done, the menu and its main
pane at full opacity, and the Choose a route button
hit-testable. A real touch on that button must then open
the populated route list; that proof runs after the
timestamp, so press dwell and list rendering stay
outside the measurement.

Splits reported per run, all observed from outside the
app (no app hook was added): response start/end
(navigation timing), first paint and first contentful
paint (paint timing), the boot tail stamp, the map boot
stamp, map ready (the first 100 ms observer poll where
the map reports live with tiles - poll-quantized, so it
carries up to 100 ms of quantization), the reveal, and
the phase split navigation -> boot tail -> map boot ->
reveal -> settled paint.

A run counts as a valid sample only when all three hold:
the cold shell and MapLibre really transferred through
Chromium (fresh shell bytes, uncached library script
and stylesheet, and on the throttled leg a shell
response end no earlier than the configured link allows
- bytes over throughput), the picker was reached after
map boot and the real touch opened the populated list,
and the boot completed without errors (no failed
requests, no page exceptions, no console errors). The
boot update probe is the one named exception: the app
aborts it itself at 1.5 s by design, so its abort is
recorded as evidence, never counted as a failure.

## What the numbers exclude

- The service worker: the first navigation is
  uncontrolled (asserted per run). The worker can
  install concurrently, but page-target CDP neither
  throttles nor counts the worker target's requests;
  an installed-app update measurement would be a
  separate instrument.
- Loopback substitutes for deployment hosting and
  origin TLS. Live remote resources are part of the
  measured path, so the numbers carry real-network
  variance - the alternating protocol exists to expose
  it, not hide it.
- Route loading and any map work still pending at the
  reveal are outside the interval. Whether the map was
  ready at the reveal is reported per run as evidence.

## The baseline

Measured 2026-11-28 on the maintainer's VM (Linux
7.0.0-44-generic x86_64, 1.5 shared CPUs, Chrome for
Testing 158.0.8127.18, load average 2.18 / 2.00 / 1.15
at the run's start) against Beta 1.304 (live index
sha256 a987ab44). Five alternating pairs; every run a
valid sample - 5 of 5 per leg, zero failed requests,
zero page exceptions, zero console errors. Medians in
ms, with the min-max spread beside them. The raw JSON
(baseline and diagnostic runs) is kept with the round
record.

Throttled leg (2,000 ms latency, 50,000 B/s each way,
CPU rate 4):

| milestone | median | spread |
| --- | --- | --- |
| response end | 15,167 | 15,162-15,175 |
| first contentful paint | 15,888 | 15,784-15,900 |
| boot tail | 15,573 | 15,518-15,591 |
| map boot | 18,222 | 18,167-18,251 |
| reveal | 21,710 | 21,693-24,265 |
| settled picker paint (primary) | 24,914 | 24,441-26,493 |
| map ready | 25,023 | 23,626-26,420 |

Map ready carries only 2 of 5 samples: in 3 throttled
runs the map had not reported ready by the settled
paint, and in 4 of 5 the reveal fired without map
readiness (no tile response completed before any
reveal). That is an observation about the readiness
gate, recorded here without a recommendation.

Control leg (no emulation, native CPU):

| milestone | median | spread |
| --- | --- | --- |
| response end | 95 | 26-126 |
| first contentful paint | 2,808 | 2,400-2,904 |
| boot tail | 2,547 | 2,272-2,766 |
| map boot | 4,426 | 4,291-4,554 |
| reveal | 8,899 | 8,618-9,248 |
| settled picker paint (primary) | 9,677 | 9,365-9,981 |
| map ready | 8,204 | 8,012-8,381 |

The limiter, from the runs: on the throttled leg it is
the emulated link itself. Navigation to boot tail is
15.5 s of the 24.9 s primary interval (62%) with a
73 ms spread across five runs - deterministic, not
noise. The arithmetic closes: about 690 KB crosses
before the picker settles, which is 13.8 s of pure
link time at 50,000 B/s, plus the 2 s initial latency,
against an observed shell response end of 15.2 s. A
separate V8 profiling run (picker 25,120 ms, in line
with the baseline) shows the main thread mostly idle
while it waits - no CPU hot spot explains the time.
On the control leg the same phase collapses to 2.5 s
and the longest phase becomes map boot to reveal
(about 4.4 s): there the limiter is this rig's CPU and
the map-readiness path, not the network.

The boot update probe aborted itself inside the
accounting window in 4 of 5 throttled runs - its
designed 1.5 s abort on a link where the probe's own
transfer needs about 10 s. Recorded as evidence of how
the boot behaves on a slow link, not as a defect.

## The budget

budget: null

No budget is proposed with the baseline. After Andrew
accepts a baseline-derived budget for the
navigation-to-picker interval, set `pickerBudgetMs` in
tests/browser/coldstart.mjs to that number; from then
on a single throttled run (the tool's default mode)
fails when a valid sample exceeds it.
