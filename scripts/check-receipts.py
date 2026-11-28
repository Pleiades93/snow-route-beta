#!/usr/bin/env python3
"""Mutation receipts for new and changed checks (/correct Phase 3,
round (b) - class N1: first-pass checks that cannot bite).

TESTING.md rule 6 says an assertion counts only after it has been
SEEN to fail for the reason it exists. Through Phase 2 and the 1.259
cadence window that rule was prose, and the class kept firing after
it landed: push.py's gate fixtures stayed green with the judging
functions neutered (PR #146), sweep-check as first built swept
silently empty in three shapes (PR #147), drive213's B3 measured the
harness's unavailable-library note instead of the app (PR #148), and
drive214 counted label presence while the names lay across their
streets, forgave the defect in its own bearing law, and shelled out
to a library CI does not have (PR #151). Six instances, four PRs -
every one made real by the review seat, not by its author.

This script is the mechanical form: a check that is added or changed
ships with a RECEIPT in tests/mutation-receipts.json recording the
deliberate break (a mutation of the current tree, the historical
tree carrying the real past mistake, or - honestly labelled - a
rendered/manual measurement), the check FAILING under it, and the
check passing clean. The receipt pins the sha256 of every file its
evidence depends on (the check itself and any judge it exercises),
so the receipt goes stale the moment any of them moves.

scripts/push.py runs the gate half of this module on every push: a
check or judge file that differs from the branch must be named by a
CURRENT receipt (every pinned file matching the tree the push would
create), or the push is refused. The gate proves presence and
freshness; the bite itself is spot-verified by replaying the
recorded mutation, which is what the review seat already does -
the class was that it ONLY happened there.

Usage:
  python3 scripts/check-receipts.py verify <root>
      Print each receipt's state (CURRENT / STALE / BROKEN /
      INVALID) against a tree, over the active ledger and its
      archive (tests/archive/, where stale and broken receipts
      move - scripts/archive-ledgers.py). Exit 1 on a malformed
      receipts file,
      a receipt naming a file that does not exist, or a receipt
      whose evidence fields are incomplete: a receipt counts toward
      coverage only when it is well-formed AND every pinned file
      matches (receipt_problems owns the field rule).
  python3 scripts/check-receipts.py gate <root> --changed <path>...
      The push gate: every changed check/judge path must be covered
      by a current receipt. Exit 1 names the uncovered paths.
  python3 scripts/check-receipts.py issue <root> --id ID --check PATH
      --kind mutation|historical|rendered --mutation TEXT --red TEXT
      --green TEXT --file PATH [--file PATH...]
      [--span PATH START-LINE END-LINE ...]
      Append a receipt, pinning the named files' sha256 from the
      tree. Run this AFTER the mutation has actually been observed
      failing and the clean check passing - the texts are the
      record of that observation, not a substitute for it.

A pin is either a whole-file sha256 (a bare string, the original
form) or a claim span: {"span": [START-LINE, END-LINE], "sha256":
HEX} pinning only the region from the START-LINE through the
END-LINE (each an exact full line occurring exactly once in the
file, inclusive). An edit outside a span leaves the receipt
CURRENT; an edit inside it goes STALE; a marker that is missing,
duplicated or out of order is BROKEN - the gate refuses all three
non-CURRENT states for a changed path, exactly as before.
"""
import argparse
import fnmatch
import hashlib
import json
import sys
from pathlib import Path

RECEIPTS_REL = "tests/mutation-receipts.json"
ARCHIVE_REL = "tests/archive/mutation-receipts.json"

# Files whose verdicts decide pass/fail for the gate: proofs, browser
# drives, the runner's own selftests, the service-worker suite, and
# the fixture suites that judge the gate scripts. The checks
# workflow itself joined the scope in the #178 machinery round
# (2026-11-23, Codex P1 on PR #197): DEVELOPMENT_RULES §3 names the
# workflow as test machinery - changed only with verdict fixtures
# and mutation receipts - and this list is where that rule becomes
# mechanical.
CHECK_PATTERNS = [
    ".github/workflows/checks.yml",
    "tests/proof/proof-*.mjs",
    "tests/browser/drive*.mjs",
    "tests/browser/selftest-*.mjs",
    "tests/sw.test.mjs",
    "scripts/gate-fixtures/run-fixtures.py",
    "scripts/premise-lint-fixtures/run-fixtures.py",
]

