#!/usr/bin/env python3
"""Shard partition - the Python statement of the rule (Beta 1.136;
runtime form since the testing-efficiency rollout, 2026-11-23).

Through Beta 1.281 this script GENERATED the eight shard lists pasted
into .github/workflows/checks.yml from the ALL list in
tests/browser/run.mjs + the measured durations in
scripts/shard-durations.json. Hand-keeping those lists let them drift
twice: once a drive could fall out of every shard (the coverage guard
exists because of that) and by 1.136 the balance had drifted to
359/133/289/245 s.

Since the rollout the lists are gone from checks.yml: each shard job
runs `node tests/browser/run.mjs --shard N`, and the runner computes
its share at runtime from shard-durations.json using the partition
rule stated here. This module remains the rule's reference statement -
scripts/check-shard-coverage.py imports all_drives()/partition() and
proves the runner's runtime partition agrees with them shard for
shard, that the partition covers the roster exactly once, and that
the durations file names exactly the roster.

Partition rule (deterministic): longest-processing-time - drives
sorted by duration descending (ties by name), each assigned to the
currently lightest shard (ties to the lowest shard number); names are
written ascending inside each shard. A drive with no measured duration
gets the median of the measured set.

Usage:
    python3 scripts/gen-shards.py           print the partition + totals
    python3 scripts/gen-shards.py --check   exit 1 if the durations file
                                            does not name exactly the
                                            roster, or the partition
                                            does not cover it exactly
                                            once (the full agreement
                                            proof against the runner is
                                            check-shard-coverage.py)
"""
import json
import re
import statistics
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SHARDS = 8  # test-suite restructure (2026-11-09): eight shards


def all_drives(root: Path = ROOT) -> list:
    """The roster: every drive*.mjs file in tests/browser/ - the same
    glob run.mjs computes its roster from (testing-efficiency rollout,
    2026-11-23; the hand-kept ALL array this replaces is gone)."""
    names = []
    for p in (root / "tests" / "browser").glob("drive*.mjs"):
        stem = p.name[:-4]
        if re.fullmatch(r"drive\d+", stem):
            names.append(stem)
    return sorted(names, key=lambda n: int(n[5:]))


def partition(names: list, durations: dict) -> list:
    known = [durations[n] for n in names if n in durations]
    fallback = statistics.median(known) if known else 10.0
    weight = {n: durations.get(n, fallback) for n in names}
    order = sorted(names, key=lambda n: (-weight[n], n))
    shards = [[] for _ in range(SHARDS)]
    totals = [0.0] * SHARDS
    for n in order:
        i = min(range(SHARDS), key=lambda k: (totals[k], k))
        shards[i].append(n)
        totals[i] += weight[n]
    return [sorted(s) for s in shards], totals, weight


def current_lists(wf_text: str) -> list:
    # Kept for scripts/check-mirrors.py, whose shards family reads any
    # shard lists a tree still carries (a tree with none is skipped
    # there). Since the rollout, checks.yml carries none.
    return [s.split() for s in re.findall(r'drives:\s*"([^"]+)"', wf_text)]


def main() -> int:
    data = json.loads((ROOT / "scripts" / "shard-durations.json").read_text(encoding="utf-8"))
    durations = data["seconds"]
    names = all_drives()
    shards, totals, weight = partition(names, durations)
    if "--check" in sys.argv:
        problems = []
        extra = sorted(set(durations) - set(names))
        missing = sorted(set(names) - set(durations))
        if extra:
            problems.append(f"durations name drives not in the roster: {extra}")
        if missing:
            problems.append(f"roster drives with no durations entry: {missing}")
        flat = [n for s in shards for n in s]
        if sorted(flat) != sorted(names) or len(flat) != len(set(flat)):
            problems.append("the partition does not cover the roster exactly once")
        if problems:
            for p in problems:
                print("gen-shards --check: FAIL -", p)
            return 1
        print(f"gen-shards --check: PASS ({len(names)} drives, durations name exactly the roster, "
              f"partition covers it exactly once; totals " + "/".join(f"{t:.0f}s" for t in totals) + ")")
        return 0
    for i, s in enumerate(shards, 1):
        print(f"shard {i} ({totals[i-1]:.0f}s): " + " ".join(s))
    unmeasured = data.get("unmeasured", [])
    if unmeasured:
        print(f"gen-shards: {len(unmeasured)} drives carry placeholder (median) weights, not measurements: {unmeasured}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
