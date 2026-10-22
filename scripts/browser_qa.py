#!/usr/bin/env python3
"""Real Chromium layout + interaction QA for VBFA static frontend."""
from pathlib import Path
import json, os, sys, time
from playwright.sync_api import sync_playwright

BASE=os.environ.get("QA_BASE_URL","http://127.0.0.1:4173")
OUT=Path("qa-artifacts");OUT.mkdir(exist_ok=True)
issues=[];results=[]
viewports=[320,375,390,430,768,1024,1440,1920]
routes=["/index.html","/tin-tuc/index.html","/tin-tuc/dong-luc-tuong-lai/index.html"]
def fail(context,message):
    issues.append({"context":context,"error":message})
def inspect_page(page,ctx):
    measured=page.evaluate("""() => {
      const d=document.documentElement;
      const w=innerWidth;
      const elements=[...document.querySelectorAll('body *')];
      const offenders=elements.filter(e=>{const style=getComputedStyle(e);if(style.position==='fixed'||style.visibility==='hidden'||style.display==='none'||e.closest('[hidden]'))return false;const r=e.getBoundingClientRect();return r.width>0&&r.left>=-2&&(r.right-w)>7}).slice(0,7).map(e=>({tag:e.tagName,cls:String(e.className||'').slice(0,100),right:Math.round(e.getBoundingClientRect().right)}));
      return {viewport:w,docWidth:d.scrollWidth,bodyWidth:document.body.scrollWidth,offenders};
    }""")
    if measured["docWidth"]>measured["viewport"]+5 or measured["bodyWidth"]>measured["viewport"]+5:
        fail(ctx,"horizontal document overflow: "+json.dumps(measured,ensure_ascii=False))
    bad=page.locator('img').evaluate_all("""els => els.filter(i=>i.offsetParent!==null && (!i.complete || i.naturalWidth===0)).map(i=>i.getAttribute('src'))""")
    if bad:fail(ctx,"broken visible images: "+str(bad))
    return measured
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,args=["--no-sandbox","--disable-dev-shm-usage"])
    for width in viewports:
        for path in routes:
            ctx=f"{width}px {path}"
            context=browser.new_context(viewport={"width":width,"height":920 if width>=768 else 800},device_scale_factor=1,reduced_motion="reduce")
            page=context.new_page()
            page_errors=[]
            page.on("pageerror", lambda e:page_errors.append(str(e)))
            response=page.goto(BASE+path,wait_until="domcontentloaded",timeout=30000)
            page.wait_for_timeout(350)
            if response.status!=200:fail(ctx,f"HTTP {response.status}")
            if not page.title():fail(ctx,"empty document title")
            measured=inspect_page(page,ctx)
            if page_errors:fail(ctx,"JavaScript page errors: "+str(page_errors))
            if width in (390,1440) and path=="/index.html":
                page.screenshot(path=str(OUT/f"homepage-{width}.png"),full_page=True,animations="disabled",timeout=30000)
            results.append({"width":width,"route":path,"http":response.status,"scrollWidth":measured["docWidth"],"overflow":measured["docWidth"]>width+5,"errors":page_errors})
            context.close()
    # Desktop: news filters must actually hide non-matching cards and restore
    page=browser.new_page(viewport={"width":1440,"height":900},reduced_motion="reduce")
    page.goto(BASE+"/index.html",wait_until="domcontentloaded")
    card_count=page.locator('#nh-grid .ncard').count()
    page.locator('[data-filter="policy"]').click()
    visible=page.locator('#nh-grid .ncard:visible').count()
    expected=page.locator('#nh-grid .ncard[data-cat="policy"]').count()
    if visible!=expected: fail("home filter",f"visible {visible}, expected {expected} of {card_count}")
    page.locator('[data-filter="all"]').click()
    if page.locator('#nh-grid .ncard:visible').count()!=card_count:fail("home filter","reset did not restore cards")
    # Search: from nested route, the contact result must resolve to homepage.
    page.goto(BASE+"/tin-tuc/dong-luc-tuong-lai/index.html",wait_until="domcontentloaded")
    page.locator('[data-open="search"]').first.click()
    if page.locator('[data-overlay="search"]').get_attribute("hidden") is not None:fail("search overlay","did not open")
    page.locator('#search-input').fill("Liên hệ")
    href=page.locator('.results a').first.get_attribute('href') if page.locator('.results a').count() else ''
    if 'index.html#contact' not in href:fail("nested search",f"wrong link {href!r}")
    page.keyboard.press("Escape")
    if page.locator('[data-overlay="search"]').get_attribute("hidden") is None:fail("search overlay","Escape did not close")
    page.close()
    # Mobile menu + news filtering.
    page=browser.new_page(viewport={"width":390,"height":844},is_mobile=True,has_touch=True,reduced_motion="reduce")
    page.goto(BASE+"/index.html",wait_until="domcontentloaded")
    try:
        opener=page.locator('[data-open="menu"]').first
        opener.click(timeout=3500)
        if page.locator('[data-overlay="menu"]').get_attribute("hidden") is not None:fail("mobile menu","menu didn't open")
        page.keyboard.press("Escape")
        if page.locator('[data-overlay="menu"]').get_attribute("hidden") is None:fail("mobile menu","Escape didn't close")
    except Exception as e:fail("mobile menu",str(e)[:400])
    page.goto(BASE+"/tin-tuc/index.html",wait_until="domcontentloaded")
    try:
        page.locator('#nq').fill('không-tồn-tại-cho-qa')
        if page.locator('#empty').is_hidden():fail("news search","empty search state not shown")
        page.locator('[data-clear]').first.click()
        if page.locator('#nq').input_value():fail("news search","reset did not clear search field")
    except Exception as e:fail("news search",str(e)[:400])
    browser.close()
(OUT/"result.json").write_text(json.dumps({"results":results,"issues":issues},ensure_ascii=False,indent=2),encoding="utf-8")
print(f"Browser QA: {len(results)} viewport×route checks; {len(issues)} issues.")
for i in issues:print("FAIL:",i["context"],i["error"])
sys.exit(1 if issues else 0)
