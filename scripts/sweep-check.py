#!/usr/bin/env python3
"""Rule 1 as a tool (/correct Phase 2, round C5): the wording sweep.

AGENTS.md's Build Efficiency Rule 1 says: after ANY user-facing
wording change, grep the ENTIRE tests/ tree for every changed old
string before the first push. The rule was written because of the
Beta 1.223 dash sweep - and the class still produced gate fixes in
1.223 itself and the very next round: f881b76 re-pinned drive118,
drive136 and drive161 after the sweep missed their copies, 491fffa
re-pinned e2e-offline's E25 poll (its pre-sweep fragment never
matched and burned a full 420 s window), and c4e6fc7 re-pinned
drive188 at 1.225. A prose rule did not hold; this script is the
mechanical form.

Usage:
  python3 scripts/sweep-check.py <root> --strings <file> [--registry <path>]
  python3 scripts/sweep-check.py <root> --old <string> [--old <string> ...]

The strings file carries one OLD string per line (blank lines and
#-comments skipped) - the strings the round changed AWAY from. The
script searches:
  - every file under <root>/tests/ (drives, proofs, the offline e2e,
    the unit suites - the whole tree, not the family being edited);
  - the probe registry (default: the snow goal's fix-checks.json;
    --no-registry skips it, e.g. for historical-tree runs);
for each old string in its exact form, its backslash-escaped
JS string-literal form, and its regex-escaped form (the shapes it
takes inside the drives' literals and /.../ matchers). Every hit is
printed as string -> file:line and the exit code is 1: a hit is an
un-swept pin until it is accounted for. A registry path that does
not exist is an ERROR (exit 2), never a silent skip - --no-registry
is the deliberate exclusion.

Not every occurrence is a pin: check-NAME labels carry the words as
prose, and a negative pin (an includes() absence assertion) carries
the old string ON PURPOSE - it is the sweep's own guard form. Those
are adjudicated per run, never silently: --adjudicated <file> takes
lines of the form '<path>:<line> :: <string>' - one per occurrence,
created fresh by the round from the sweep's own hit list; excused
hits are printed as ADJUDICATED (with every other hit still
failing), so the judgment is visible wherever the sweep's output is
read. The file is a per-run input, not a standing allowlist -
nothing is excused by default, and the anchoring is per-occurrence
because a check-name line can carry a live matcher beside the label
(drive118's T9 line does exactly that); a mixed line the round
excuses is backstopped by the drive itself in the battery, which
fails if the matcher still bites.

Historical verdicts (2026-11-20, the /correct discipline): at
3da62fc (f881b76's parent) the strings 'finish stopped', 'recovery
backup' and '— protected' FAIL, naming drive118, drive136 and
drive161; at f881b76 the string 'stopped at the' FAILS naming
e2e-offline; at 491fffa the biting pins are gone - the six
surviving occurrences are check-name labels and one negative pin,
and with exactly those adjudicated the sweep PASSes.
"""
import argparse
import sys
from pathlib import Path

DEFAULT_REGISTRY = "/home/hatch/workspace/goals/snow-route-5w-tracker-rebuild/hidden_files/fix-checks.json"
SKIP_DIRS = {".git", "node_modules", "__pycache__"}


def variants(s):
    """The forms an old string takes in the tests: exact, the
    backslash-escaped JS string-literal form, and the regex-escaped
    form (drives pin wording inside /.../ literals - 'not saving
    (sides)' is asserted as /not saving \\(sides\\)/; Codex P2 on
    PR #147)."""
    esc = s.replace("\\", "\\\\").replace("'", "\\'").replace('"', '\\"')
    # Regex-escaped the way a JS /.../ literal writes it: backslash
    # before each metacharacter, spaces and quotes untouched (Python's
    # re.escape also escapes spaces, which no drive does).
    resc = "".join("\\" + c if c in "\\.^$*+?()[]{}|" else c for c in s)
    return {s, esc, resc}


def iter_files(root):
    for dirpath, dirnames, filenames in __import__("os").walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for name in sorted(filenames):
            yield Path(dirpath) / name


def search_file(path, needles):
    """Yield (needle, lineno) for every needle found in the file."""
    try:
        text = path.read_text(encoding="utf-8", errors="surrogateescape")
    except OSError:
        return
    for lineno, line in enumerate(text.splitlines(), 1):
        for needle in needles:
            if needle in line:
                yield needle, lineno


def main():
    ap = argparse.ArgumentParser(description="The wording sweep, mechanical form")
    ap.add_argument("root", type=Path)
    ap.add_argument("--old", dest="strings", action="append", default=[],
                    help="an old string, given directly (repeatable)")
    ap.add_argument("--strings", dest="strings_file", type=Path,
                    help="file with one old string per line")
    ap.add_argument("--registry", type=Path, default=Path(DEFAULT_REGISTRY))
    ap.add_argument("--no-registry", action="store_true")
    ap.add_argument("--adjudicated", type=Path,
                    help="per-run file of '<path>:<line> :: <string>' lines excusing judged non-pin occurrences (printed, never silent)")
    args = ap.parse_args()
    root = args.root.resolve()

    olds = list(args.strings)
    if args.strings_file:
        for line in args.strings_file.read_text(encoding="utf-8").splitlines():
            line = line.rstrip("\n")
            if line.strip() and not line.lstrip().startswith("#"):
                olds.append(line)
    olds = [s for s in olds if s]
    if not olds:
        print("SWEEP ERROR: no old strings given - a sweep with no input proves nothing")
        return 2

    needles = {}
    for s in olds:
        for v in variants(s):
            needles.setdefault(v, s)

    hits = []
    files = list(iter_files(root / "tests"))
    for f in files:
        rel = f.relative_to(root).as_posix()
        for needle, lineno in search_file(f, needles):
            hits.append((needles[needle], rel, lineno))
    registry_searched = False
    if not args.no_registry:
        if not args.registry.is_file():
            print(f"SWEEP ERROR: registry not found at {args.registry} - the sweep "
                  "includes the probe registry by design; pass --no-registry to "
                  "exclude it deliberately (Codex P2 on PR #147: a missing registry "
                  "must never pass silently as a clean sweep)")
            return 2
        registry_searched = True
        for needle, lineno in search_file(args.registry, needles):
            hits.append((needles[needle], str(args.registry), lineno))

    excused = set()
    if args.adjudicated:
        for line in args.adjudicated.read_text(encoding="utf-8").splitlines():
            if "::" in line and line.strip() and not line.lstrip().startswith("#"):
                loc, s = line.split("::", 1)
                path, _, lineno = loc.strip().rpartition(":")
                excused.add((path.strip(), int(lineno), s.strip()))
    adjudicated, live = [], []
    for hit in hits:
        s, rel, lineno = hit
        if (rel, lineno, s) in excused:
            adjudicated.append(hit)
        else:
            live.append(hit)

    scope = f"{len(files)} test files" + (" + the probe registry" if registry_searched else "")
    for s, rel, lineno in adjudicated:
        print(f"  ADJICATED (not a pin): {s!r} -> {rel}:{lineno}")
    if live:
        print(f"SWEEP INCOMPLETE: {len(live)} un-swept pin(s) across {scope}:")
        for s, rel, lineno in live:
            print(f"  {s!r} -> {rel}:{lineno}")
        return 1
    print(f"SWEEP CLEAN: none of {len(olds)} old string(s) survives unadjudicated in {scope}"
          + (f" ({len(adjudicated)} occurrence(s) adjudicated not-a-pin)" if adjudicated else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
