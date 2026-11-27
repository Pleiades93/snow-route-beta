#!/usr/bin/env python3
"""Survivor lists for removal, port and restructure rounds
(/correct 2026-11-26 pass, Class 2 - the reopened C7: rounds
that cut adjacent load-bearing behaviour).

The class, from the mined record: a round that removes, ports
or restructures existing behaviour drops a guard, a branch or
an ordering the old code carried, and the loss is found later
by a drive or by Codex - never by the round itself. PR #98
(Beta 1.221) cut three behaviours in one round (the snapshot
warning left unconditional, the cancel closing-disclosure
branches, a finished Update check changing state unseen).
17342d6 (Beta 1.275) dropped saveAll's primary-retry arm in
the architecture #3 restructure. PR #202's merge-restore port
changed two semantics (an imported run's snapshot erasing
resident marks at Cancel; note tuple identity importing an
edited note twice). PR #217's popup port dropped the original
code's `return` after the degraded banner, so a later banner
overwrote it - the fourth cut, the written trigger that
reopened this class. TESTING.md rule 6 stated the discipline
in prose (name the survivors before the first cut); the class
recurring is the proof prose was the floor, not the fix.

This script is the mechanical form: before the first cut, the
round writes the shared surface's SURVIVOR LIST - one row per
behaviour that must still be true after the cut, naming the
existing check that observes it and the literal case text
(the needle) under which that check carries the behaviour.
The list lives in tests/survivor-lists.json as an append-only
ledger of round records, mirroring tests/sibling-census.json.
A record pins the sha256 of every parts/ path it names, so it
goes stale the moment the cut surface moves again, and
scripts/push.py refuses a parts-changing push that no
CURRENT record names. A round whose parts change removes,
ports and restructures nothing (a pure addition, line wraps,
comment work) records a NO-CUT record with its reason
instead, so the absence of a survivor list is a stated fact,
never a silent skip.

The gate's mechanical bite is the needle: a row's named case
must be a literal string that occurs in the named check file
in the tree being pushed. A survivor naming a check that does
not exist, or a case that file does not carry, certifies
nothing - that vacuous-naming shape is the one the Block 5
pin-vacuity scanner closed for proofs, applied here to the
list itself.

The honest limit, stated as plainly as the receipts and
census gates state theirs: the gate verifies the list EXISTS,
was written against the tree being pushed (pins current),
and that every named check is real and carries its named
case. It cannot verify the behaviour text is complete - that
a survivor was not simply left off the list - or that the
named case truly observes the behaviour end-to-end (the
Class 5 standard in TESTING.md rule 6). The review seat
remains the spot-check, now reading the author's own list
instead of reconstructing it after the fact.

Usage:
  python3 scripts/check-survivors.py verify <root>
      Print each record's state (CURRENT / STALE / BROKEN /
      INVALID). Exit 1 on a malformed ledger, a broken record,
      or an invalid one.
  python3 scripts/check-survivors.py gate <root> --changed <path>...
      The push gate: every changed parts/ path must be named
      by a CURRENT record (a cut record with at least one row,
      or a no-cut record) whose pins match this tree.
  python3 scripts/check-survivors.py issue <root> --id ID
      --surface TEXT --cut TEXT --changed parts/x.js
      [--changed ...] --rows ROWS.json --issued TEXT
      Append a cut record. ROWS.json is a list of row objects
      {behaviour, check, case, observes}; every row's case
      needle is verified against its check file at issue time.
      Pins are taken from the tree - issue on the frozen tree.
  python3 scripts/check-survivors.py issue-no-cut <root> --id ID
      --reason TEXT [--changed parts/x.js ...] --issued TEXT
      Append a no-cut record (the round removed, ported and
      restructured nothing; a machinery or docs round names
      no parts paths at all).
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path

LEDGER_REL = "tests/survivor-lists.json"
TOOL_REL = "scripts/check-survivors.py"
ROW_FIELDS = ("behaviour", "check", "case", "observes")


def sha256_file(path):
    """The pin primitive, shared in shape with the census."""
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def _is_sha256(value):
    return (isinstance(value, str) and len(value) == 64
            and all(c in "0123456789abcdef" for c in value))


def load_ledger(root):
    """Returns (data, error). A missing ledger is an empty set,
    not an error - the gate then simply finds nothing covered.
    A malformed one is an error: a gate that cannot read its
    own records refuses rather than waves through."""
    f = Path(root) / LEDGER_REL
    if not f.is_file():
        return {"about": "", "rounds": []}, None
    try:
        data = json.loads(f.read_text())
    except (OSError, ValueError) as e:
        return None, f"{LEDGER_REL} is unreadable: {e}"
    if not isinstance(data, dict) or not isinstance(data.get("rounds"), list):
        return None, f"{LEDGER_REL} does not carry a rounds list"
    return data, None


def record_problems(rec):
    """Field-level validity, before any tree is consulted: the
    record must say what surface, what cut (or why no cut), and
    - for a cut - at least one survivor row with every field
    filled. A list with an empty row is a ceremony, not a list."""
    if not isinstance(rec, dict):
        return ["the record is not an object"]
    problems = []
    for field in ("id", "kind", "issued"):
        value = rec.get(field)
        if not isinstance(value, str) or not value.strip():
            problems.append(f"'{field}' is missing or empty")
    if rec.get("kind") not in ("cut", "no-cut"):
        return problems + ["'kind' must be 'cut' or 'no-cut'"]
    changed = rec.get("changed")
    if not isinstance(changed, list) or \
            any(not isinstance(p, str) or not p.startswith("parts/") for p in changed):
        problems.append("'changed' must be a list of parts/ paths")
        changed = []
    files = rec.get("files")
    if changed:
        if not isinstance(files, dict) or not files:
            problems.append("'files' must pin every changed parts path")
        else:
            for rel in changed:
                if not _is_sha256(files.get(rel)):
                    problems.append(f"'files' carries no sha256 pin for {rel}")
    if rec["kind"] == "no-cut":
        if not str(rec.get("reason") or "").strip():
            problems.append("a no-cut record must state its reason")
        return problems
    for field in ("surface", "cut"):
        if not str(rec.get(field) or "").strip():
            problems.append(f"'{field}' is missing or empty")
    if not changed:
        problems.append("a cut record must name the parts paths it cuts")
    rows = rec.get("rows")
    if not isinstance(rows, list) or not rows:
        problems.append("a cut record needs at least one survivor row")
    else:
        for i, row in enumerate(rows):
            if not isinstance(row, dict):
                problems.append(f"row {i} is not an object")
                break
            for field in ROW_FIELDS:
                if not str(row.get(field) or "").strip():
                    problems.append(f"row {i}: '{field}' is missing or empty")
                    break
    return problems


def record_state(root, rec):
    """CURRENT (well-formed, pins match, every named case found
    in its check file), STALE (a pinned parts file moved),
    BROKEN (a pinned file, a check file, or a named case is
    gone), or INVALID (the record itself is incomplete)."""
    if record_problems(rec):
        return "INVALID"
    root = Path(root)
    for rel, want in (rec.get("files") or {}).items():
        p = root / rel
        if not p.is_file():
            return "BROKEN"
        if sha256_file(p) != want:
            return "STALE"
    for row in rec.get("rows") or []:
        p = root / row["check"]
        if not p.is_file():
            return "BROKEN"
        if row["case"] not in p.read_text(encoding="utf-8", errors="replace"):
            return "BROKEN"
    return "CURRENT"


def gate(root, changed):
    """The push gate's verdict. Returns an error string or None.
    Only parts/ paths trigger the requirement; a machinery or
    docs push needs no record at the gate (its round still
    states the fact as a no-cut record in the ledger, verified
    by `verify`, not by this gate)."""
    parts_changed = sorted({p for p in changed if p.startswith("parts/")})
    if not parts_changed:
        return None
    data, err = load_ledger(root)
    if err:
        return "the survivor-list gate cannot run: " + err
    stale_cover = None
    for rec in data["rounds"]:
        if not set(parts_changed) <= set(rec.get("changed") or []):
            continue
        state = record_state(root, rec)
        if state == "CURRENT":
            rows = len(rec.get("rows") or [])
            shape = (f"{rows} survivor row(s), every named case verified "
                     "in its check" if rec["kind"] == "cut"
                     else "a no-cut declaration")
            print(f"SURVIVORS GATE: list '{rec['id']}' covers "
                  f"{len(parts_changed)} changed parts path(s); {shape}")
            return None
        stale_cover = (rec.get("id"), state)
    if stale_cover:
        return (f"survivor list '{stale_cover[0]}' names the changed parts "
                f"paths but is {stale_cover[1]} against this tree - re-issue "
                "it on the frozen tree (scripts/check-survivors.py issue) "
                "so its pins and named cases certify this push")
    return ("changed parts path(s) with no CURRENT survivor list naming "
            "them: " + ", ".join(parts_changed)
            + " - write the survivor list before the first cut "
            "(scripts/check-survivors.py issue), naming the existing check "
            "that observes each behaviour that must survive; a round that "
            "cuts nothing records issue-no-cut with its reason instead "
            "(Class 2: cuts found by the review seat are the class this "
            "gate exists to move before the first push)")


# ------------------------------------------------------------------
# Commands
# ------------------------------------------------------------------


def _write_ledger(root, data):
    f = Path(root) / LEDGER_REL
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps(data, indent=1) + "\n")


def _pins(root, changed):
    pins = {}
    for rel in changed:
        p = Path(root) / rel
        if not p.is_file():
            return None, f"changed path {rel} is not in the tree"
        pins[rel] = sha256_file(p)
    return pins, None


def cmd_issue(root, args):
    data, err = load_ledger(root)
    if err:
        print("ISSUE REFUSED: " + err)
        return 1
    if any(r.get("id") == args.id for r in data["rounds"]):
        print(f"ISSUE REFUSED: survivor id '{args.id}' already exists - the "
              "ledger is append-only; a re-issue gets a new id")
        return 1
    try:
        rows = json.loads(Path(args.rows).read_text())
    except (OSError, ValueError) as e:
        print(f"ISSUE REFUSED: the rows file is unreadable: {e}")
        return 1
    if not isinstance(rows, list):
        print("ISSUE REFUSED: the rows file must carry a list of row objects")
        return 1
    for i, row in enumerate(rows):
        if not isinstance(row, dict):
            print(f"ISSUE REFUSED: row {i} is not an object")
            return 1
        for field in ROW_FIELDS:
            if not str(row.get(field) or "").strip():
                print(f"ISSUE REFUSED: row {i} carries no '{field}' - a "
                      "survivor row names the behaviour, the check, the "
                      "case text in that check, and where it reads the "
                      "behaviour")
                return 1
        p = Path(root) / row["check"]
        if not p.is_file():
            print(f"ISSUE REFUSED: row {i} names check {row['check']}, which "
                  "is not in the tree - a survivor only counts when an "
                  "existing check observes it")
            return 1
        if row["case"] not in p.read_text(encoding="utf-8", errors="replace"):
            print(f"ISSUE REFUSED: row {i} names case text that "
                  f"{row['check']} does not carry - the needle must occur "
                  "in the named check, or the naming is vacuous")
            return 1
    changed = sorted(set(args.changed))
    pins, err = _pins(root, changed)
    if err:
        print("ISSUE REFUSED: " + err)
        return 1
    rec = {"id": args.id, "kind": "cut", "surface": args.surface,
           "cut": args.cut, "changed": changed, "rows": rows,
           "files": pins, "issued": args.issued}
    problems = record_problems(rec)
    if problems:
        print("ISSUE REFUSED: " + "; ".join(problems))
        return 1
    data.setdefault("about", "")
    data["rounds"].append(rec)
    _write_ledger(root, data)
    print(f"SURVIVOR LIST ISSUED: {args.id} - {len(rows)} survivor row(s), "
          f"{len(changed)} parts path(s) pinned")
    return 0


def cmd_issue_no_cut(root, args):
    data, err = load_ledger(root)
    if err:
        print("ISSUE REFUSED: " + err)
        return 1
    if any(r.get("id") == args.id for r in data["rounds"]):
        print(f"ISSUE REFUSED: survivor id '{args.id}' already exists")
        return 1
    changed = sorted(set(args.changed or []))
    pins, err = _pins(root, changed)
    if err:
        print("ISSUE REFUSED: " + err)
        return 1
    rec = {"id": args.id, "kind": "no-cut", "reason": args.reason,
           "changed": changed, "files": pins, "issued": args.issued}
    problems = record_problems(rec)
    if problems:
        print("ISSUE REFUSED: " + "; ".join(problems))
        return 1
    data.setdefault("about", "")
    data["rounds"].append(rec)
    _write_ledger(root, data)
    print(f"NO-CUT RECORDED: {args.id}")
    return 0


def cmd_verify(root):
    data, err = load_ledger(root)
    if err:
        print("SURVIVORS ERROR: " + err)
        return 1
    if not data["rounds"]:
        print("SURVIVORS: no rounds recorded")
        return 0
    bad = 0
    for rec in data["rounds"]:
        state = record_state(root, rec)
        if state in ("BROKEN", "INVALID"):
            bad += 1
        extra = ""
        if rec.get("kind") == "cut":
            extra = f", {len(rec.get('rows', []))} row(s)"
        print(f"{state}: {rec.get('id', '?')} (kind {rec.get('kind', '?')}{extra})")
        if state == "INVALID":
            for problem in record_problems(rec):
                print(f"    invalid: {problem}")
    if bad:
        print(f"SURVIVORS: {bad} broken or invalid record(s)")
        return 1
    return 0


def cmd_gate(root, changed):
    err = gate(root, changed)
    if err:
        print("SURVIVORS GATE REFUSED: " + err)
        return 1
    return 0


def main():
    ap = argparse.ArgumentParser(
        description="Survivor lists for cut rounds (Class 2)")
    sub = ap.add_subparsers(dest="mode", required=True)
    pi = sub.add_parser("issue")
    pi.add_argument("root", type=Path)
    pi.add_argument("--id", required=True)
    pi.add_argument("--surface", required=True)
    pi.add_argument("--cut", required=True)
    pi.add_argument("--changed", action="append", required=True)
    pi.add_argument("--rows", required=True)
    pi.add_argument("--issued", required=True)
    pn = sub.add_parser("issue-no-cut")
    pn.add_argument("root", type=Path)
    pn.add_argument("--id", required=True)
    pn.add_argument("--reason", required=True)
    pn.add_argument("--changed", action="append")
    pn.add_argument("--issued", required=True)
    pv = sub.add_parser("verify")
    pv.add_argument("root", type=Path)
    pg = sub.add_parser("gate")
    pg.add_argument("root", type=Path)
    pg.add_argument("--changed", nargs="+", required=True)
    args = ap.parse_args()
    root = args.root.resolve()
    if args.mode == "issue":
        return cmd_issue(root, args)
    if args.mode == "issue-no-cut":
        return cmd_issue_no_cut(root, args)
    if args.mode == "verify":
        return cmd_verify(root)
    return cmd_gate(root, args.changed)


if __name__ == "__main__":
    sys.exit(main())
