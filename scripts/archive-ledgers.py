#!/usr/bin/env python3
"""Ledger archiving for the receipts + census bookkeeping (S3).

The two gate ledgers (tests/mutation-receipts.json,
tests/sibling-census.json) are append-only history: most records
in them are STALE or BROKEN on any given tree, and every gate run
re-reads the whole file. This tool moves the dead records into
tests/archive/ under the same ledger names, leaving the active
ledgers holding only what can still judge a push.

A record moves as a RAW BYTE SLICE of its ledger file - the splice
below locates each record's span in the original text and rebuilds
both files from those spans, so a moved record is bit-identical to
what the gates read before. No JSON round-trip ever touches a
record (the ledgers' mixed escaping would not survive one).

The move criterion is computed state only, taken from the gates'
own classifiers (record_state in check-census.py, receipt_state
in check-receipts.py, imported here - never re-implemented):
STALE and BROKEN move, CURRENT never moves, an INVALID record in
an active ledger refuses the whole run. No date, id-range or
manual selection exists for apply.

The publish is transactional: an exclusive lock, staged outputs
proven before anything is replaced (id conservation across each
pair, per-id byte identity against the pre-move bytes), a journal
plus backups written before the first replacement, per-file
atomic replacement, both gate verifies re-run against the live
tree and compared with the pre-move capture, and rollback from
the backups on any mismatch. A leftover journal refuses every
later run until `recover` rolls the transaction back.

Reactivation: STALE is tree-relative - a revert can make an
archived record CURRENT again. The gates detect that seat (their
own reactivated() scans refuse the push and name the restore
command); `restore` here moves named records back to the active
ledger through the same transaction, and `check` reports any
archived record this tree makes CURRENT.

Usage:
  python3 scripts/archive-ledgers.py preview <root>
      The move plan: counts and bytes per state class, per
      ledger, and the resulting file sizes. Writes nothing.
  python3 scripts/archive-ledgers.py apply <root>
      Perform the move, transactionally, as above.
  python3 scripts/archive-ledgers.py restore <root> --id ID...
      Move the named archived records back to their active
      ledgers, through the same transaction.
  python3 scripts/archive-ledgers.py check <root>
      Exit 1 naming any archived record CURRENT on this tree.
  python3 scripts/archive-ledgers.py verify <root>
      Pair integrity: envelopes parse, ids are unique across
      each pair, every record's state computes, and no archived
      record is CURRENT on this tree.
  python3 scripts/archive-ledgers.py recover <root>
      Roll back an interrupted transaction from its journal.
"""
import argparse
import hashlib
import importlib.util
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ARCHIVE_DIR_REL = "tests/archive"
LOCK_REL = "tests/archive/.archive-lock"
JOURNAL_REL = "tests/archive/.archive-journal.json"
BACKUP_REL = "tests/archive/.archive-backup"


