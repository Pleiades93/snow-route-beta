# Ledger archive - the receipts and census history home

The two gate ledgers (`tests/mutation-receipts.json` and
`tests/sibling-census.json`) are append-only history. Most records
in them are STALE or BROKEN on any given tree - their evidence was
real, but the files they pin have moved on. `scripts/archive-ledgers.py`
moves those dead records into `tests/archive/` under the same
ledger names, so the active ledgers hold only records that can
still judge a push. History is preserved, readable, and unable to
change a gate verdict.

## The rules

- **Records move as raw byte slices.** The tool splices each
  record's original bytes out of the active file and into the
  archive file - never a JSON round-trip - so a moved record is
  bit-identical to what the gates read before. Within each file,
  record order is preserved; moved records append to the archive
  in their original relative order.
- **The move criterion is computed state only**, taken from the
  gates' own classifiers (`record_state`, `receipt_state`):
  STALE and BROKEN move; CURRENT never moves; an INVALID record
  in an active ledger refuses the whole run. There is no date,
  age or id-range selection.
- **The publish is transactional:** a lock, staged outputs proven
  before replacement (id conservation, per-id byte identity),
  a journal with backups, per-file atomic replacement, both gate
  verifies re-run and compared against the pre-move capture, and
  rollback on any mismatch. A leftover journal refuses later runs
  until `archive-ledgers.py recover` rolls the transaction back.

## Who reads what

- **Gates judge the active ledger only.** The census gate and the
  receipts coverage check never read the archive: an archived
  record, even a CURRENT one, covers nothing. The archive cannot
  launder coverage.
- **History readers read active-then-archive:** both `verify`
  commands, both `issue` commands' id-uniqueness checks (an id
  that exists only in the archive stays reserved), and census
  `--carry`. New records are always written to the active ledger.
- **The review seat** resolves a receipt id active-then-archive
  when replaying its stored mutation evidence.
- `check-pr-limits.py` treats the two archive files like the
  active ledgers: machine-written lines, exempt from the line
  and comment limits.

## Reactivation

STALE is tree-relative: a revert or a re-pin can make an archived
record CURRENT again. Both gates scan the archive before answering
(the census gate on a parts-changing push, the receipts gate on a
check/judge-changing push) and refuse with the record's id and the
restore command when one computes CURRENT:

```
python3 scripts/archive-ledgers.py restore . --id <id>
```

`restore` moves the named records back to the active ledger
through the same transaction. `archive-ledgers.py check` reports
reactivated records on demand. Restored records append at the end
of the active ledger: order within each file is preserved, but
the original interleaving across the two homes is not
reconstructed - no gate reads order across homes, and coverage
is a set property in both gates.

## Commands

```
python3 scripts/archive-ledgers.py preview .   # the plan; writes nothing
python3 scripts/archive-ledgers.py apply .     # the move, transactionally
python3 scripts/archive-ledgers.py restore . --id <id> [...]
python3 scripts/archive-ledgers.py check .     # archived-but-CURRENT report
python3 scripts/archive-ledgers.py verify .    # pair integrity
python3 scripts/archive-ledgers.py recover .   # roll back a torn transaction
```
