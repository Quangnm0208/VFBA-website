# VBFA Marketing UAT Checklist

> Website prototype for review, not an official publication. Record PASS / FAIL / BLOCKED and attach screen captures for failures.

| ID | Area | Test | Status |
|---|---|---|---|
| UAT-01 | Desktop | Page renders at 1440px and 1920px without overflow | NOT TESTED |
| UAT-02 | Tablet | Layout at 768px and 1024px | NOT TESTED |
| UAT-03 | Mobile | Layout at 320/375/390/430px | NOT TESTED |
| UAT-04 | Header | Desktop navigation and anchors operate | NOT TESTED |
| UAT-05 | Mobile | Hamburger opens/closes and focus is manageable | NOT TESTED |
| UAT-06 | News | Filters/tabs transition and retain correct state | NOT TESTED |
| UAT-07 | Contact | Form validation messages appear | NOT TESTED |
| UAT-08 | Contact | Simulation never claims data was sent to VBFA | NOT TESTED |
| UAT-09 | Accessibility | Keyboard navigation, visible focus, reduced motion | NOT TESTED |
| UAT-10 | Assets | Logos, images and fonts load on the live URL | NOT TESTED |
| UAT-11 | Security | Preview is noindexed; no production secrets | NOT TESTED |
| UAT-12 | Browser | Chrome, Edge, Safari, Firefox smoke tests | NOT TESTED |

## Current verified checks
- Local source assembled from the supplied team ZIP.
- Three inline JavaScript blocks: **Node.js syntax check PASS (3/3)**.
- GitHub uploaded `index.html` blob SHA matches the local source.
- Live Vercel URL not yet created; team permission grant is required.

## Feedback template
**Section:**  
**Viewport/device:**  
**Steps to reproduce:**  
**Expected:**  
**Actual:**  
**Screenshot:**  
**Priority:** P0 / P1 / P2

**P0:** prevents opening/reviewing the website. **P1:** materially harms a key interaction. **P2:** cosmetic or lower-impact issue.
