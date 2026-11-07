#!/usr/bin/env python3
"""Release bookkeeping generator (Beta 1.133, maintainability programme C).

The single source of truth for the battery counts quoted in README.md.
Before this script existed the counts were typed into the README by hand
and reconciled by hand after the fact — they drifted (the Beta 1.125
direct ship also left the What's New entry stale until a registry probe,
not the build, noticed). Now the counts are DERIVED from the suite
itself, and scripts/build-pages.py asserts this derivation on every
build, so a stale count fails the build instead of shipping quietly.

What the derived numbers mean — the counting rule (the ONLY definition):
  * drives      = the number of names in the ALL list of
                  tests/browser/run.mjs (the suite's own roster).
  * drive checks = the assertion call sites of the suite: for every
                  drive file in ALL, the lines' calls to ok( or okS(,
                  excluding the lines that DEFINE those helpers
                  (`const ok = ...` / `const okS = ...`). Two drives
                  (117, 119) wrap ok in a strict okS; the wrapper's own
                  definition line is not a check.
  * e2e checks  = the same rule over tests/browser/e2e-offline.mjs.
  * sw checks   = the same rule over tests/sw.test.mjs, whose helper
                  is named check(.
A call site is one written assertion. A drive may execute a site more
than once (a loop) or not at all on a given run (a branch), so a derived
count is the suite's written size — reproducible anywhere in seconds,
which is exactly what a README number should be. Runtime pass counts
live in the CI run records, not in prose.

Usage:
    python3 scripts/release.py             derive + rewrite the README
                                           count lines, then print the
                                           release checklist
    python3 scripts/release.py --check     derive only; exit 1 if the
                                           README disagrees (used by
                                           scripts/build-pages.py)
    python3 scripts/release.py --checklist print the checklist only

The checklist separates GENERATED steps (this script + the build) from
EDITORIAL ones: the CHANGELOG entry and the What's New prose are
written by a human on purpose — they are the release's own words.
Standard library only; no dependencies.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BROWSER = ROOT / "tests" / "browser"
README = ROOT / "README.md"

DEF_LINE = re.compile(r"\s*const\s+(ok|okS|check)\s*=")


def _count_sites(path: Path, helpers: tuple) -> int:
    total = 0
    pats = [re.compile(r"(?<![\w.])" + h + r"\(") for h in helpers]
    for line in path.read_text(encoding="utf-8").split("\n"):
        if DEF_LINE.match(line):
            continue
        total += sum(len(p.findall(line)) for p in pats)
    return total


def suite_counts(root: Path = ROOT) -> dict:
    """Derive the battery counts from the suite (see module docstring)."""
    browser = root / "tests" / "browser"
    run_mjs = (browser / "run.mjs").read_text(encoding="utf-8")
    m = re.search(r"const ALL = \[([^\]]*)\]", run_mjs)
    assert m, "release: run.mjs carries no ALL list"
    names = re.findall(r"'([^']+)'", m.group(1))
    assert names, "release: run.mjs ALL list is empty"
    drives = len(names)
    drive_checks = sum(
        _count_sites(browser / (n + ".mjs"), ("ok", "okS")) for n in names
    )
    e2e_checks = _count_sites(browser / "e2e-offline.mjs", ("ok", "okS"))
    sw_checks = _count_sites(root / "tests" / "sw.test.mjs", ("check",))
    return {
        "drives": drives,
        "drive_checks": drive_checks,
        "e2e_checks": e2e_checks,
        "sw_checks": sw_checks,
    }


def _expected_lines(counts: dict) -> dict:
    """The README lines this generator owns, keyed by a stable anchor."""
    return {
        "sw": (
            "| `tests/sw.test.mjs` | Service worker fetch-strategy tests "
            "(Node, mocked caches/fetch) — %d checks. |" % counts["sw_checks"]
        ),
        "browser": (
            "| `tests/browser/` | The deterministic browser drive battery "
            "(%d drives, %d checks) plus the offline end-to-end suite "
            "(%d checks) — see `docs/TESTING.md`. |"
            % (counts["drives"], counts["drive_checks"], counts["e2e_checks"])
        ),
    }


def readme_problems(readme_text: str, counts: dict) -> list:
    """[] when the README carries exactly the derived lines, else problems."""
    problems = []
    for key, line in _expected_lines(counts).items():
        anchor = "tests/sw.test.mjs" if key == "sw" else "tests/browser/`"
        rows = [ln for ln in readme_text.split("\n") if anchor in ln and ln.startswith("|")]
        if len(rows) != 1:
            problems.append(f"README: expected exactly one {anchor} table row, found {len(rows)}")
        elif rows[0] != line:
            problems.append(
                f"README: the {anchor} row is stale.\n  found:    {rows[0]}\n  expected: {line}"
            )
    return problems


def sync_readme(counts: dict) -> bool:
    """Rewrite the owned README rows to the derived lines. True if changed."""
    text = README.read_text(encoding="utf-8")
    lines = text.split("\n")
    expected = _expected_lines(counts)
    changed = False
    for i, ln in enumerate(lines):
        if ln.startswith("|") and "tests/sw.test.mjs" in ln and lines[i] != expected["sw"]:
            lines[i] = expected["sw"]; changed = True
        elif ln.startswith("|") and "tests/browser/`" in ln and lines[i] != expected["browser"]:
            lines[i] = expected["browser"]; changed = True
    problems = readme_problems("\n".join(lines), counts)
    assert not problems, "release: README sync failed: " + "; ".join(problems)
    if changed:
        README.write_text("\n".join(lines), encoding="utf-8")
    return changed


CHECKLIST = """\
RELEASE CHECKLIST (Beta 1.133 — generated vs editorial, kept apart)

