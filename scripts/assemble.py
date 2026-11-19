#!/usr/bin/env python3
"""Assemble the Snow Route page from its parts (Beta 1.94, audit F-02).

The canonical app source is parts/ - fifteen files, concatenated in a
fixed order into src/tracker-source.html, which scripts/build-pages.py then
stamps (CSP) and publishes as index.html. tracker-source.html is a
GENERATED file: never hand-edit it; edit the part and re-run this script.

    python3 scripts/assemble.py            # write src/tracker-source.html
    python3 scripts/assemble.py --check    # fail if src/ is not what parts/ builds

Recipe (byte-exact, the standing assembly since Beta 1.0's first build):
head.html, then '<script>', then data.js, app1.js, engine.js, pmstyles.js,
app2.js, app3.js, app4.js, whatsnew.js, app5.js, create-cache.js,
create-citydata.js, create-fetch.js, create-packs.js, create-pick.js,
create-save.js, brand-snow.js, then '</script></body></html>'. (The PARTS
list below is the operative enumeration.)

Split (Beta 1.134, maintainability programme B): app4.js used to carry
both the system code (backup, Settings, boot) and the whole create flow.
It is now split at the Beta 1.118 CREATE A ROUTE banner: everything
before the banner stays in app4.js; everything from the banner to the
old file's end (the create flow, plus the boot-tail IIFE that physically
follows it) is the create flow, assembled immediately after app4.js —
since Beta 1.134's programme B split it lives in the six parts/create-*.js
files (cache, citydata, fetch, packs, pick, save).
The shipped script's bytes and order are unchanged by the split.

Splash injection (Beta 1.133, maintainability programme C): head.html does
NOT carry the splash icon as a 281 KB base64 line. It carries the single
placeholder token SPLASH_TOKEN where the payload belongs, and build()
inlines the exact bytes of icon-512.png (base64) at assembly time. The
assembled output is byte-identical to the pre-1.133 recipe — the artwork
is untouched; this is source hygiene, NOT the declined icon re-encode.

Splash artwork (the artwork-only splash): the inlined file is now
splash-artwork-512.png - the app icon's artwork alone (truck, blade,
snow) on a transparent background. Through Beta 1.212 it was the
1.177 pack's foreground rendering cropped tight at 512x423; Beta
1.213 replaces it with the professional icon pack's transparent
foreground rendering (web/icons/foreground-transparent-512.png),
already 512x512 as shipped. icon-512.png remains the PWA / manifest icon; it is no
longer the splash source.

Release stamp (Arch-1, 2026-11-18): the version number lives in exactly
one place - the CHANGELOG.md top entry (`## Beta X.Y`). head.html
carries the placeholder token @@VERSION@@ in the #ver label and
parts/whatsnew.js carries it in WHATSNEW.v; build() stamps the
CHANGELOG-derived version into both at assembly time, the same
placeholder pattern as the splash artwork above. Before this round the
number was hand-written in three source places and pinned as a literal
in about twenty proof files; build-pages.py already enforced the
three-way agreement on every build, so the pins only duplicated the
gate and rolled with every release.

Split (Arch-1): app4.js used to carry the What's New entry mid-file.
The entry now lives in its own data part, parts/whatsnew.js, assembled
at exactly the byte position it occupied inside app4.js; the code that
followed it in app4.js (the About render, the press gate, theme and
home view, service-worker and boot wiring, pack migration, viewport
and keyboard handling, route switch/delete, the boot tail) is
parts/app5.js, assembled immediately after. The shipped script's bytes
and order are unchanged by the split.
"""
import base64
import hashlib
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
PARTS = ["head.html", "data.js", "app1.js", "engine.js", "pmstyles.js",
         "app2.js", "app3.js", "app4.js", "whatsnew.js", "app5.js",
         "create-packs.js", "create-fetch.js", "create-citydata.js",
         "create-cache.js", "create-pick.js", "create-save.js",
         "brand-snow.js"]
OUT = ROOT / "src" / "tracker-source.html"


SPLASH_TOKEN = b"@@SPLASH_ARTWORK_512_B64@@"
ICON = ROOT / "splash-artwork-512.png"

VERSION_TOKEN = b"@@VERSION@@"
CHANGELOG = ROOT / "CHANGELOG.md"


def release_version() -> bytes:
    """The one home of the version number: the CHANGELOG top entry."""
    m = re.search(r"## Beta (\d+\.\d+)",
                  CHANGELOG.read_text(encoding="utf-8"))
    if not m:
        raise SystemExit("assemble: CHANGELOG.md has no '## Beta X.Y' "
                         "entry - the release stamp has no source")
    return ("Beta " + m.group(1)).encode()


def build() -> bytes:
    version = release_version()
    chunks = []
    for name in PARTS:
        p = ROOT / "parts" / name
        if not p.is_file():
            raise SystemExit(f"assemble: missing part {p}")
        data = p.read_bytes()
        if name == "head.html":
            if data.count(SPLASH_TOKEN) != 1:
                raise SystemExit(
                    "assemble: parts/head.html must carry the splash "
                    "placeholder token exactly once (the icon bytes are "
                    "inlined from splash-artwork-512.png at assembly time)")
            if not ICON.is_file():
                raise SystemExit(f"assemble: missing splash icon {ICON}")
            data = data.replace(SPLASH_TOKEN,
                                base64.b64encode(ICON.read_bytes()))
            if data.count(VERSION_TOKEN) != 1:
                raise SystemExit(
                    "assemble: parts/head.html must carry the version "
                    "placeholder token exactly once in the #ver label "
                    "(the release stamp is inlined from CHANGELOG.md at "
                    "assembly time)")
            data = data.replace(VERSION_TOKEN, version)
        if name == "whatsnew.js":
            if data.count(VERSION_TOKEN) != 1:
                raise SystemExit(
                    "assemble: parts/whatsnew.js must carry the version "
                    "placeholder token exactly once in WHATSNEW.v (the "
                    "release stamp is inlined from CHANGELOG.md at "
                    "assembly time)")
            data = data.replace(VERSION_TOKEN, version)
        chunks.append(data)
        if name == "head.html":
            chunks.append(b"<script>\n")
    chunks.append(b"</script></body></html>\n")
    return b"".join(chunks)


def main() -> int:
    data = build()
    digest = hashlib.sha256(data).hexdigest()
    if "--check" in sys.argv:
        if not OUT.is_file() or OUT.read_bytes() != data:
            print("assemble --check: FAIL - src/tracker-source.html is not "
                  "what parts/ assembles to (edit parts/, not the output)")
            return 1
        print(f"assemble --check: OK ({len(data)} bytes, sha256 {digest[:12]}...)")
        return 0
    OUT.write_bytes(data)
    print(f"assemble: wrote {OUT.relative_to(ROOT)} "
          f"({len(data)} bytes, sha256 {digest[:12]}...)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
