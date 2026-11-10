#!/usr/bin/env python3
"""Tier selector for the checks workflow (test-suite restructure, 2026-11-09).

Reads the changed-file list for a run and decides the gate tier, per the
written map in tests/TIER-MAP.md whose operative table is tests/tier-map.json:

  Tier A  small visual/constant/copy change -> build-and-test + the core set
  Tier B  feature work -> build-and-test + the touched surface's drive family
  Tier C  deep mechanics (storage/restore/state machine, the test machinery
          itself, the offline contract) -> the full battery + offline-e2e

Quarantined drives (tests/quarantine.json) are removed from the A and B
sets: they do not gate the fast tiers until hardened. They still run at
Tier C and nightly.

Usage:
  select-tier.py --files changed.txt [--force A|B|C]
  select-tier.py --files changed.txt --github-output   (append to $GITHUB_OUTPUT)

Prints a JSON object {tier, drives, offline, reason} either way.
Precedence: C beats B beats A. No changed files -> Tier A (docs-only and
empty diffs still get build-and-test + the core set). An app-code path no
rule matches falls to the map's default (C): an unmapped surface gets the
full battery, never a free pass.
"""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load(name):
    return json.loads((ROOT / "tests" / name).read_text(encoding="utf-8"))


def match(path, entry):
    if entry.endswith("/"):
        return path.startswith(entry)
    return path == entry


def select(files, force=None):
    tmap = load("tier-map.json")
    quar = {q["drive"] for q in load("quarantine.json")["quarantined"]}
    if force:
        tier = force.upper()
        if tier == "FULL":
            tier = "C"
        reason = f"forced tier {tier} (workflow_dispatch input)"
        if tier == "A":
            drives = [d for d in tmap["tier_a_core"] if d not in quar]
            return tier, drives, False, reason
        if tier == "B":
            return tier, [], False, reason + " - no family named; core set runs"
        return "C", [], True, reason
    if not files:
        return "A", [d for d in tmap["tier_a_core"] if d not in quar], False, "no changed files"
    for f in files:
        if any(match(f, e) for e in tmap["tier_c_paths"]):
            return "C", [], True, f"deep path touched: {f}"
    fams = []
    for name, fam in tmap["families"].items():
        if any(match(f, e) for f in files for e in fam["paths"]):
            fams.append(name)
    if fams:
        drives = sorted({d for name in fams for d in tmap["families"][name]["drives"]} - quar)
        return "B", drives, False, "families touched: " + ", ".join(fams)
    if all(any(match(f, e) for e in tmap["tier_a_paths"]) or any(f.endswith(s) for s in tmap["tier_a_suffixes"]) for f in files):
        return "A", [d for d in tmap["tier_a_core"] if d not in quar], False, "visual/constant/copy paths only"
    other = [f for f in files if not any(match(f, e) for e in tmap["tier_a_paths"])]
    return tmap["default_tier_for_unmatched_app_code"], [], tmap["default_tier_for_unmatched_app_code"] == "C", f"unmatched app path(s): {', '.join(other[:4])}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--files", required=True)
    ap.add_argument("--force", default=None)
    ap.add_argument("--github-output", action="store_true")
    a = ap.parse_args()
    files = [l.strip() for l in Path(a.files).read_text(encoding="utf-8").splitlines() if l.strip()]
    tier, drives, offline, reason = select(files, a.force)
    if tier == "B" and not drives:
        tmap = load("tier-map.json")
        quar = {q["drive"] for q in load("quarantine.json")["quarantined"]}
        drives = [d for d in tmap["tier_a_core"] if d not in quar]
    print(json.dumps({"tier": tier, "drives": drives, "offline": offline, "reason": reason}))
    if a.github_output:
        import os
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as fh:
            fh.write(f"tier={tier}\n")
            fh.write(f"drives={' '.join(drives)}\n")
            fh.write(f"offline={'true' if offline else 'false'}\n")
            fh.write(f"reason={reason}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
