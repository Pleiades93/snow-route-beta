#!/usr/bin/env python3
"""Tier selector fixtures (PR #23 gate; Beta 1.185).

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

Run: python3 scripts/select-tier-fixtures/run-fixtures.py
Exit 0 = every case matched its expected (tier, full-battery) pair.
"""
import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
spec = importlib.util.spec_from_file_location("select_tier", ROOT / "scripts" / "select-tier.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

# (label, files, expected tier, expected full-battery flag, expected drives check or None)
CASES = [
    ("family + unrecognized app file falls to the map default (THE FIX)",
     ["parts/engine.js", "parts/mystery.js"], "C", True, []),
    ("create family + unrecognized app file also falls to the default",
     ["parts/create-packs.js", "parts/brand-new.js"], "C", True, []),
    ("pure family change stays Tier B with the family drives",
     ["parts/engine.js"], "B", False, "drive127"),
    ("family + known tier-A path stays Tier B (both known)",
     ["parts/engine.js", "parts/head.html"], "B", False, "drive127"),
    ("pure tier-A change stays Tier A",
     ["parts/head.html"], "A", False, None),
    ("deep path stays Tier C",
     ["parts/app1.js"], "C", True, []),
    ("the selector's own machinery stays Tier C",
     ["scripts/select-tier.py"], "C", True, []),
    ("a drive file alone rides Tier B (amendment clause 1)",
     ["tests/browser/drive161.mjs"], "B", False, "drive161"),
    ("empty diff stays Tier A",
     [], "A", False, None),
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

print(f"select-tier fixtures: {len(CASES) - failures} pass, {failures} fail")
sys.exit(1 if failures else 0)
