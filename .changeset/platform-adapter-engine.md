---
"@happyvertical/spider": minor
---

Add a domain-agnostic platform-adapter engine at the `@happyvertical/spider/platform` subpath. It provides a generic `AdapterRegistry<TItem>` with two-phase detection (URL patterns first, then fetched HTML), a `PlatformAdapter` contract, a config-driven `filterLinks` helper, and `createAdapterContext` to wire adapters to spider's fetch/render adapters. Consumers register per-platform adapters that normalize a source into typed items (job postings, meetings, …) — the heavier scraping/registry pattern factored out of app-level crawlers.
