#!/usr/bin/env python3
"""The one local release operation (architecture #22, 2026-11-23).

Before this script existed, the build half of a release was a hand-run
chain — release.py, then assemble.py, then build-pages.py, then the
three --check forms re-run by hand as verification — and every round
re-performed the sequence from the checklist's prose. The push half of
the release had already been given one owner (scripts/push.py, Phase 2
C2+C8); the build half had not. This operation owns it end to end:

    counts -> assembly -> stamping -> artifacts -> verification

  1. counts       scripts/release.py's derivation: the README battery
                  counts are derived from the suite and rewritten if
                  stale (release.suite_counts + release.sync_readme).
  2. assembly     scripts/assemble.py's build: parts/ concatenated
                  into src/tracker-source.html, splash bytes and the
                  CHANGELOG release stamp inlined.
  3. stamping +   scripts/build-pages.py's main: the CSP stamp applied,
     artifacts    index.html + sw.js written, and its own verification
                  battery run (assembly, parity, CSP, SEC-10a, version,
                  WHATSNEW, README counts).
  4. verification the three --check forms (assemble, release,
                  build-pages) re-run as INDEPENDENT subprocesses —
                  the same commands CI and push.py judge by — and the
                  artifact sha256 set printed.

No step is reimplemented here: the operation calls the existing
owners' functions (build-pages.py is loaded by path, the pattern
check-shard-coverage.py established for gen-shards.py), so the chain
cannot drift from the scripts it replaces. Any step failing stops the
operation with that step's own output and a nonzero exit.

Usage:
    python3 scripts/release-op.py                the full operation
    python3 scripts/release-op.py --verify-only  stage 4 only (the
                                                 three --check forms +
                                                 artifact hashes)

The editorial half of a release stays human, on purpose (release.py's
checklist keeps the list): the CHANGELOG entry, the What's New prose.
Standard library only; no dependencies.
"""
import hashlib
import importlib.util
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent

import assemble  # noqa: E402  (scripts/ is sys.path[0] when run directly)
import release  # noqa: E402


def _load_build_pages():
    spec = importlib.util.spec_from_file_location(
        "snow_build_pages", HERE / "build-pages.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def stage_counts() -> None:
    counts = release.suite_counts()
    changed = release.sync_readme(counts)
    print(
        "release-op [1/4 counts]: README counts "
        + ("rewritten to" if changed else "already match")
        + f" the derivation: {counts['drives']} drives, "
        f"{counts['drive_checks']} drive checks, {counts['e2e_checks']} "
        f"e2e checks, {counts['sw_checks']} sw checks")


def stage_assembly() -> None:
    data = assemble.build()
    assemble.OUT.write_bytes(data)
    print(
        f"release-op [2/4 assembly]: wrote "
        f"{assemble.OUT.relative_to(ROOT)} ({len(data)} bytes, "
        f"sha256 {hashlib.sha256(data).hexdigest()[:12]}...)")


def stage_build() -> None:
    bp = _load_build_pages()
    argv, sys.argv = sys.argv, ["build-pages.py"]
    try:
        rc = bp.main()
    finally:
        sys.argv = argv
    if rc != 0:
        raise SystemExit("release-op: build-pages failed (see above)")
    print("release-op [3/4 stamping + artifacts]: index.html + sw.js "
          "written; build-pages verification battery passed")


def stage_verify() -> None:
    for script in ("assemble.py", "release.py", "build-pages.py"):
        proc = subprocess.run(
            [sys.executable, str(HERE / script), "--check"],
            capture_output=True, text=True)
        if proc.returncode != 0:
            print(proc.stdout, end="")
            print(proc.stderr, end="", file=sys.stderr)
            raise SystemExit(
                f"release-op: verification failed at {script} --check")
        print(f"release-op [4/4 verification]: {script} --check PASS")
    print("release-op: artifacts")
    for rel in ("src/tracker-source.html", "index.html", "sw.js"):
        print(f"  {rel}: sha256 {_sha(ROOT / rel)}")


def main() -> int:
    if "--verify-only" in sys.argv[1:]:
        stage_verify()
        return 0
    stage_counts()
    stage_assembly()
    stage_build()
    stage_verify()
    print("release-op: DONE (counts -> assembly -> stamping -> "
          "artifacts -> verification, all in one operation)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