# The judging scripts those suites exercise. A change to a judge is
# a change to every verdict it produces, so it triggers the same
# receipt requirement as a change to the check itself.
JUDGE_PATHS = {
    "scripts/push.py",
    "scripts/check-pr-limits.py",
    "scripts/check-receipts.py",
    "scripts/check-census.py",
    "scripts/check-survivors.py",
    "scripts/check-mirrors.py",
    "scripts/check-snc.py",
    "scripts/sweep-check.py",
    "scripts/check-proof-coverage.py",
    "scripts/check-shard-coverage.py",
    "scripts/run-proofs.py",
    "scripts/premise-lint.py",
    "scripts/scan-parts.cjs",
    "scripts/scan-boundaries.cjs",
}

KINDS = ("mutation", "historical", "rendered")


def is_check_path(path):
    return any(fnmatch.fnmatch(path, pat) for pat in CHECK_PATTERNS)


def trigger_paths(changed):
    """The subset of a push's changed paths that require a current
    receipt: check files and judge files. Everything else (app code,
    docs, the receipts file itself) is not a verdict being changed."""
    return sorted(p for p in changed if is_check_path(p) or p in JUDGE_PATHS)


def sha256_file(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load_receipts(root, rel=RECEIPTS_REL):
    """Returns (receipts, error). A missing receipts file is an empty
    set, not an error - the gate then simply finds nothing covered.
    A malformed one is an error: a gate that cannot read its own
    records refuses rather than waves through. rel selects the
    ledger: the active one by default, ARCHIVE_REL for the archive."""
    f = Path(root) / rel
    if not f.is_file():
        return [], None
    try:
        data = json.loads(f.read_text())
    except (OSError, ValueError) as e:
        return None, f"{rel} is unreadable: {e}"
    if not isinstance(data, dict) or not isinstance(data.get("receipts"), list):
        return None, f"{rel} does not carry a receipts list"
    return data["receipts"], None


def load_receipts_history(root):
    """(receipts, error): active receipts then archived ones - the
    history readers' view (verify, issue). Coverage never reads
    this; it judges the active ledger only."""
    active, err = load_receipts(root)
    if err:
        return None, err
    arch, err = load_receipts(root, ARCHIVE_REL)
    if err:
        return None, err
    return active + arch, None


def reactivated(root):
    """Archived receipts this tree makes CURRENT again (a revert or
    re-pin can resurrect a stale receipt's pins). The classifier is
    receipt_state itself, called on every archived record."""
    arch, err = load_receipts(root, ARCHIVE_REL)
    if err:
        return None, err
    found = [r.get("id", "?") for r in arch
             if isinstance(r, dict) and receipt_state(root, r) == "CURRENT"]
    return found, None


def _is_sha256(value):
    return (isinstance(value, str) and len(value) == 64
            and all(c in "0123456789abcdef" for c in value))


def pin_problems(pin):
    """A pin is a whole-file sha256 string or a claim-span object
    {"span": [start, end], "sha256": hex}. Anything else is not a
    pin the gate can judge."""
    if _is_sha256(pin):
        return []
    if isinstance(pin, dict):
        problems = []
        span = pin.get("span")
        if (not isinstance(span, list) or len(span) != 2
                or not all(isinstance(s, str) and s.strip() for s in span)):
            problems.append("'span' must be [start-line, end-line]")
        if not _is_sha256(pin.get("sha256")):
            problems.append("a span pin's 'sha256' must be a sha256 hex string")
        if set(pin.keys()) - {"span", "sha256"}:
            problems.append("a span pin carries only 'span' and 'sha256'")
        return problems
    return ["a pin must be a sha256 string or a span object"]


def span_region(content, start_marker, end_marker):
    """The bytes from the start-marker line through the end-marker
    line, inclusive - or None when either marker does not occur
    exactly once as a full line, or they are out of order."""
    lines = content.split(b"\n")
    starts = [i for i, ln in enumerate(lines)
              if ln.decode("utf-8", "replace") == start_marker]
    ends = [i for i, ln in enumerate(lines)
            if ln.decode("utf-8", "replace") == end_marker]
    if len(starts) != 1 or len(ends) != 1 or starts[0] > ends[0]:
        return None
    region = b"\n".join(lines[starts[0]:ends[0] + 1])
    if ends[0] < len(lines) - 1:
        region += b"\n"
    return region


def pin_state(root, rel, pin):
    """One pinned file's state under one pin: CURRENT, STALE (the
    pinned content moved) or BROKEN (the file or its span markers
    are gone or ambiguous)."""
    p = Path(root) / rel
    if not p.is_file():
        return "BROKEN"
    if isinstance(pin, str):
        return "CURRENT" if sha256_file(p) == pin else "STALE"
    region = span_region(p.read_bytes(), pin["span"][0], pin["span"][1])
    if region is None:
        return "BROKEN"
    digest = hashlib.sha256(region).hexdigest()
    return "CURRENT" if digest == pin["sha256"] else "STALE"


def receipt_problems(receipt):
    """Field-level validity of a receipt record. A receipt is the
    record of an observation: the evidence fields (the named check,
    the kind, the mutation, the failing observation, the clean pass)
    must be present and non-empty, and the check it names must be
    one of the files it pins. Hashes alone certify nothing - a
    hash-only record would let a changed check through with no
    failing observation ever recorded, the exact hole the gate
    exists to close (Codex P2 on PR #155). Returns a list of
    problems; [] means the record is well-formed."""
    if not isinstance(receipt, dict):
        return ["the receipt is not an object"]
    problems = []
    for field in ("id", "check", "mutation", "red", "green", "issued"):
        value = receipt.get(field)
        if not isinstance(value, str) or not value.strip():
            problems.append(f"'{field}' is missing or empty")
    if receipt.get("kind") not in KINDS:
        problems.append(f"'kind' must be one of {', '.join(KINDS)}")
    files = receipt.get("files")
    if not isinstance(files, dict) or not files:
        problems.append("'files' must be a non-empty map of path -> pin")
    else:
        for rel, pin in files.items():
            for problem in pin_problems(pin):
                problems.append(f"pin for {rel}: {problem}")
        if receipt.get("check") not in files:
            problems.append("the named check is not among the pinned files")
    return problems


def receipt_state(root, receipt):
    """CURRENT (well-formed, every pinned file matches), STALE (a
    pinned file's content moved), BROKEN (a pinned file is gone), or
    INVALID (the record itself is incomplete - it covers nothing)."""
    if receipt_problems(receipt):
        return "INVALID"
    states = [pin_state(root, rel, pin)
              for rel, pin in receipt.get("files").items()]
    if "BROKEN" in states:
        return "BROKEN"
    if "STALE" in states:
        return "STALE"
    return "CURRENT"


def uncovered(root, triggers):
    """(uncovered_paths, error): the trigger paths no CURRENT receipt
    names. A receipt covers exactly the paths in its files map - the
    files its evidence was observed against."""
    receipts, err = load_receipts(root)
    if err:
        return None, err
    back, err = reactivated(root)
    if err:
        return None, err
    if back:
        return None, ("archived receipt(s) are CURRENT on this tree but sit in "
                      + ARCHIVE_REL + ": " + ", ".join(back)
                      + " - restore them before gating (python3 "
                      "scripts/archive-ledgers.py restore . --id "
                      + " --id ".join(back) + ")")
    covered = set()
    for r in receipts:
        if receipt_state(root, r) == "CURRENT":
            covered.update(r.get("files", {}).keys())
    return [p for p in triggers if p not in covered], None


def refusal_text(missing):
    return ("changed check/judge file(s) with no CURRENT mutation receipt: "
            + ", ".join(missing)
            + " - rule 6 is mechanical now (class N1): observe the check "
            "failing under a named mutation or on the historical tree, "
            "then record it with scripts/check-receipts.py issue and push "
            "tests/mutation-receipts.json with the change")


def gate(root, changed):
    """The push gate's verdict. Returns an error string or None."""
    triggers = trigger_paths(changed)
    if not triggers:
        return None
    missing, err = uncovered(root, triggers)
    if err:
        return "the mutation-receipt gate cannot run: " + err
    if missing:
        return refusal_text(missing)
    print(f"RECEIPTS GATE: {len(triggers)} changed check/judge path(s) covered "
          "by current mutation receipts")
    return None


def cmd_verify(root):
    receipts, err = load_receipts_history(root)
    if err:
        print("RECEIPTS ERROR: " + err)
        return 1
    if not receipts:
        print("RECEIPTS: none recorded")
        return 0
    bad = 0
    whole = spans = 0
    for r in receipts:
        state = receipt_state(root, r)
        if state in ("BROKEN", "INVALID"):
            bad += 1
        for pin in r.get("files", {}).values():
            if isinstance(pin, dict):
                spans += 1
            else:
                whole += 1
        print(f"{state}: {r.get('id', '?')} (check {r.get('check', '?')}, "
              f"kind {r.get('kind', '?')}, {len(r.get('files', {}))} file(s) pinned)")
        if state == "INVALID":
            for problem in receipt_problems(r):
                print(f"    invalid: {problem}")
    print(f"RECEIPTS: pins - {whole} whole-file, {spans} claim-span")
    if bad:
        print(f"RECEIPTS: {bad} broken or invalid receipt(s)")
        return 1
    return 0


def cmd_gate(root, changed):
    err = gate(root, changed)
    if err:
        print("RECEIPTS GATE REFUSED: " + err)
        return 1
    return 0


def cmd_issue(root, args):
    f = Path(root) / RECEIPTS_REL
    data = {"about": "", "receipts": []}
    if f.is_file():
        try:
            data = json.loads(f.read_text())
        except ValueError as e:
            print(f"ISSUE REFUSED: existing {RECEIPTS_REL} is malformed: {e}")
            return 1
    arch, err = load_receipts(root, ARCHIVE_REL)
    if err:
        print("ISSUE REFUSED: " + err)
        return 1
    if any(r.get("id") == args.id for r in data["receipts"] + arch):
        print(f"ISSUE REFUSED: receipt id '{args.id}' already exists - "
              "receipts are append-only history; a re-observation gets a new id")
        return 1
    for field in ("mutation", "red", "green"):
        if not getattr(args, field).strip():
            print(f"ISSUE REFUSED: --{field} is empty - a receipt records an "
                  "observation actually made, not a placeholder for one")
            return 1
    files = {}
    for rel in args.file:
        p = Path(root) / rel
        if not p.is_file():
            print(f"ISSUE REFUSED: {rel} is not a file in the tree")
            return 1
        files[rel] = sha256_file(p)
    for rel, start, end in (args.span or []):
        p = Path(root) / rel
        if not p.is_file():
            print(f"ISSUE REFUSED: {rel} is not a file in the tree")
            return 1
        region = span_region(p.read_bytes(), start, end)
        if region is None:
            print(f"ISSUE REFUSED: the span markers for {rel} must each "
                  "occur exactly once as a full line, in order")
            return 1
        files[rel] = {"span": [start, end],
                      "sha256": hashlib.sha256(region).hexdigest()}
    if args.check not in files:
        print(f"ISSUE REFUSED: the check itself ({args.check}) must be one of "
              "the pinned --file paths - a receipt pins what its evidence "
              "was observed against")
        return 1
    data["receipts"].append({
        "id": args.id,
        "check": args.check,
        "kind": args.kind,
        "files": files,
        "mutation": args.mutation,
        "red": args.red,
        "green": args.green,
        "issued": args.issued,
    })
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps(data, indent=1) + "\n")
    print(f"RECEIPT ISSUED: {args.id} - {len(files)} file(s) pinned from the tree")
    return 0


