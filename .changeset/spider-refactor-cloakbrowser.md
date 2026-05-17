---
"@happyvertical/spider": major
---

Refactor shared cache, link extraction, browser runner, and document detection paths. Breaking change: `scrapeDocument` now supports only `scraper: 'basic' | 'tree'`; use `scraper: 'basic', spider: 'crawlee'` for browser-backed basic scraping. This also exposes downloads as first-class result fields and adds optional external CloakBrowser support via `stealth: true`.
