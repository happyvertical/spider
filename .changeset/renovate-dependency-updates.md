---
"@happyvertical/spider": patch
---

Update dependencies (combined Renovate batch):

- **Runtime:** undici 7 → 8, `@happyvertical/cache` & `@happyvertical/utils` → ^0.74.0
- **Build/dev toolchain:** vite 7 → 8, vite-plugin-dts 4 → 5, typescript 5 → 6, commitlint 19 → 21, `@types/node` → 24.13.2
- **Tooling:** pnpm 10 → 11 (`packageManager`), `actions/cache` v4 → v5

`playwright` is intentionally held at `~1.58.2` to match the CI runner's baked Chromium build.
