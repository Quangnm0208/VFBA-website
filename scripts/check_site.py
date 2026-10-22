#!/usr/bin/env python3
"""Zero-dependency static VBFA deployment validation."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit
import sys

ROOT=Path(__file__).resolve().parents[1]
class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links=[]
        self.has_noindex=False
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag=="meta" and a.get("name")=="robots" and "noindex" in a.get("content",""):
            self.has_noindex=True
        if tag in {"a","link","img","script","source"}:
            value=a.get("src") or a.get("href")
            if value:self.links.append((tag,value))

pages=sorted(ROOT.rglob("*.html"))
assert len(pages)==12,f"Expected 12 HTML pages; found {len(pages)}"
errors=[]
for page in pages:
    parser=Links()
    parser.feed(page.read_text(encoding="utf-8"))
    if not parser.has_noindex:errors.append(f"{page}: missing preview noindex")
    for tag,url in parser.links:
        if url.startswith(("#","mailto:","tel:","javascript:","data:")):continue
        parts=urlsplit(url)
        if parts.scheme or parts.netloc:continue
        route=parts.path
        if not route:continue
        if route.startswith("/"):
            file=ROOT/route.lstrip("/")
        else:file=page.parent/route
        if file.is_dir():file=file/"index.html"
        if not file.exists():
            errors.append(f"{page.relative_to(ROOT)}: broken {tag} path {url}")
for path in ROOT.rglob("*"):
    if path.is_file() and path.suffix.lower() in {".otf",".ttf"}:
        errors.append(f"Unlicensed binary font unexpectedly included: {path}")
robots=ROOT/"robots.txt"
if not robots.is_file() or "Disallow: /" not in robots.read_text():
    errors.append("Review protection robots.txt missing")
print(f"Validated {len(pages)} routes and static asset references.")
if errors:
    print("\n".join(errors[:100]),file=sys.stderr)
    sys.exit(1)
print("PASS: route/asset integrity, review robots, and font license packaging.")
