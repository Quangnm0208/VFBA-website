#!/usr/bin/env python3
"""Static checks on the Astro build (.vercel/output). No dependencies.

    npm run build && python3 scripts/check_site.py

Verifies what a browser test cannot see cheaply: every URL in the sitemap exists, links and assets resolve
(including #anchors), one <h1> per page, meta/canonical/JSON-LD, alt text, duplicate ids, indexing mode
consistency (noindex vs robots.txt), self-hosted fonts (no third-party hosts), CSP on every page and size budgets.
"""
from __future__ import annotations

import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urldefrag, urlsplit

OUT = Path(__file__).resolve().parents[1] / ".vercel" / "output"
STATIC = OUT / "static"
ALLOWED_HOSTS = {"cdn.sanity.io", "challenges.cloudflare.com", "va.vercel-scripts.com"}
BUDGET = {"image_kb": 260, "html_kb": 120, "css_kb": 90, "js_kb": 120}


class Page(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.h1 = 0
        self.title = ""
        self._in_title = False
        self.meta: dict[str, str] = {}
        self.canonical = ""
        self.refs: list[tuple[str, str]] = []
        self.ids: list[str] = []
        self.imgs_missing_alt = 0
        self.jsonld: list[str] = []
        self._in_ld = False
        self.preloads: list[tuple[str, dict]] = []
        self.lang = ""

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "html":
            self.lang = a.get("lang", "")
        if tag == "h1":
            self.h1 += 1
        if tag == "title":
            self._in_title = True
        if tag == "meta":
            key = a.get("name") or a.get("property")
            if key:
                self.meta[key] = a.get("content", "")
        if tag == "link" and a.get("rel") == "canonical":
            self.canonical = a.get("href", "")
        if tag == "link" and a.get("rel") == "preload":
            self.preloads.append((a.get("href", ""), a))
        if tag == "script" and a.get("type") == "application/ld+json":
            self._in_ld = True
            self.jsonld.append("")
        if tag == "img" and "alt" not in a:
            self.imgs_missing_alt += 1
        if a.get("id"):
            self.ids.append(a["id"])
        for attr in ("href", "src", "srcset"):
            if a.get(attr) and tag in {"a", "link", "img", "script", "source"}:
                value = a[attr].split(",")[0].split(" ")[0] if attr == "srcset" else a[attr]
                self.refs.append((tag, value))

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False
        if tag == "script":
            self._in_ld = False

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        if self._in_ld and self.jsonld:
            self.jsonld[-1] += data


errors: list[str] = []
warnings: list[str] = []
err = errors.append

if not STATIC.is_dir():
    sys.exit("No build output. Run `npm run build` first.")

robots = (STATIC / "robots.txt").read_text(encoding="utf-8")
indexing = "Disallow: /\n" not in robots + "\n" or "Allow: /" in robots
sitemap = (STATIC / "sitemap.xml").read_text(encoding="utf-8")
sitemap_paths = [urlsplit(u).path for u in re.findall(r"<loc>([^<]+)</loc>", sitemap)]

pages = sorted(p for p in STATIC.rglob("*.html"))
parsed: dict[Path, Page] = {}
for path in pages:
    page = Page()
    page.feed(path.read_text(encoding="utf-8"))
    parsed[path] = page


def resolve(url: str, source: Path) -> Path | None:
    parts = urlsplit(url)
    if parts.scheme or parts.netloc:
        return None
    route = parts.path or "/"
    target = STATIC / route.lstrip("/") if route.startswith("/") else (source.parent / route)
    if target.is_dir():
        target = target / "index.html"
    return target


for url_path in sitemap_paths:
    target = STATIC / url_path.lstrip("/")
    if not (target / "index.html").is_file():
        err(f"sitemap lists {url_path} but no page was built")

for path, page in parsed.items():
    rel = path.relative_to(STATIC).as_posix()
    is404 = rel == "404.html"
    if page.lang != "vi":
        err(f"{rel}: <html lang> should be vi, got '{page.lang}'")
    if page.h1 != 1:
        err(f"{rel}: expected exactly one <h1>, found {page.h1}")
    if not page.title.strip():
        err(f"{rel}: missing <title>")
    if not page.meta.get("description"):
        err(f"{rel}: missing meta description")
    if not page.canonical:
        err(f"{rel}: missing canonical link")
    if page.imgs_missing_alt:
        err(f"{rel}: {page.imgs_missing_alt} <img> without alt attribute")
    dupes = {i for i in page.ids if page.ids.count(i) > 1}
    if dupes:
        err(f"{rel}: duplicate ids {sorted(dupes)}")
    for blob in page.jsonld:
        try:
            json.loads(blob)
        except ValueError as e:
            err(f"{rel}: invalid JSON-LD ({e})")
    robots_meta = page.meta.get("robots", "")
    if indexing and not is404 and "noindex" in robots_meta:
        err(f"{rel}: noindex while robots.txt allows indexing")
    if not indexing and "noindex" not in robots_meta:
        err(f"{rel}: robots.txt blocks crawlers but the page is indexable")
    if len([p for p in page.preloads if p[1].get("as") == "font"]) < 3:
        err(f"{rel}: fewer than 3 preloaded fonts")
    for href, attrs in page.preloads:
        if attrs.get("as") == "font" and "crossorigin" not in attrs:
            err(f"{rel}: font preload without crossorigin ({href})")

    for tag, url in page.refs:
        if url.startswith(("mailto:", "tel:", "data:", "javascript:")):
            continue
        parts = urlsplit(url)
        if parts.scheme or parts.netloc:
            host = parts.netloc
            if host and host not in ALLOWED_HOSTS and not url.startswith("https://schema.org"):
                # canonical / og:url point at the site origin; only <link>/<a> to the same origin are expected
                if tag in {"script", "img", "source"} or (tag == "link" and "stylesheet" in url):
                    err(f"{rel}: third-party {tag} {url}")
            continue
        base, frag = urldefrag(url)
        target = resolve(base or "/" + rel.replace("index.html", ""), path) if base else path
        if base and (target is None or not target.exists()):
            err(f"{rel}: broken {tag} {url}")
            continue
        if frag and target and target.suffix == ".html":
            other = parsed.get(target)
            if other is not None and frag not in other.ids:
                err(f"{rel}: anchor #{frag} not found in {target.relative_to(STATIC)}")

# Fonts: self-hosted, Astro-fingerprinted, WOFF2 for the open-licence families.
font_files = list((STATIC / "_astro" / "fonts").glob("*"))
if len(font_files) < 11:
    err(f"expected 11 self-hosted font files in _astro/fonts, found {len(font_files)}")
home = (STATIC / "index.html").read_text(encoding="utf-8")
if re.search(r"fonts\.(googleapis|gstatic)\.com|cdn\.jsdelivr", home):
    err("home page references a third-party font host")

# CSP on every prerendered route (written by the Vercel adapter into config.json)
config = json.loads((OUT / "config.json").read_text(encoding="utf-8"))
csp_routes = {r["src"].rstrip("/") or "/" for r in config["routes"] if "headers" in r and "content-security-policy" in {k.lower() for k in r["headers"]}}
for path in parsed:
    route = "/" + path.relative_to(STATIC).parent.as_posix().strip(".")
    route = route.rstrip("/") or "/"
    if path.name == "404.html":
        route = "/404"
    if route not in csp_routes:
        err(f"no Content-Security-Policy header configured for {route}")
for r in config["routes"]:
    h = {k.lower(): v for k, v in r.get("headers", {}).items()}
    if "content-security-policy" in h and "default-src 'self'" not in h["content-security-policy"]:
        err(f"weak CSP on {r['src']}")

# Size budgets
for f in STATIC.rglob("*"):
    if not f.is_file():
        continue
    kb = f.stat().st_size / 1024
    if f.suffix in {".webp", ".png", ".jpg"} and kb > BUDGET["image_kb"] and "og-default" not in f.name and "favicon-512" not in f.name:
        warnings.append(f"image {f.relative_to(STATIC)} is {kb:.0f} KB (> {BUDGET['image_kb']} KB)")
    if f.suffix == ".html" and kb > BUDGET["html_kb"]:
        warnings.append(f"{f.relative_to(STATIC)} is {kb:.0f} KB (> {BUDGET['html_kb']} KB)")
    if f.suffix == ".css" and kb > BUDGET["css_kb"]:
        warnings.append(f"{f.relative_to(STATIC)} is {kb:.0f} KB (> {BUDGET['css_kb']} KB)")
    if f.suffix == ".js" and kb > BUDGET["js_kb"]:
        warnings.append(f"{f.relative_to(STATIC)} is {kb:.0f} KB (> {BUDGET['js_kb']} KB)")

mode = "indexing ON" if indexing else "indexing OFF (preview mode)"
print(f"Checked {len(pages)} pages, {len(sitemap_paths)} sitemap URLs — {mode}.")
for w in warnings:
    print(f"warning: {w}")
if errors:
    print("\n".join(f"error: {e}" for e in errors[:80]), file=sys.stderr)
    sys.exit(1)
print("PASS: routes, links/anchors, SEO tags, JSON-LD, indexing mode, fonts, CSP, budgets.")
