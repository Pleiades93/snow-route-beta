#!/usr/bin/env python3
"""Validate a staged Firebase public tree against its own references.

Issue #177: the manual Firebase deploy staged a hand-kept file list
whose count assertion passed while four referenced icons (favicon.svg,
icon-16.png, icon-32.png, icon-1024.png) were missing from the publish
tree. A count cannot see a missing reference. This check compares the
staged set against the referenced set directly: every local asset the
staged page and manifest name must exist inside the staged tree.

References collected:
- href/src attribute values in the staged index.html (local paths
  only - absolute URLs, data URIs, fragments and template
  placeholders are skipped; query and fragment suffixes stripped);
- the serviceWorker.register('...') argument in index.html;
- every icons[].src in the staged manifest.json.

Usage: python3 scripts/validate-staged-tree.py <staged-public-dir>
Exit 0 when every local reference resolves; exit 1 naming each
missing reference otherwise.
"""

import json
import os
import re
import sys


def local_ref(value):
    """Return the local path a reference names, or None when the
    reference is not a local file (absolute URL, data URI, fragment,
    template placeholder, or empty after stripping)."""
    if not value or value.startswith(("http://", "https://", "data:",
                                       "#", "${", "//")):
        return None
    path = value.split("?")[0].split("#")[0]
    return path or None


def main():
    if len(sys.argv) != 2:
        print("usage: validate-staged-tree.py <staged-public-dir>")
        return 2
    root = sys.argv[1]
    index = os.path.join(root, "index.html")
    if not os.path.isfile(index):
        print(f"staged tree has no index.html at {index}")
        return 1
    html = open(index, encoding="utf-8").read()
    refs = set()
    for value in re.findall(r'(?:href|src)="([^"]+)"', html):
        ref = local_ref(value)
        if ref:
            refs.add(ref)
    for value in re.findall(r"serviceWorker\.register\('([^']+)'\)", html):
        ref = local_ref(value)
        if ref:
            refs.add(ref)
    manifest_path = os.path.join(root, "manifest.json")
    if os.path.isfile(manifest_path):
        manifest = json.load(open(manifest_path, encoding="utf-8"))
        for icon in manifest.get("icons", []):
            ref = local_ref(icon.get("src", ""))
            if ref:
                refs.add(ref)
    missing = sorted(r for r in refs
                     if not os.path.isfile(os.path.join(root, r)))
    if missing:
        print("staged tree is missing referenced assets:")
        for ref in missing:
            print(f"  {ref}")
        return 1
    print(f"staged-tree validation: all {len(refs)} local references "
          "resolve inside the staged tree.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
