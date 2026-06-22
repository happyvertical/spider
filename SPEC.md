# Spider Package Specification

## Overview

`@happyvertical/spider` fetches web pages, extracts links, and turns document-like
pages into normalized results. It exposes high-level convenience functions for
common scraping work and lower-level adapter factories for callers that need
explicit control over the fetch mechanism.

The package is ESM-only and targets Node.js 24 or newer.

## Public Entry Points

### `scrapeIndex(url, options?)`

Scrapes an index/listing page and returns extracted links plus scrape metrics.
It defaults to the `basic` scraper with the `simple` HTTP adapter.

```typescript
import { scrapeIndex } from '@happyvertical/spider';

const result = await scrapeIndex('https://example.com/documents', {
  scraper: { scraper: 'basic', spider: 'dom' },
  scrape: { cache: true, timeout: 30000 },
});

console.log(result.links);
```

### `scrapeDocument(url, options?)`

Scrapes a document page or document landing page and returns text, HTML when
available, download fields when a browser-triggered download occurs, and
document-detection metadata.

Supported document scraper strategies are `basic` and `tree`.

```typescript
import { scrapeDocument } from '@happyvertical/spider';

const doc = await scrapeDocument('https://example.com/article');

console.log(doc.text);
console.log(doc.metadata.title);
```

### `findDocumentLinks(url, options?)`

Scrapes an index page and returns unique document-like URLs. It detects common
file extensions plus WordPress Download Manager, CivicWeb, and DocuShare URL
patterns.

```typescript
import { findDocumentLinks } from '@happyvertical/spider';

const links = await findDocumentLinks('https://example.com/meetings');
```

### `getSpider(options)`

Creates a fetch adapter. This is the lower-level API for callers that need to
choose the fetch/rendering mechanism directly.

```typescript
import { getSpider } from '@happyvertical/spider';

const spider = await getSpider({ adapter: 'simple' });
const page = await spider.fetch('https://example.com');
```

### `getScraper(options)`

Creates a scraper strategy directly. Runtime-supported strategies are `basic`
and `tree`.

```typescript
import { getScraper } from '@happyvertical/spider';

const scraper = await getScraper({
  scraper: 'tree',
  maxIterations: 20,
});

const result = await scraper.scrape('https://example.com/meetings');
```

### `@happyvertical/spider/platform`

Exports a domain-agnostic platform adapter engine:

- `AdapterRegistry`
- `createAdapterContext`
- `filterLinks`
- platform adapter and detection types

Use this subpath when building domain crawlers that detect a platform behind a
URL and normalize items such as job postings or meeting documents.

## Data Models

### `Page`

Returned by spider adapters.

```typescript
interface Page {
  url: string;
  content: string;
  links: Link[];
  raw: unknown;
  markdown?: string;
  downloads?: DownloadInfo[];
}
```

`markdown` is provided by adapters that can return markdown, currently the
`crawl4ai` adapter. `downloads` is populated by browser-backed paths when a URL
triggers a file download instead of rendering a page.

### `Link`

```typescript
interface Link {
  href: string;
  text: string;
  title?: string;
  ariaLabel?: string;
  rel?: string;
  target?: string;
  classes?: string[];
}
```

### `DocumentResult`

```typescript
interface DocumentResult {
  url: string;
  type: string;
  text: string;
  html?: string;
  isDownload?: boolean;
  fileContent?: Uint8Array;
  filename?: string;
  contentType?: string;
  metadata: {
    title?: string;
    description?: string;
    isPdf: boolean;
    complete: boolean;
    strategy: string;
  };
}
```

## Adapters

### `simple`

Fast HTTP fetching with `undici` and link extraction with `cheerio`.

```typescript
await getSpider({
  adapter: 'simple',
  cacheDir: '.cache/spider',
});
```

### `dom`

HTTP fetching plus HTML normalization through `happy-dom`.

```typescript
await getSpider({
  adapter: 'dom',
  cacheDir: '.cache/spider',
});
```

### `crawlee`

Browser-backed fetching through Crawlee and Playwright. It can discover links
hidden behind common accordion/tree controls and can capture browser-triggered
downloads.

```typescript
await getSpider({
  adapter: 'crawlee',
  headless: true,
  executablePath: '/usr/bin/chromium',
});
```

### `crawl4ai`

Remote crawl4ai server integration. It can return markdown in addition to HTML.

```typescript
await getSpider({
  adapter: 'crawl4ai',
  baseUrl: 'http://localhost:11235',
  waitUntil: 'networkidle',
});
```

## Caching

All adapters can cache through `@happyvertical/cache`.

```typescript
type CacheProviderConfig =
  | { provider: 'file' }
  | {
      provider: 's3';
      bucket: string;
      prefix?: string;
      region?: string;
    };
```

Cache keys include adapter-specific inputs such as URL, headers, user agent,
browser executable path, and crawl4ai server URL so different fetch
configurations do not collide.

## Environment Variables

The package reads `HAVE_SPIDER_*` variables through `@happyvertical/utils`.
Explicit options take precedence over environment values.

| Variable | Purpose |
| --- | --- |
| `HAVE_SPIDER_TIMEOUT` | Fetch timeout in milliseconds |
| `HAVE_SPIDER_USER_AGENT` | Default user agent |
| `HAVE_SPIDER_MAX_REQUESTS` | Maximum request count passed through fetch options |
| `HAVE_SPIDER_CRAWL4AI_URL` | Crawl4ai server URL |
| `HAVE_SPIDER_BROWSER_EXECUTABLE_PATH` | Chromium executable for Crawlee-backed paths |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` | Playwright-compatible Chromium executable fallback |

Optional CloakBrowser paths also honor `CLOAKBROWSER_BINARY_PATH`,
`CLOAKBROWSER_CACHE_DIR`, and `CLOAKBROWSER_AUTO_UPDATE`.

## Errors

Adapters throw `ValidationError` for invalid inputs and `NetworkError` for HTTP,
timeout, and connectivity failures. Both classes come from
`@happyvertical/utils`.

```typescript
import { NetworkError, ValidationError } from '@happyvertical/utils';
```

## Non-Goals

- The package does not automatically enforce `robots.txt`. Callers must decide
  policy, rate limits, and authorization at the application boundary.
- The package does not parse PDF text. It detects and captures document links or
  downloads; pass the result to a document/PDF package for full extraction.
- CloakBrowser is optional and external. Callers are responsible for installing
  it and for any binary-license or site-authorization requirements.

## Dependencies

- `@happyvertical/cache`
- `@happyvertical/utils`
- `cheerio`
- `happy-dom`
- `crawlee`
- `playwright`
- `undici`

Optional peer dependency:

- `cloakbrowser`
