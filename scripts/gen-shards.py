#!/usr/bin/env python3
"""Shard list generator (Beta 1.136, maintainability programme E).

The four browser-test shard lists in .github/workflows/checks.yml are
GENERATED from the suite's single source - the ALL list in
tests/browser/run.mjs - partitioned by measured duration
(scripts/shard-durations.json, whose header records how and when the
numbers were measured). Hand-keeping the lists let them drift twice:
once a drive could fall out of every shard (the coverage guard in
scripts/check-shard-coverage.py exists because of that) and by 1.136
the duration balance had drifted to 359/133/289/245 s.

Partition rule (deterministic): longest-processing-time - drives sorted
by duration descending (ties by name), each assigned to the currently
lightest shard (ties to the lowest shard number); names are written
ascending inside each shard so the generated file diffs stably. A drive
with no measured duration gets the median of the measured set.

Usage:
    python3 scripts/gen-shards.py           rewrite checks.yml's lists
    python3 scripts/gen-shards.py --check   exit 1 if the lists differ
                                            from the generated partition

The coverage guard (scripts/check-shard-coverage.py, run in CI) stays
the tripwire: it proves whatever lists are in checks.yml partition ALL
exactly once, generated or not.
"""
import json
import re
import statistics
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WF = ROOT / ".github" / "workflows" / "checks.yml"
SHARDS = 4


def all_drives(root: Path = ROOT) -> list:
    src = (root / "tests" / "browser" / "run.mjs").read_text(encoding="utf-8")
    m = re.search(r"const ALL = \[([^\]]*)\]", src)
    assert m, "gen-shards: run.mjs carries no ALL list"
    return re.findall(r"'(drive\d+)'", m.group(1))


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
    return [s.split() for s in re.findall(r'drives:\s*"([^"]+)"', wf_text)]


def main() -> int:
    data = json.loads((ROOT / "scripts" / "shard-durations.json").read_text(encoding="utf-8"))
    durations = data["seconds"]
    names = all_drives()
    shards, totals, weight = partition(names, durations)
    wf_text = WF.read_text(encoding="utf-8")
    cur = current_lists(wf_text)
    if len(cur) != SHARDS:
        print(f"gen-shards: FAIL - expected {SHARDS} shard lists in checks.yml, found {len(cur)}")
        return 1
    if "--check" in sys.argv:
        if cur == shards:
            print("gen-shards --check: PASS (checks.yml == the generated partition)")
            return 0
        print("gen-shards --check: FAIL - checks.yml's shard lists differ from the generated partition")
        print("Run: python3 scripts/gen-shards.py")
        return 1
    it = iter(" ".join(s) for s in shards)
    new_text = re.sub(r'drives:\s*"[^"]+"', lambda m: 'drives: "' + next(it) + '"', wf_text)
    assert current_lists(new_text) == shards
    if new_text != wf_text:
        WF.write_text(new_text, encoding="utf-8")
    unmeasured = [n for n in names if n not in durations]
    print("gen-shards: shard lists " + ("rewritten" if new_text != wf_text else "already current")
          + f" - {len(names)} drives, totals " + "/".join(f"{t:.0f}s" for t in totals))
    if unmeasured:
        print(f"gen-shards: unmeasured drives at the median weight: {unmeasured}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