GENERATED — machines own these; never type them by hand:
  [ ] python3 scripts/release.py          (README battery counts derived
                                           from the suite and rewritten)
  [ ] python3 scripts/assemble.py         (parts/ -> src/tracker-source.html;
                                           the splash icon bytes are inlined
                                           from icon-512.png here)
  [ ] python3 scripts/build-pages.py      (build + gates: assembly, parity,
                                           CSP, SEC-10a, version ==
                                           CHANGELOG top, WHATSNEW.v ==
                                           displayed version, README counts
                                           == this script's derivation)

EDITORIAL — a human writes these, on purpose:
  [ ] CHANGELOG.md: the new top entry (## Beta X.Y — date) describing the
      release in plain words.
  [ ] parts/app4.js: WHATSNEW replaced with this release's entry (latest
      only — it never accumulates; the build fails if its version is stale).
  [ ] parts/head.html: the #ver label set to the same Beta X.Y.
  [ ] The fix-checks registry: this release's version probes rolled
      (changelog-top / version-label / whatsnew-latest / no-older-entries).

THEN the standing gates: branch battery on touched surfaces, Codex verify
CONFIRMED, merge gate (merged tree == tested tree), live read-back.
"""


def main() -> int:
    counts = suite_counts()
    if "--checklist" in sys.argv:
        print(CHECKLIST)
        return 0
    if "--check" in sys.argv:
        problems = readme_problems(README.read_text(encoding="utf-8"), counts)
        if problems:
            print("release --check: FAIL")
            for p in problems:
                print(" " + p)
            print("Run: python3 scripts/release.py  (it derives and rewrites them)")
            return 1
        print(
            "release --check: PASS (README counts == derived: "
            f"{counts['drives']} drives, {counts['drive_checks']} drive checks, "
            f"{counts['e2e_checks']} e2e checks, {counts['sw_checks']} sw checks)"
        )
        return 0
    changed = sync_readme(counts)
    print(
        "release: README counts "
        + ("rewritten to" if changed else "already match")
        + f" the derivation: {counts['drives']} drives, "
        f"{counts['drive_checks']} drive checks, {counts['e2e_checks']} e2e "
        f"checks, {counts['sw_checks']} sw checks"
    )
    print()
    print(CHECKLIST)
    return 0


if __name__ == "__main__":
    sys.exit(main())
