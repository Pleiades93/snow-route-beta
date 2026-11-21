#!/usr/bin/env python3
"""Tier selector fixtures (PR #23 gate; Beta 1.185; extended 2026-11-17,
protocol fix round).

Per the test-change gate (judging logic ships with fixtures), the tier
selector's pass/fail-relevant behaviour is proven against the case shapes
from the 2026-11-13 PR #23 assessment. The bug: a change touching a family
file plus an app file no rule recognizes classified Tier B (family drives
only), escaping tests/tier-map.json's default_tier_for_unmatched_app_code
(C - an unmapped surface gets the full battery, never a free pass). The
pre-fix selector reaches the C default only when NO family matched; the
family+unknown mix fell into the family branch first. The fix checks every
app file against all known paths (families, tier-A paths and suffixes)
before the family branch. These fixtures pin the mix AND the pure shapes
around it, so the stricter classification cannot silently widen or narrow.

The 2026-11-17 extension pins the protocol fix round's selector changes
with COMPLETE drive-set assertions (not membership): Tier B unions the
core set (protocol section 3, "B = core + family"); a touched drive
always runs, quarantined or not; parts/head.html and parts/brand-snow.js
are no longer Tier A paths; parts/pmstyles.js is a generated output and
never classifies; proof files (tests/proof/**) ride along like drive
files and never escalate a round.

The 2026-11-21 extension pins the mutation receipts file
(tests/mutation-receipts.json, /correct Phase 3 round (b)) to the
same ride-along rule: it is bookkeeping that must accompany every
check change, so if it classified, every tested change would fall
to the unmatched default (Tier C) - Codex P2 on PR #155.

The second 2026-11-21 extension pins the sibling census file
(tests/sibling-census.json, /correct Phase 3 round (c)) to the
same rule, named in its own round rather than left for a gate
to find: it is bookkeeping that must accompany every parts
change.

Run: python3 scripts/select-tier-fixtures/run-fixtures.py
Exit 0 = every case matched its expected (tier, full-battery, drives).
"""
import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
spec = importlib.util.spec_from_file_location("select_tier", ROOT / "scripts" / "select-tier.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

# The expected sets are DERIVED from tests/tier-map.json (+ quarantine),
# never hand-listed (/correct Phase 3 round (a), closing the C1 fixture
# form): through 1.259 these were hand-maintained copies (MAP19 -> MAP20,
# SESSION26 -> ... -> SESSION31), and every drive-adding round rolled them
# by hand, each roll discovered at the gate. The roster's truth lives in
# tier-map.json - check-tier-map guards its completeness against the
# disk - and these fixtures grade the SELECTOR's set algebra (family +
# core, quarantine removed) against an independent derivation from that
# same source. A new drive joins a family in tier-map.json and the
# expected set follows with no fixture edit.
import json
_tmap = json.loads((ROOT / "tests" / "tier-map.json").read_text())
_quar = {q["drive"] for q in json.loads((ROOT / "tests" / "quarantine.json").read_text())["quarantined"]}
CORE = sorted(set(_tmap["tier_a_core"]) - _quar)
def _family(name):
    return sorted((set(_tmap["families"][name]["drives"]) | set(_tmap["tier_a_core"])) - _quar)
MAP = _family("map")
SESSION = _family("session")

# (label, files, expected tier, expected full-battery flag, expected drives check or None)
# want_drive: a drive name = membership; [] = the set must be empty; None = unchecked.
CASES = [
    ("family + unrecognized app file falls to the map default (THE FIX)",
     ["parts/engine.js", "parts/mystery.js"], "C", True, []),
    ("create family + unrecognized app file also falls to the default",
     ["parts/create-packs.js", "parts/brand-new.js"], "C", True, []),
    ("pure family change stays Tier B with the family drives",
     ["parts/engine.js"], "B", False, "drive127"),
    ("family + known tier-A path stays Tier B (both known)",
     ["parts/engine.js", "CHANGELOG.md"], "B", False, "drive127"),
    ("pure tier-A change stays Tier A",
     ["CHANGELOG.md"], "A", False, None),
    ("deep path stays Tier C",
     ["parts/app1.js"], "C", True, []),
    ("the selector's own machinery stays Tier C",
     ["scripts/select-tier.py"], "C", True, []),
    ("a drive file alone rides Tier B (amendment clause 1)",
     ["tests/browser/drive161.mjs"], "B", False, "drive161"),
    ("empty diff stays Tier A",
     [], "A", False, None),
    ("head.html is no longer Tier A - page structure + global styles hit the default",
     ["parts/head.html"], "C", True, []),
    ("brand-snow.js is no longer Tier A - a running program, not a style",
     ["parts/brand-snow.js"], "C", True, []),
    ("family + head.html now falls to the default (head.html is unmapped)",
     ["parts/engine.js", "parts/head.html"], "C", True, []),
    ("pmstyles.js is a generated output and never classifies",
     ["parts/pmstyles.js"], "A", False, None),
    ("a proof file alone rides along at Tier A (never escalates)",
     ["tests/proof/proof-1228.mjs"], "A", False, None),
    ("the proof manifest alone rides along at Tier A",
     ["tests/proof/manifest.json"], "A", False, None),
    ("the mutation receipts file alone rides along at Tier A (bookkeeping never escalates)",
     ["tests/mutation-receipts.json"], "A", False, None),
    ("a proof file plus its mutation receipt stays Tier A",
     ["tests/proof/proof-1228.mjs", "tests/mutation-receipts.json"], "A", False, None),
    ("the sibling census file alone rides along at Tier A (bookkeeping never escalates)",
     ["tests/sibling-census.json"], "A", False, None),
    ("a proof file plus its sibling census stays Tier A",
     ["tests/proof/proof-1228.mjs", "tests/sibling-census.json"], "A", False, None),
]

# (label, files, expected tier, expected COMPLETE drive set)
EXACT_CASES = [
    ("Tier B map selection is exactly map family + core (protocol section 3)",
     ["parts/engine.js"], "B", MAP),
    ("Tier B session selection is exactly session family + core, quarantine applied",
     ["parts/app4.js"], "B", SESSION),
    ("a touched quarantined drive runs, core rides along: drive89 + the six core",
     ["tests/browser/drive89.mjs"], "B", sorted(["drive89"] + CORE)),
    ("a touched quarantined drive joins a family selection untouched by quarantine",
     ["parts/engine.js", "tests/browser/drive89.mjs"], "B", MAP + ["drive89"]),
    ("a proof file riding a family change adds nothing and escalates nothing",
     ["parts/engine.js", "tests/proof/proof-1228.mjs"], "B", MAP),
    ("a proof file alone selects exactly the core set at Tier A",
     ["tests/proof/proof-1228.mjs"], "A", CORE),
    ("a family change plus its mutation receipt adds nothing and escalates nothing",
     ["parts/engine.js", "tests/mutation-receipts.json"], "B", MAP),
    ("an engine-plus-drive change plus its receipt stays Tier B (Codex P2, PR #155)",
     ["parts/engine.js", "tests/browser/drive161.mjs", "tests/mutation-receipts.json"],
     "B", sorted(set(MAP) | {"drive161"})),
    ("a family change plus its sibling census adds nothing and escalates nothing",
     ["parts/engine.js", "tests/sibling-census.json"], "B", MAP),
    ("an engine-plus-drive change plus its census stays Tier B",
     ["parts/engine.js", "tests/browser/drive161.mjs", "tests/sibling-census.json"],
     "B", sorted(set(MAP) | {"drive161"})),
]

failures = 0
for label, files, want_tier, want_full, want_drive in CASES:
    tier, drives, full, reason = mod.select(files)
    ok = tier == want_tier and full == want_full
    if want_drive == []:
        ok = ok and drives == []
    elif want_drive is not None:
        ok = ok and want_drive in drives
    if ok:
        print(f"PASS: {label} -> {tier} (full={full})")
    else:
        failures += 1
        print(f"FAIL: {label} -> got tier={tier} full={full} drives={drives} reason={reason!r}; "
              f"want tier={want_tier} full={want_full} drives~={want_drive}")

for label, files, want_tier, want_drives in EXACT_CASES:
    tier, drives, full, reason = mod.select(files)
    ok = tier == want_tier and drives == sorted(want_drives)
    if ok:
        print(f"PASS: {label} -> {tier} ({len(drives)} drives, exact)")
    else:
        failures += 1
        print(f"FAIL: {label} -> got tier={tier} drives={drives} reason={reason!r}; "
              f"want tier={want_tier} drives={sorted(want_drives)}")

total = len(CASES) + len(EXACT_CASES)
print(f"select-tier fixtures: {total - failures} pass, {failures} fail")
sys.exit(1 if failures else 0)
