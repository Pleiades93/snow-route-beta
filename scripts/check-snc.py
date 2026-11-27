#!/usr/bin/env python3
"""Strict-null gate (S1): the storage files are clean under
strictNullChecks, and the global backlog only ever shrinks."""
import re
import subprocess
import sys
from pathlib import Path

FILE_DIAG = re.compile(r"\(\d+,\d+\): error TS\d+")

STORAGE = {"app4.js", "create-packs.js", "app5.js", "create-save.js"}
# The global strict-null backlog measured at wiring time
# (2026-11-27); the gate fails above it.
CEILING = 196


def main():
    root = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
    tsc = root / "scripts" / "node_modules" / ".bin" / "tsc"
    proc = subprocess.run(
        [str(tsc), "-p", str(root / "scripts" / "tsconfig.snc.json")],
        capture_output=True, text=True, timeout=1200)
    diags = [line for line in proc.stdout.splitlines()
             if " error TS" in line or line.startswith("error TS")]
    errors = [line for line in diags if FILE_DIAG.search(line)]
    unfiled = [line for line in diags if not FILE_DIAG.search(line)]
    # A diagnostic with no file position is a compiler or
    # configuration failure: the gate checked nothing, so it fails.
    if unfiled:
        print("SNC GATE FAIL: compiler/configuration diagnostics:")
        print("\n".join(unfiled))
        return 1
    if proc.returncode != 0 and not diags:
        print(f"SNC GATE FAIL: tsc exited {proc.returncode} with "
              "no diagnostics.")
        return 1
    hits = [line for line in errors
            if any(f"parts/{name}(" in line for name in STORAGE)]
    if hits:
        print("SNC GATE FAIL: storage files carry strict-null errors:")
        print("\n".join(hits))
        return 1
    if len(errors) > CEILING:
        print(f"SNC GATE FAIL: global backlog {len(errors)} exceeds "
              f"the cap {CEILING}.")
        return 1
    print(f"SNC GATE PASS: storage files clean; global backlog "
          f"{len(errors)} of cap {CEILING}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
