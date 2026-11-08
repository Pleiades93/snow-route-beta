#!/usr/bin/env python3
"""Premise-lint fixture runner (Improvement Tranche 4 / T2, 2026-11-08).

Per the test-change gate (docs/TESTING.md rule 1: judging logic ships
with fixtures), the premise lint's pass/fail-relevant behaviour - base
literal mode AND the --keys semantic mode - is proven against frozen
case inputs under scripts/premise-lint-fixtures/cases/: each case is a
base/ tree, a head/ tree and a drives/ directory, plus a case.json
listing the runs (base mode / key mode) and the output substrings each
run must contain and must not contain.

Cases:
  da04-key-rename  a draft KEY renamed while its short literal survives
                   as display text: base mode blind, key mode flags.
  display-removal  a display literal removed: base mode flags as today.
  key-survives     the literal still appears in a key-bearing head
                   line: neither mode flags.
  derived-drive    a drive deriving its expectation from the source
                   file contains no literal: neither mode flags it.
  display-value-storage-line  (fix cycle 1, case 5) a display VALUE on
                   a storage-call line removed, display copy surviving:
                   neither mode flags it as a key.
  standalone-array-literal  (fix cycle 1, case 6) a literal removed
                   from a standalone array literal: not a key.
  key-renamed-display-on-storage-line  (fix cycle 1, case 7) a real
                   key renamed while a same-text display value survives
                   as a storage VALUE: key mode must still flag it.

Run: python3 scripts/premise-lint-fixtures/run-fixtures.py
Exit 0 = every case run matched its expectations.
"""
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
LINT = HERE.parent / "premise-lint.py"


def main() -> int:
    fails = 0
    cases = sorted((HERE / "cases").iterdir())
    total = 0
    for case_dir in cases:
        spec = json.loads((case_dir / "case.json").read_text(encoding="utf-8"))
        for run in spec["runs"]:
            total += 1
            cmd = [sys.executable, str(LINT),
                   "--base", str(case_dir / "base"),
                   "--head", str(case_dir / "head"),
                   "--drives-dir", str(case_dir / "drives")]
            if run["keys"]:
                cmd.append("--keys")
            out = subprocess.run(cmd, capture_output=True, text=True)
            text = out.stdout + out.stderr
            mode = "keys" if run["keys"] else "base"
            for want in run["expect_contains"]:
                if want not in text:
                    fails += 1
                    print(f"FAIL {spec['name']} [{mode}]: missing {want!r}\n--- output ---\n{text}")
            for bad in run["expect_absent"]:
                if bad in text:
                    fails += 1
                    print(f"FAIL {spec['name']} [{mode}]: unexpected {bad!r}\n--- output ---\n{text}")
            if out.returncode != 0:
                fails += 1
                print(f"FAIL {spec['name']} [{mode}]: lint exited {out.returncode}\n--- output ---\n{text}")
    if fails:
        print(f"premise-lint fixtures: {fails} failure(s) over {total} run(s)")
        return 1
    print(f"premise-lint fixtures: PASS ({total} runs over {len(cases)} cases)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
