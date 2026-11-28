# Snapshot-first menus

The guarantee (approved by Andrew 2026-11-26): a menu paints at once
from the snapshot already on the device. It never waits for the
network, a download, or the map. Display data may be optimistic; the
clean record never is. No menu fetches data earlier to freshen its
snapshot, and nothing here preloads speculatively.

## The wait that was removed

The boot route picker sat behind the splash IIFE's readiness gate in
parts/create-save.js: a 120 ms poll armed the picker only when the
MapLibre style had loaded (`glOk`, set on the map's 'load' event) AND
the first basemap tile had been parsed (`tilesOk` > 0) - or when six
seconds had elapsed since the IIFE started. The picker data itself
was never the wait: the rows are on-device (the shipped packs plus
the synchronous legacy merge at eval), and the pick path already
guarded every map call. The six-second escape is why GF1's baseline
could record the reveal firing without map readiness in 4 of 5
throttled runs: on that leg the escape armed the picker, not
readiness. The gate and GF1's observation were the same fact from
two sides.

Beta 1.305 removes the gate. The picker arms on its own intro floor
alone (2,700 ms; 1,900 ms under reduced motion), and the poll
survives only as the forced boot-tail backstop at four seconds. A
pick made before the boot tail has run runs the tail first, so the
route lands whole. drive233 proves the guarantee in a world where
every request fails: the picker arms at the floor with `glOk` still
false and no tile parsed, the list's first render carries the
on-device route, a pick loads it with no map, and Settings paints
the saved backup age.

## Surface states

- Boot route picker: WAITED on map readiness. Fixed in Beta 1.305.
- Boot route list pane: paints synchronously from ROUTE_PACKS on the
  Choose tap; its only wait was the picker's gate, now removed.
- Routes tab menu and list: compliant. Renders synchronously from
  live local state on entry.
- Return-to-picker: compliant. Re-enters the boot picker directly,
  no gate.
- Create doors and manual search entry: compliant. The pane paints
  on entry; the typeahead's online lookup is a user-initiated
  search, not menu paint.
- Create city catalogue: NAMED GAP. The stage paints a loading row,
  then waits on the bundled catalogue index; the catalogue promise
  is session-memory only, so no on-device snapshot exists on a cold
  boot. Closing this gap needs a persisted catalogue snapshot - a
  data-source change, not an ordering fix.
- Create street selection after a city pick: NAMED GAP, same root.
  The stage paints at once, but the street choices wait on resolving
  the picked city against the catalogue (bounded at eight seconds),
  because choices rendered against the wrong dataset would be
  display data that lies.
- Settings, all panes: compliant. Every pane paints from local
  state on entry; Status opens before its local census finishes,
  and the backup age comes from the saved export stamp.
- Streets sheet and Pace sheet: compliant. Both render from live
  local route and clean state in the opening handler.
- The map behind the menus: waits for its tiles, as it must; it is
  outside the menu rule and unchanged.

## Measured effect (GF1 protocol, this rig)

Cold-start A/B against the GF1 baseline (docs/COLD-START-BASELINE.md):
five alternating throttled/control pairs per side, fresh profile per
run, zero failed requests, exceptions or console errors on either
side. The sides ran in separate sessions under the identical
protocol; the pre-gate segments (response end, boot tail, first
paint) match across sessions, which corroborates comparable
conditions. Settled picker paint, medians: throttled 24,914 ms
(24,441-26,493) before, 21,180 ms (20,886-21,440) after; control
9,677 ms (9,365-9,981) before, 6,217 ms (5,964-7,815) after. The
spreads do not overlap on either leg: faster, by about 3.7 s
throttled and 3.5 s control. The gain sits entirely after the boot
tail - the readiness wait that used to follow the intro floor. The
picker now settles before the map is ready on both legs (map ready
was 25,023 ms throttled and 8,204 ms control in the baseline, and
falls outside the measurement window now). This is a yardstick on
the maintainer rig, not a phone claim. The budget stays null: it is
Andrew's call, on this evidence and GF3's.

## Hazard note (recorded, not fixed here)

renderRouteLists replaces all row and dropdown nodes wholesale,
even for identical IDs and order, and the IndexedDB pack load calls
it with the list open - a tap in flight can lose its target or land
on a replaced node. Picks resolve by route ID, never by index, so a
landed tap still loads the route the user sees. No gesture-level
pin exists yet.

## Merge semantics (restated, untouched)

The #172 backup merge is unchanged: packs absent from the device
are added; packs present in both stay current; a backup never
deletes or overwrites a pack; a restore does not replace the open
list in place.
