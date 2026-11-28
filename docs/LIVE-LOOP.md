# Post-ship live loop

After every ship, the live app - not the local build -
gets walked in a cold session, and the result is
recorded. The walk is `scripts/live-walk.mjs`; this
document is the procedure it serves.

## When it runs

After a pull request merges, once the shipper has
verified the merge (merged tree identical to the tested
head) and read the live page back (the DEVELOPMENT_RULES
§3 gate). The walk is the step after that read-back: the
read-back proves the served bytes, the walk proves the
served app actually boots and behaves on those bytes.

It is an event command run by the shipper, not a cron
and not a CI job: it fires on ships, and only on ships.

## How

```
node scripts/live-walk.mjs "Beta 1.304" <sha256> <out folder>
```

- The label is the exact rendered label of the shipped
  build (`#ver` on the live page), never a guess.
- The sha256 is the hash of the shipped `index.html`
  (the merged tree's copy - the same hash the shipper's
  live read-back compares).
- The out folder is the round's work folder; each run
  writes its own timestamped subfolder and never
  overwrites an earlier run.
- Set `CHROME_BIN` to the local Chromium, as for the
  drives. The walk resolves the browser the same way
  the test rigs do when it is unset.
- `--wait <seconds>` bounds how long the walk waits for
  the expected build to be served (default 300).
  `--url <url>` overrides the target (used to prove the
  walk can fail against a staged broken page).

What the walk does, in order:

1. **Waits for the expected build.** It re-reads the
   live page's bytes until both the sha256 and the
   label read out of them match the expected build.
   Pages deploys lag merges; a mismatch inside the wait
   is propagation, not failure. If the wait expires,
   the walk reports a TIMEOUT, exits 1, and never walks
   a stale page and calls it a pass.
2. **Opens the live page in a cold session** - a fresh
   browser profile: no cookies, storage, caches or
   service workers carried over. Nothing is signed in,
   nothing is written to the live app; the profile is
   discarded when the walk ends.
3. **Walks the first-run surfaces**: the splash, then
   the route menu's main pane, the route list, the
   create doors, the bundled city list and the manual
   city search, returning by the same doors. Taps are
   real touch input. At every stop it checks that the
   surface is visible, that no uncaught page error has
   occurred, and that the snow is running with frames
   advancing.
4. **Checks the rendered label** in the browser against
   the expected label, so a build the fetch-side wait
   accepted but the browser renders differently is
   still caught.

## Scope limit

A cold session has no cleans and no saved state, so it
cannot reach tab mode or any state that needs history.
The walk asserts the empty/first-run surface only -
that is the honest scope of this loop. Deeper states
stay with the drive battery: drive228 walks all 13
surfaces in the harness, and this loop is its live-site
sibling, not a replacement. The name-your-route pane is
also out of scope: it is reached only through the
create flow, and the walk installs no fixtures and
fabricates no draft against live services. Every run's
`coverage.md` restates these limits, so a clean partial
walk is never presented as full coverage.

## What a failure means

- **Timeout finding** (surface `live page`): the
  expected build was not served within the wait. Either
  the deploy is still propagating (re-run the walk
  later; do not re-ship) or the wrong build is live
  (that is a ship problem - escalate, do not walk on).
- **A surface, snow or label finding**: the live build
  misbehaves in a first-run state a real new visitor
  would hit. The finding names the surface, the step,
  what was expected and what was observed, carries a
  screenshot where one could be taken, and the walk
  stops at the first hard failure (snow findings are
  recorded and the walk continues). Treat it like a
  defect found minutes after shipping: grade it, and if
  it is real, it gets its own fix round - the loop never
  retries a ship and never modifies anything itself.
- **Exit codes**: 0 = the walk completed with no
  findings; 1 = findings or incomplete execution;
  2 = the walk was invoked wrong.

## Where the result is recorded

The run's subfolder holds `findings.json` (the full
record: expected and observed builds, every read of the
wait, the surfaces reached, the findings),
`report.md` (the chat-shaped summary - on a clean run
exactly one line: walked N surfaces, no findings, the
live label and sha), `coverage.md` (the scope limits),
screenshots for each finding, and a final screenshot of
the route menu. The shipper records the outcome in the
round's RECORD.md and carries `report.md` plus
`coverage.md` into the ship report.

## Transport note (this VM)

This machine's only network egress is a proxy that
intercepts TLS with its own certificate authority -
the one curl, Node and git are configured to trust and
Chromium cannot read. The walk therefore starts a
loopback relay that adds the proxy's authorization
(read from the process environment at run time, kept in
memory only) and tells Chromium to ignore certificate
errors on that path. The walk's integrity anchor is not
the certificate: it is the sha256 of the served bytes,
matched before the browser navigates, and the rendered
label, matched after. On a machine with direct egress
no relay starts and no certificate is ignored.