def main():
    ap = argparse.ArgumentParser(description="Mutation receipts for checks (class N1)")
    sub = ap.add_subparsers(dest="mode", required=True)
    pv = sub.add_parser("verify")
    pv.add_argument("root", type=Path)
    pg = sub.add_parser("gate")
    pg.add_argument("root", type=Path)
    pg.add_argument("--changed", nargs="+", required=True)
    pi = sub.add_parser("issue")
    pi.add_argument("root", type=Path)
    pi.add_argument("--id", required=True)
    pi.add_argument("--check", required=True)
    pi.add_argument("--kind", required=True, choices=KINDS)
    pi.add_argument("--mutation", required=True)
    pi.add_argument("--red", required=True)
    pi.add_argument("--green", required=True)
    pi.add_argument("--issued", required=True,
                    help="the round/date the observation was made, e.g. 2026-11-21 correct-phase3b")
    pi.add_argument("--file", action="append", default=[])
    pi.add_argument("--span", action="append", nargs=3, default=[],
                    metavar=("PATH", "START", "END"),
                    help="pin only the claim region of PATH between the "
                         "two exact marker lines")
    args = ap.parse_args()
    root = args.root.resolve()
    if args.mode == "verify":
        return cmd_verify(root)
    if args.mode == "gate":
        return cmd_gate(root, args.changed)
    return cmd_issue(root, args)


if __name__ == "__main__":
    sys.exit(main())
