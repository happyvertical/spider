---
"@happyvertical/spider": minor
---

Refactor shared cache, link extraction, browser runner, and document detection paths. `scrapeDocument` now supports only `scraper: 'basic' | 'tree'`, exposes downloads as first-class result fields, and adds optional external CloakBrowser support via `stealth: true`.
