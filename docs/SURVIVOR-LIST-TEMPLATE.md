# Survivor list

**Surface** — _Shared surface this round touches_

**Cut** — _Behaviour being removed, ported or restructured_

Add one row per behaviour that must still be true after the cut.

| Behaviour that must survive | Named existing check (drive, proof or selftest) | Case text the check carries | Where the check reads the behaviour |
| --- | --- | --- | --- |
| _Behaviour in plain words_ | _Check file_ | _The case ID or assertion text, verbatim_ | _Assertion location and what it reads_ |

**Completion rule** — Write this list before the first cut. The PR
is not complete while any survivor lacks a named check.

**Filed as a gate record, not prose** — The list is recorded in
`tests/survivor-lists.json` with `scripts/check-survivors.py issue`
(TESTING.md rule 6). The case text is a needle: it must occur,
verbatim, in the named check file, or the record cannot be issued
and cannot certify a push. The record pins the parts files it
names, so it is issued on the frozen tree, after the cut lands.
A round whose parts change removes, ports and restructures
nothing records `issue-no-cut` with its reason instead of a list.
