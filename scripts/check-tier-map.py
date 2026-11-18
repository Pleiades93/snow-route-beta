#!/usr/bin/env python3
"""Tier-map coverage guard (protocol fix round, 2026-11-17).

Extends the shard-coverage guard's idea to the tier map itself. The
2026-11-17 protocol audit found the session family naming two drives
that no longer exist (drive201/drive202, deleted with the icon-pack
picker in Beta 1.221) and the JSON/MD pair disagreeing about drive203 -
and nothing checked either. This guard proves, on every build-and-test:

  1. Every drive named in tests/tier-map.json (the core set and every
     family) exists as tests/browser/<drive>.mjs AND is in the runner's
     ALL list (tests/browser/run.mjs) - a roster entry that cannot run
     is a broken gate, not a rounding error.
  2. The family rosters in tests/tier-map.json and tests/TIER-MAP.md
     agree exactly, family by family, and so do the two core sets -
     the pair is kept in step by machine, not by intention.
  3. Every quarantined drive (tests/quarantine.json) names a real drive.

Exits 0 on PASS, 1 on any mismatch. Run from the repo root; an optional
argv[1] names another root (the verdict fixtures in
scripts/gate-fixtures/ run this guard against synthetic trees).
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent
errors = []


def load_json(rel):
    return json.loads((ROOT / rel).read_text(encoding="utf-8"))


tmap = load_json("tests/tier-map.json")
quar = load_json("tests/quarantine.json")

run_src = (ROOT / "tests/browser/run.mjs").read_text(encoding="utf-8")
m = re.search(r"const ALL = \[([^\]]*)\]", run_src)
if not m:
    print("FAIL: could not find const ALL in tests/browser/run.mjs")
    sys.exit(1)
ALL = set(re.findall(r"'(drive\d+)'", m.group(1)))


def drive_file(d):
    return (ROOT / "tests" / "browser" / f"{d}.mjs").exists()


# 1. Every roster entry names a runnable drive.
rosters = {"tier_a_core": tmap["tier_a_core"]}
for name, fam in tmap["families"].items():
    rosters[f"family:{name}"] = fam["drives"]
for label, drives in rosters.items():
    for d in drives:
        if not drive_file(d):
            errors.append(f"{label}: {d} has no file tests/browser/{d}.mjs")
        elif d not in ALL:
            errors.append(f"{label}: {d} exists but is not in run.mjs ALL")

# 3. Quarantine entries name real drives.
for q in quar["quarantined"]:
    if not drive_file(q["drive"]):
        errors.append(f"quarantine: {q['drive']} has no file tests/browser/{q['drive']}.mjs")

# 2. The JSON/MD pair agrees.
md = (ROOT / "tests" / "TIER-MAP.md").read_text(encoding="utf-8")
md_families = {}
for line in md.splitlines():
    row = re.match(r"\|\s*(create|map|session)\s*\|", line)
    if row:
        cells = [c.strip() for c in line.split("|")]
        nums = re.findall(r"\d+", cells[3]) if len(cells) > 3 else []
        md_families[row.group(1)] = sorted(f"drive{n}" for n in nums)
for name, fam in tmap["families"].items():
    want = sorted(fam["drives"])
    got = md_families.get(name)
    if got is None:
        errors.append(f"TIER-MAP.md: no table row found for family {name}")
    elif got != want:
        errors.append(
            f"family {name}: tier-map.json {want} != TIER-MAP.md {got}")

core_span = None
for span in re.findall(r"`([^`]+)`", md):
    toks = span.split()
    if len(toks) >= 5 and all(re.fullmatch(r"drive\d+", t) for t in toks):
        core_span = sorted(toks)
        break
if core_span is None:
    errors.append("TIER-MAP.md: could not find the core-set drive list")
elif core_span != sorted(tmap["tier_a_core"]):
    errors.append(
        f"tier_a_core: tier-map.json {sorted(tmap['tier_a_core'])} != TIER-MAP.md {core_span}")

if errors:
    for e in errors:
        print("FAIL:", e)
    sys.exit(1)
total = sum(len(v) for v in rosters.values())
print(f"tier-map coverage: PASS ({total} roster entries across core + "
      f"{len(tmap['families'])} families, all runnable; JSON/MD pair in step)")
