# Approval policy - Snow Route Beta

This file is the one home for the repository's merge and approval
rules: who may approve what, and what happens once a pull request
is approved. It governs APPROVAL ONLY.

The regression gate itself - what is checked, and how hard - lives
in `.github/workflows/checks.yml` and `DEVELOPMENT_RULES.md` §3.
Nothing in this file restates, softens or bypasses a gate check;
if this file and the gate ever disagree, the gate wins and this
file is the one to fix.

## The rules

- **Everything rides the pull-request gate.** No change lands on
  `main` by direct push, whatever its size or class. Branch
  protection binds administrators the same as everyone else.
- **Green plus clean merges.** A pull request whose required
  checks are all green and whose Codex review is clean merges -
  with auto-merge enabled, GitHub merges it itself once the
  branch is up to date. Nobody merges by hand around the gate.
- **The Beta number is an approval decision.** A pull request
  carries a Beta bump only when its change is one Andrew would
  notice or asked for (a feature, a visual change, a behaviour
  change, a fix for something he has seen). Docs-only and
  machinery-only pull requests merge silently, with no bump; the
  bump rule itself is stated in `DEVELOPMENT_RULES.md` §5.
- **The large-change label.** The PR limit judge
  (`scripts/check-pr-limits.py`) fails a commit adding over ~300
  product lines unless the pull request carries the
  `large-change` label. The label is applied by Andrew or the
  lead ONLY - never self-applied by the change's author or by a
  builder, on any pull request, including their own.
- **Warnings stay warnings until Andrew promotes them.** The
  mixed-scope and fix-up-only rules warn; they become failures
  only on evidence, by Andrew's call, recorded here when it
  happens.
- **Review findings are graded, not obeyed.** A reviewer finding
  becomes a fix only after a genuine attempt to disprove it;
  findings that fail that test close as overstated, with the
  falsifying evidence recorded on the pull request.
- **Fix pushes explain their own undo.** A fix pushed to a pull
  request after its first commit carries a comment stating what
  changed and how to undo it.

## Changing this file

Approval-rule changes are Andrew's call. A pull request that
changes this file states the rule change plainly in its
description; the gate treats it like any other docs change.