def _load_gate(name):
    spec = importlib.util.spec_from_file_location(f"snow_{name}", HERE / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


CENSUS = _load_gate("check-census")
RECEIPTS = _load_gate("check-receipts")

LEDGERS = [
    {"name": "census", "active": CENSUS.CENSUS_REL, "archive": CENSUS.ARCHIVE_REL,
     "key": "rounds", "state": CENSUS.record_state},
    {"name": "receipts", "active": RECEIPTS.RECEIPTS_REL, "archive": RECEIPTS.ARCHIVE_REL,
     "key": "receipts", "state": RECEIPTS.receipt_state},
]


class Refuse(Exception):
    pass


# ------------------------------------------------------------------
# Byte-slice ledger splitting. The scanner is string/escape aware
# and runs only on text json.loads has already accepted.
# ------------------------------------------------------------------


def _scan_string(text, i):
    i += 1
    n = len(text)
    while i < n:
        c = text[i]
        if c == "\\":
            i += 2
            continue
        if c == '"':
            return i + 1
        i += 1
    raise Refuse("unterminated string in ledger text")


def _scan_value(text, i):
    c = text[i]
    if c == '"':
        return _scan_string(text, i)
    if c in "{[":
        depth = 0
        n = len(text)
        while i < n:
            c = text[i]
            if c == '"':
                i = _scan_string(text, i)
                continue
            if c in "{[":
                depth += 1
            elif c in "}]":
                depth -= 1
                if depth == 0:
                    return i + 1
            i += 1
        raise Refuse("unterminated value in ledger text")
    n = len(text)
    while i < n and text[i] not in ",]} \t\r\n":
        i += 1
    return i


def _skip_ws(text, i):
    while i < len(text) and text[i] in " \t\r\n":
        i += 1
    return i


class Split:
    """One ledger file as splice parts plus its parsed records."""

    def __init__(self, text, key):
        try:
            data = json.loads(text)
        except ValueError as e:
            raise Refuse(f"ledger is not valid JSON: {e}")
        if not isinstance(data, dict) or not isinstance(data.get(key), list):
            raise Refuse(f"ledger does not carry a {key} list")
        self.records = data[key]
        i = _skip_ws(text, 0)
        if i >= len(text) or text[i] != "{":
            raise Refuse("ledger envelope is not an object")
        i += 1
        open_idx = None
        while True:
            i = _skip_ws(text, i)
            if i < len(text) and text[i] == "}":
                break
            if i >= len(text) or text[i] != '"':
                raise Refuse("ledger envelope member is not a string key")
            kend = _scan_string(text, i)
            member = json.loads(text[i:kend])
            i = _skip_ws(text, kend)
            if i >= len(text) or text[i] != ":":
                raise Refuse("ledger envelope member has no colon")
            i = _skip_ws(text, i + 1)
            if member == key:
                if i >= len(text) or text[i] != "[":
                    raise Refuse(f"ledger {key} is not an array")
                open_idx = i
                break
            i = _scan_value(text, i)
            i = _skip_ws(text, i)
            if i < len(text) and text[i] == ",":
                i += 1
        if open_idx is None:
            raise Refuse(f"ledger carries no {key} array span")
        self.prefix = text[:open_idx + 1]
        spans = []
        i = open_idx + 1
        close_idx = None
        while True:
            i = _skip_ws(text, i)
            if i < len(text) and text[i] == "]":
                close_idx = i
                break
            start = i
            i = _scan_value(text, i)
            spans.append((start, i))
            i = _skip_ws(text, i)
            if i < len(text) and text[i] == ",":
                i += 1
                continue
            if i < len(text) and text[i] == "]":
                close_idx = i
                break
            raise Refuse("ledger array is not comma separated")
        self.suffix = text[close_idx:]
        self.slices = [text[s:e] for s, e in spans]
        if len(self.slices) != len(self.records):
            raise Refuse("slice count disagrees with the parsed records")
        self.ids = []
        for raw, rec in zip(self.slices, self.records):
            if json.loads(raw) != rec:
                raise Refuse("a slice disagrees with its parsed record")
            rid = rec.get("id") if isinstance(rec, dict) else None
            if not isinstance(rid, str) or not rid:
                raise Refuse("a record carries no usable id")
            self.ids.append(rid)
        if spans:
            self.head = text[open_idx + 1:spans[0][0]]
            self.tail = text[spans[-1][1]:close_idx]
            mids = {text[spans[k][1]:spans[k + 1][0]]
                    for k in range(len(spans) - 1)}
            if len(mids) > 1:
                raise Refuse("ledger element separators are not uniform")
            self.mid = mids.pop() if mids else ",\n "
        else:
            self.head = ""
            self.tail = ""
            self.mid = ",\n "

    def build(self, slices):
        if not slices:
            return self.prefix + self.suffix
        return (self.prefix + self.head + self.mid.join(slices)
                + self.tail + self.suffix)

    def slice_map(self):
        return dict(zip(self.ids, self.slices))


def _read_split(root, rel, key):
    f = Path(root) / rel
    if not f.is_file():
        return None
    split = Split(f.read_text(encoding="utf-8"), key)
    split.sha = _sha(f.read_bytes())
    return split


def _sha(data):
    return hashlib.sha256(data).hexdigest()


# ------------------------------------------------------------------
# Planning: states, move set, staged texts - all proven
# before a byte is published.
# ------------------------------------------------------------------


class LedgerPlan:
    def __init__(self, root, spec, restore_ids=None):
        self.spec = spec
        self.active = _read_split(root, spec["active"], spec["key"])
        if self.active is None:
            raise Refuse(f"{spec['active']} is missing")
        self.archive = _read_split(root, spec["archive"], spec["key"])
        seen = set()
        for split in (self.active, self.archive):
            if split is None:
                continue
            for rid in split.ids:
                if rid in seen:
                    raise Refuse(f"record id '{rid}' appears twice across "
                                 f"{spec['active']} and {spec['archive']}")
                seen.add(rid)
        self.input_hashes = {
            spec["active"]: self.active.sha,
            spec["archive"]: self.archive.sha if self.archive else None,
        }
        self.states = {}
        for split in (self.active, self.archive):
            if split is None:
                continue
            for rec in split.records:
                self.states[rec["id"]] = spec["state"](root, rec)
        if restore_ids is None:
            self.movers = [rid for rid in self.active.ids
                           if self.states[rid] in ("STALE", "BROKEN")]
            bad = [rid for rid in self.active.ids
                   if self.states[rid] == "INVALID"]
            if bad:
                raise Refuse("INVALID record(s) in "
                             f"{spec['active']}: " + ", ".join(bad)
                             + " - the run refuses; fix the record first")
            self.direction = "apply"
        else:
            if self.archive is None:
                self.movers = []
            else:
                self.movers = [rid for rid in restore_ids
                               if rid in self.archive.ids]
            self.direction = "restore"
        self.staged_active = None
        self.staged_archive = None
        if self.movers:
            self._stage()

    def _stage(self):
        spec = self.spec
        mover_set = set(self.movers)
        if self.direction == "apply":
            keep = [s for rid, s in zip(self.active.ids, self.active.slices)
                    if rid not in mover_set]
            moved = [s for rid, s in zip(self.active.ids, self.active.slices)
                     if rid in mover_set]
            self.staged_active = self.active.build(keep)
            base = self.archive if self.archive is not None else self.active
            prior = self.archive.slices if self.archive is not None else []
            self.staged_archive = base.build(prior + moved)
        else:
            back = [s for rid, s in zip(self.archive.ids, self.archive.slices)
                    if rid in mover_set]
            left = [s for rid, s in zip(self.archive.ids, self.archive.slices)
                    if rid not in mover_set]
            self.staged_active = self.active.build(self.active.slices + back)
            self.staged_archive = self.archive.build(left)
        self._prove_staged()

    def _prove_staged(self):
        spec = self.spec
        before = {}
        for split in (self.active, self.archive):
            if split is not None:
                before.update(split.slice_map())
        after = {}
        for text in (self.staged_active, self.staged_archive):
            part = Split(text, spec["key"])
            for rid, raw in part.slice_map().items():
                if rid in after:
                    raise Refuse(f"staged output duplicates record '{rid}'")
                after[rid] = raw
        if set(after) != set(before):
            raise Refuse("staged output does not conserve the record ids")
        for rid, raw in before.items():
            if after[rid] != raw:
                raise Refuse(f"staged bytes differ for record '{rid}' - "
                             "a move must be bit-identical")

    def class_counts(self, split):
        counts = {}
        if split is None:
            return counts
        for rid, raw in zip(split.ids, split.slices):
            state = self.states[rid]
            n, b = counts.get(state, (0, 0))
            counts[state] = (n + 1, b + len(raw.encode("utf-8")))
        return counts


def _plans(root, restore_ids=None):
    plans = []
    for spec in LEDGERS:
        if restore_ids is None:
            plans.append(LedgerPlan(root, spec))
        else:
            plans.append(LedgerPlan(root, spec, restore_ids))
    if restore_ids is not None:
        placed = set()
        for plan in plans:
            placed.update(plan.movers)
        unknown = [rid for rid in restore_ids if rid not in placed]
        if unknown:
            raise Refuse("no archived record with id: " + ", ".join(unknown))
    return plans


# ------------------------------------------------------------------
# Transaction: lock, journal, backups, publish, verified rollback.
# ------------------------------------------------------------------


def _verify_capture(root):
    """Both gate verifies as the CLIs print them: exit codes plus a
    per-id state map, the equality the publish must preserve."""
    out = {}
    for script in ("check-census.py", "check-receipts.py"):
        proc = subprocess.run([sys.executable, str(HERE / script), "verify",
                               str(root)], capture_output=True, text=True,
                              timeout=600)
        states = {}
        for line in proc.stdout.splitlines():
            for state in ("CURRENT", "STALE", "BROKEN", "INVALID"):
                if line.startswith(state + ": "):
                    states[line[len(state) + 2:].split(" (")[0]] = state
        out[script] = (proc.returncode, states)
    return out


def _transact(root, plans, op):
    root = Path(root)
    (root / ARCHIVE_DIR_REL).mkdir(parents=True, exist_ok=True)
    lock = root / LOCK_REL
    try:
        fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError:
        raise Refuse("the archive lock is held - another run is live, or a "
                     "crashed one left it; run recover")
    os.write(fd, str(os.getpid()).encode())
    os.close(fd)
    journal = root / JOURNAL_REL
    staged_paths = []
    try:
        if journal.is_file():
            raise Refuse("an unfinished archive transaction exists - "
                         "run recover before any new move")
        moving = [p for p in plans if p.movers]
        if not moving:
            print("nothing to move")
            return 0
        for plan in plans:
            for rel, want in plan.input_hashes.items():
                f = root / rel
                now = _sha(f.read_bytes()) if f.is_file() else None
                if now != want:
                    raise Refuse(f"{rel} changed since planning - "
                                 "refusing to publish over a moved "
                                 "input; re-run the command")
        before_hash = {}
        for plan in plans:
            for rel in (plan.spec["active"], plan.spec["archive"]):
                f = root / rel
                if f.is_file():
                    before_hash[rel] = _sha(f.read_bytes())
        baseline = _verify_capture(root)
        for rel, want in before_hash.items():
            if _sha((root / rel).read_bytes()) != want:
                raise Refuse(f"{rel} changed during planning - refusing "
                             "to publish over a moved input")
        backup_dir = root / BACKUP_REL
        backup_dir.mkdir(parents=True, exist_ok=True)
        journal_files = {}
        for plan in moving:
            for rel, staged in ((plan.spec["active"], plan.staged_active),
                                (plan.spec["archive"], plan.staged_archive)):
                src = root / rel
                if src.is_file():
                    bak = backup_dir / rel.replace("/", "_")
                    shutil.copyfile(src, bak)
                    journal_files[rel] = str(bak.relative_to(root))
                else:
                    journal_files[rel] = None
                stage = src.with_name(src.name + ".s3stage")
                stage.write_text(staged, encoding="utf-8")
                staged_paths.append((stage, src))
        journal.write_text(json.dumps(
            {"op": op, "files": journal_files}, indent=1) + "\n",
            encoding="utf-8")
        for stage, src in staged_paths:
            os.replace(stage, src)
        after = _verify_capture(root)
        if after != baseline:
            _roll_back(root, journal_files)
            raise Refuse("post-publish verifies disagree with the pre-move "
                         "capture - rolled back from the backups")
        journal.unlink()
        shutil.rmtree(backup_dir, ignore_errors=True)
        for plan in moving:
            spec = plan.spec
            active_bytes = len(plan.staged_active.encode("utf-8"))
            archive_bytes = len(plan.staged_archive.encode("utf-8"))
            print(f"{spec['name']}: moved {len(plan.movers)} record(s) "
                  f"({plan.direction}); active -> {active_bytes} B, "
                  f"archive -> {archive_bytes} B")
        return 0
    finally:
        for stage, _ in staged_paths:
            stage.unlink(missing_ok=True)
        lock.unlink(missing_ok=True)


def _roll_back(root, journal_files):
    """Restore every journaled file: its backup copy, or deletion
    when the transaction created the file."""
    for rel, bak_rel in journal_files.items():
        target = root / rel
        if bak_rel is None:
            target.unlink(missing_ok=True)
            continue
        tmp = target.with_name(Path(rel).name + ".s3stage")
        shutil.copyfile(root / bak_rel, tmp)
        os.replace(tmp, target)


# ------------------------------------------------------------------
# Commands
# ------------------------------------------------------------------


def cmd_preview(root):
    plans = _plans(root)
    for plan in plans:
        spec = plan.spec
        print(f"{spec['name']}: {spec['active']}")
        for label, split in (("active", plan.active), ("archive", plan.archive)):
            if split is None:
                print(f"  {label}: (absent)")
                continue
            for state, (n, b) in sorted(plan.class_counts(split).items()):
                print(f"  {label}: {state} {n} record(s), {b} B of slices")
        if plan.movers:
            active_bytes = len(plan.staged_active.encode("utf-8"))
            archive_bytes = len(plan.staged_archive.encode("utf-8"))
            print(f"  plan: move {len(plan.movers)} record(s); active -> "
                  f"{active_bytes} B, archive -> {archive_bytes} B")
        else:
            print("  plan: nothing moves")
    return 0


def cmd_apply(root):
    return _transact(root, _plans(root), "apply")


def cmd_restore(root, ids):
    plans = _plans(root, restore_ids=ids)
    for plan in plans:
        for rid in plan.movers:
            if plan.states[rid] != "CURRENT":
                print(f"warning: '{rid}' computes {plan.states[rid]} on this "
                      "tree, not CURRENT - restoring it changes no verdict")
    return _transact(root, plans, "restore")


def cmd_check(root):
    bad = 0
    for mod in (CENSUS, RECEIPTS):
        found, err = mod.reactivated(root)
        if err:
            raise Refuse(err)
        for rid in found:
            bad += 1
            print(f"REACTIVATED: {rid} is CURRENT on this tree but archived - "
                  "restore it (python3 scripts/archive-ledgers.py restore "
                  f". --id {rid})")
    if bad:
        return 1
    print("no archived record is CURRENT on this tree")
    return 0


def cmd_verify(root):
    bad = 0
    for spec in LEDGERS:
        try:
            plan = LedgerPlan(root, spec)
        except Refuse as e:
            print(f"INVALID PAIR: {spec['name']}: {e}")
            bad += 1
            continue
        archived_current = [rid for rid in (plan.archive.ids if plan.archive else [])
                            if plan.states[rid] == "CURRENT"]
        for rid in archived_current:
            print(f"REACTIVATED: {spec['name']} record '{rid}' is CURRENT "
                  "but archived")
            bad += 1
        total = len(plan.active.ids) + (len(plan.archive.ids) if plan.archive else 0)
        print(f"{spec['name']}: {total} record(s) across the pair, "
              f"{len(plan.active.ids)} active")
    if bad:
        print(f"archive verify: {bad} problem(s)")
        return 1
    print("archive verify: pairs intact, no archived record is CURRENT")
    return 0


def cmd_recover(root):
    root = Path(root)
    journal = root / JOURNAL_REL
    if not journal.is_file():
        if (root / LOCK_REL).is_file():
            (root / LOCK_REL).unlink()
            print("no unfinished transaction; cleared a stale lock")
        else:
            print("no unfinished archive transaction")
        return 0
    data = json.loads(journal.read_text(encoding="utf-8"))
    files = data.get("files", {})
    for rel, bak_rel in files.items():
        if bak_rel is not None and not (root / bak_rel).is_file():
            raise Refuse(f"the backup for {rel} is missing - cannot roll "
                         "back; the journal stays for manual recovery")
    _roll_back(root, files)
    for rel in files:
        print(f"restored {rel} to its pre-transaction state")
    journal.unlink()
    shutil.rmtree(root / BACKUP_REL, ignore_errors=True)
    (root / LOCK_REL).unlink(missing_ok=True)
    return 0


def main():
    ap = argparse.ArgumentParser(description="Archive the gate ledgers' dead records")
    sub = ap.add_subparsers(dest="mode", required=True)
    for name in ("preview", "apply", "check", "verify", "recover"):
        p = sub.add_parser(name)
        p.add_argument("root", type=Path)
    pr = sub.add_parser("restore")
    pr.add_argument("root", type=Path)
    pr.add_argument("--id", action="append", required=True)
    args = ap.parse_args()
    root = args.root.resolve()
    try:
        if args.mode == "preview":
            return cmd_preview(root)
        if args.mode == "apply":
            return cmd_apply(root)
        if args.mode == "restore":
            return cmd_restore(root, args.id)
        if args.mode == "check":
            return cmd_check(root)
        if args.mode == "verify":
            return cmd_verify(root)
        return cmd_recover(root)
    except Refuse as e:
        print("ARCHIVE REFUSED: " + str(e))
        return 1


if __name__ == "__main__":
    sys.exit(main())
