---
id: spider
title: "@happyvertical/spider: Web Crawling and Content Extraction"
sidebar_label: "@happyvertical/spider"
sidebar_position: 9
---

# @happyvertical/spider

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Web scraping and content extraction with multiple adapters for static pages,
DOM-normalized pages, browser-rendered pages, and hosted crawl4ai extraction.

## Overview

The `@happyvertical/spider` package provides a standardized interface for fetching and parsing web content through multiple adapters:

- **Simple**: Fast HTTP requests with cheerio parsing (best for static content)
- **DOM**: HTML processing with happy-dom for complex pages
- **Crawlee**: Full browser automation with Playwright (best for dynamic/JavaScript-heavy content)
- **Crawl4ai**: Remote crawl4ai service adapter for hosted browser extraction

All adapters implement the same `SpiderAdapter` interface and return a standardized `Page` object, making it easy to switch between adapters based on your needs.

## Features

- **Provider Pattern**: Choose the right adapter for your use case
- **Standardized Interface**: All adapters implement `SpiderAdapter`
- **Built-in Caching**: Automatic response caching with configurable expiry via `@happyvertical/cache`
- **Navigation Expansion**: Crawlee adapter automatically clicks accordions/expandable elements to discover hidden links
- **Link Extraction**: All adapters extract absolute links with consistent metadata
- **Download Capture**: Browser-backed adapters expose downloads as `page.downloads`
- **Optional Stealth Runtime**: CloakBrowser can be used as an opt-in external runtime; it is never bundled or enabled by default
- **Error Handling**: Standardized `ValidationError` and `NetworkError` failures from `@happyvertical/utils`
- **TypeScript Support**: Full type definitions for all APIs

## Installation

Requirements:

- Node.js 24 or newer
- ESM runtime support
- `@happyvertical/spider` and its `@happyvertical/*` dependencies published to an npm registry your package manager can read

```bash
# Install with pnpm (recommended)
pnpm add @happyvertical/spider

# Or with npm
npm install @happyvertical/spider

# Or with bun
bun add @happyvertical/spider
```

Browser-backed adapters use Playwright through Crawlee. If your package manager
does not install Playwright browsers automatically, install Chromium once:

```bash
pnpm exec playwright install chromium
```

Optional CloakBrowser support is external. Install it only in environments where you choose to enable `stealth: true` and where you are responsible for the binary/license posture:

```bash
pnpm add cloakbrowser playwright-core
```

## Quick Start

Use `scrapeIndex` when you want links from a page:

```typescript
import { scrapeIndex } from '@happyvertical/spider';

const result = await scrapeIndex('https://example.com/documents');

console.log(result.url);
console.log(result.links.map((link) => link.href));
```

Use `scrapeDocument` when you want extracted document/page text:

```typescript
import { scrapeDocument } from '@happyvertical/spider';

const document = await scrapeDocument('https://example.com/article');

console.log(document.text);
console.log(document.metadata.title);
```

Use `getSpider` when you need direct adapter control:

```typescript
import { getSpider } from '@happyvertical/spider';

const spider = await getSpider({ adapter: 'simple' });
const page = await spider.fetch('https://example.com');

console.log(page.url);      // Final URL after redirects
console.log(page.content);  // HTML content
console.log(page.links);    // Extracted links
```

## Adapters

### Simple Adapter (Fast HTTP)

Best for static HTML content where speed is critical. Uses undici for HTTP requests and cheerio for parsing.

```typescript
const spider = await getSpider({
  adapter: 'simple',
  cacheDir: '.cache/spider', // Optional: custom cache directory
});

const page = await spider.fetch('https://example.com/article', {
  headers: {
    'User-Agent': 'MyBot/1.0 (+https://mysite.com/bot)',
  },
  timeout: 30000,      // 30 second timeout
  cache: true,         // Enable caching
  cacheExpiry: 300000, // 5 minutes cache expiry
});
```

**When to use:**
- Static HTML content
- Fast content extraction needed
- Minimal resource usage required
- Content doesn't rely on JavaScript

### DOM Adapter (happy-dom Processing)

Best for complex HTML that needs normalization but doesn't require a full browser.

```typescript
const spider = await getSpider({
  adapter: 'dom',
  cacheDir: '.cache/spider',
});

const page = await spider.fetch('https://example.com/complex', {
  cache: true,
  cacheExpiry: 600000, // 10 minutes
});
```

**When to use:**
- Malformed HTML that needs normalization
- Complex HTML structures
- DOM manipulation needed
- Still want better performance than full browser

### Crawlee Adapter (Playwright Browser Automation)

Best for JavaScript-heavy pages with dynamic content, AJAX loading, or expandable navigation elements.

```typescript
const spider = await getSpider({
  adapter: 'crawlee',
  headless: true,                                    // Run in headless mode
  userAgent: 'MyBot/1.0 (+https://mysite.com/bot)', // Custom user agent
  cacheDir: '.cache/spider',
});

const page = await spider.fetch('https://example.com/dynamic', {
  timeout: 60000, // 60 seconds for slow sites
  cache: true,
});
```

**When to use:**
- JavaScript-rendered content
- AJAX/dynamic loading
- Pages with accordion/expandable navigation
- Need to interact with page elements
- PDF/document links hidden in collapsed sections

**Navigation Expansion**: The Crawlee adapter automatically:
- Waits for page to be fully loaded (networkidle state)
- Clicks expandable elements (accordions, dropdowns, `<details>` tags)
- Extracts links after each expansion iteration
- Handles `[aria-expanded="false"]`, `.accordion-*`, `<summary>`, etc.
- Runs up to 3 expansion iterations to discover hidden content

### Crawl4ai Adapter (Hosted Browser Extraction)

Best when a remote crawl4ai service should handle browser work and return
AI-friendly markdown alongside HTML.

```typescript
const spider = await getSpider({
  adapter: 'crawl4ai',
  baseUrl: 'http://localhost:11235',
  waitUntil: 'networkidle',
});

const page = await spider.fetch('https://example.com/article', {
  timeout: 60000,
  cache: true,
});

console.log(page.markdown);
```

Set `HAVE_SPIDER_CRAWL4AI_URL` to choose the server URL from the environment.

### Optional CloakBrowser Runtime

CloakBrowser is an explicit opt-in runtime provider for browser-backed paths. `@happyvertical/spider` does not bundle, install, predownload, or enable CloakBrowser by default.

```typescript
const spider = await getSpider({
  adapter: 'crawlee',
  stealth: true,
  cloak: {
    humanize: true,
    executablePath: process.env.CLOAKBROWSER_BINARY_PATH,
    autoUpdate: false,
  },
});
```

When `stealth: true` is set, `spider` dynamically imports `cloakbrowser`. If it is not installed, the adapter throws a setup error telling the caller to install the optional peer dependency. The runtime respects `CLOAKBROWSER_BINARY_PATH`, `CLOAKBROWSER_CACHE_DIR`, and `CLOAKBROWSER_AUTO_UPDATE`.

Recommended deployment defaults:
- Set `CLOAKBROWSER_AUTO_UPDATE=false` in CI and containers.
- Preinstall or mount the CloakBrowser binary only in user-owned or internal environments.
- Treat CloakBrowser binary-license compliance as the caller's responsibility.
- Use stealth only for authorized scraping where you have permission and are respecting target-site terms, rate limits, and robots policies.

### Container Chromium Runtime

Browser-backed adapters use Playwright through Crawlee. In containers where a
system Chromium is already installed, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`
or `HAVE_SPIDER_BROWSER_EXECUTABLE_PATH`, or pass `executablePath` directly:

```typescript
const spider = await getSpider({
  adapter: 'crawlee',
  executablePath: '/usr/bin/chromium',
});
```

## API Reference

### Convenience Functions

#### `scrapeIndex(url, options?): Promise<ScrapeResult>`

Scrapes an index/listing page for links. By default it uses the `basic` scraper
with the `simple` spider adapter.

#### `scrapeDocument(url, options?): Promise<DocumentResult>`

Scrapes an HTML page or document landing page and extracts text, metadata, file
download fields, and document-detection metadata. It supports `basic` and
`tree` scraper strategies.

#### `findDocumentLinks(url, options?): Promise<string[]>`

Scrapes an index page and returns unique URLs that look like documents, including
PDFs, common office formats, CivicWeb, DocuShare, and WordPress Download Manager
links.

### Factory Function

#### `getSpider(options: SpiderAdapterOptions): Promise<SpiderAdapter>`

Creates a spider adapter instance based on the provided options.

**Parameters:**
  - `options`: Configuration object with discriminated union type
  - `adapter`: `'simple' | 'dom' | 'crawlee' | 'crawl4ai'` (required)
  - `cacheDir`: Custom cache directory (optional, default: `.cache/spider`)
  - `cacheProvider`: Cache provider config for file or S3 cache (optional)
  - `headless`: Browser headless mode - Crawlee and Crawl4ai (optional, default: `true`)
  - `userAgent`: Custom user agent - Crawlee and Crawl4ai (optional)
  - `executablePath`: Browser executable path - Crawlee only (optional; falls back to `HAVE_SPIDER_BROWSER_EXECUTABLE_PATH` or `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`)
  - `baseUrl`: Crawl4ai server URL - Crawl4ai only (optional; falls back to `HAVE_SPIDER_CRAWL4AI_URL` or `http://localhost:11235`)
  - `waitUntil`: Crawl4ai wait strategy - Crawl4ai only (optional, default: `networkidle`)
  - `stealth`: Enable optional CloakBrowser runtime - Crawlee only (optional, default: `false`)
  - `cloak`: CloakBrowser runtime settings - Crawlee only (optional)

**Returns:** Promise resolving to `SpiderAdapter` instance

### Adapter Interface

All adapters implement the `SpiderAdapter` interface:

```typescript
interface SpiderAdapter {
  fetch(url: string, options?: FetchOptions): Promise<Page>;
}
```

### Fetch Options

```typescript
interface FetchOptions {
  headers?: Record<string, string>; // Custom HTTP headers
  timeout?: number;                 // Request timeout in ms (default: 30000)
  cache?: boolean;                  // Enable caching (default: true)
  cacheExpiry?: number;             // Cache expiry in ms (default: 300000)
  userAgent?: string;               // Custom user agent string
  maxRequests?: number;             // Maximum number of requests allowed
}
```

### Environment Variable Configuration

The spider package supports configuration via environment variables using the `HAVE_SPIDER_*` pattern:

```bash
# Set timeout (milliseconds)
export HAVE_SPIDER_TIMEOUT=60000

# Set custom user agent
export HAVE_SPIDER_USER_AGENT="MyBot/1.0 (+https://mysite.com/bot)"

# Set maximum requests limit
export HAVE_SPIDER_MAX_REQUESTS=100
```

**Environment variables are merged with user options**, with user-provided values taking precedence:

```typescript
import { getSpider } from '@happyvertical/spider';

// Set environment variable
process.env.HAVE_SPIDER_TIMEOUT = '45000';
process.env.HAVE_SPIDER_USER_AGENT = 'EnvBot/1.0';

const spider = await getSpider({ adapter: 'simple' });

// Uses env var timeout (45000ms) and user agent
await spider.fetch(url);

// User options override env vars
await spider.fetch(url, {
  timeout: 30000, // This takes precedence over env var
});
```

**Supported Environment Variables:**

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `HAVE_SPIDER_TIMEOUT` | number | 30000 | Request timeout in milliseconds |
| `HAVE_SPIDER_USER_AGENT` | string | (see below) | Custom user agent string |
| `HAVE_SPIDER_MAX_REQUESTS` | number | unlimited | Maximum number of requests |
| `HAVE_SPIDER_CRAWL4AI_URL` | string | `http://localhost:11235` | Crawl4ai server URL |
| `HAVE_SPIDER_BROWSER_EXECUTABLE_PATH` | string | unset | Chromium executable for Crawlee-backed paths |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` | string | unset | Playwright-compatible Chromium executable fallback |
| `CLOAKBROWSER_BINARY_PATH` | string | unset | Optional CloakBrowser binary path |
| `CLOAKBROWSER_CACHE_DIR` | string | CloakBrowser default | Optional CloakBrowser cache directory |
| `CLOAKBROWSER_AUTO_UPDATE` | boolean-ish | CloakBrowser default | Set to `false` to disable CloakBrowser auto-update checks |

**Default User Agent** (when not set):
```
Mozilla/5.0 (compatible; HappyVertical Spider/2.0; +https://happyvertical.com/bot)
```

### Page Object

All adapters return a standardized `Page` object:

```typescript
interface Page {
  url: string;              // Final or requested URL, depending on adapter
  content: string;          // Full HTML content
  links: Link[];            // Extracted absolute links with metadata
  raw: any;                 // Adapter-specific raw response data
  markdown?: string;        // Provided by crawl4ai when available
  downloads?: DownloadInfo[]; // Browser-triggered downloads
}
```

## Usage Examples

### Content Extraction with Simple Adapter

```typescript
import { getSpider } from '@happyvertical/spider';
import * as cheerio from 'cheerio';

const spider = await getSpider({ adapter: 'simple' });
const page = await spider.fetch('https://news.example.com/article');

// Parse with cheerio
const $ = cheerio.load(page.content);

const article = {
  title: $('h1').first().text().trim(),
  content: $('article').text().trim(),
  author: $('.author').first().text().trim(),
  publishDate: $('time').attr('datetime'),
};

console.log(article);
```

### PDF Discovery with Crawlee Adapter

Real-world example: Extracting PDF links from a town council website with accordion navigation.

```typescript
import { getSpider } from '@happyvertical/spider';

const spider = await getSpider({
  adapter: 'crawlee',
  headless: true,
  cacheDir: '.cache/council-pdfs',
});

const page = await spider.fetch(
  'https://townofbentley.ca/town-office/council/meetings-agendas/',
  {
    timeout: 60000,  // 60 seconds for slow sites
    cache: true,
    cacheExpiry: 3600000, // 1 hour
  },
);

// Filter PDF links
const pdfLinks = page.links.filter(link =>
  link.href.toLowerCase().endsWith('.pdf')
);

console.log(`Found ${pdfLinks.length} PDF documents`);
pdfLinks.forEach(link => console.log(link.href));
```

**Results from Bentley Town integration test:**
- Successfully extracts PDF links from accordion-based navigation
- Discovers 20+ meeting agendas and minutes (hidden until accordion is expanded)
- Cache provides 10x+ speedup on subsequent fetches

### Fallback Strategy

Use multiple adapters with fallback logic for resilience:

```typescript
import { getSpider } from '@happyvertical/spider';

async function robustFetch(url: string) {
  // Try Crawlee first for best quality
  try {
    const spider = await getSpider({ adapter: 'crawlee' });
    return await spider.fetch(url, { timeout: 30000 });
  } catch (error) {
    console.warn('Crawlee failed, falling back to simple adapter');

    // Fallback to simple adapter
    const spider = await getSpider({ adapter: 'simple' });
    return await spider.fetch(url, { timeout: 15000 });
  }
}

const page = await robustFetch('https://example.com');
```

### Batch Processing with Caching

```typescript
import { getSpider } from '@happyvertical/spider';

const spider = await getSpider({
  adapter: 'simple',
  cacheDir: '.cache/batch-spider',
});

const urls = [
  'https://example.com/page1',
  'https://example.com/page2',
  'https://example.com/page3',
];

// Parallel fetch with caching
const pages = await Promise.all(
  urls.map(url => spider.fetch(url, {
    cache: true,
    cacheExpiry: 600000, // 10 minutes
  }))
);

// Process all pages
pages.forEach(page => {
  console.log(`${page.url}: ${page.links.length} links found`);
});
```

## Error Handling

The package uses standardized error types from `@happyvertical/utils`:

```typescript
import { getSpider } from '@happyvertical/spider';
import { NetworkError, ValidationError } from '@happyvertical/utils';

const spider = await getSpider({ adapter: 'simple' });

try {
  const page = await spider.fetch('https://example.com');
} catch (error) {
  if (error instanceof ValidationError) {
    console.error('Invalid URL or parameters:', error.message);
  } else if (error instanceof NetworkError) {
    console.error('Network request failed:', error.message);
    // Implement retry logic
  } else {
    console.error('Unexpected error:', error);
  }
}
```

**Error Types:**
- `ValidationError`: Invalid URL or parameters
- `NetworkError`: HTTP failures, timeouts, connectivity issues

## Performance Characteristics

### Speed Comparison

Based on real-world testing (Bentley town council website):

| Adapter | First Fetch | Cached Fetch | Use Case |
|---------|-------------|--------------|----------|
| **Simple** | ~200ms | ~5ms | Static HTML, fastest |
| **DOM** | ~500ms | ~5ms | Complex HTML, normalized |
| **Crawlee** | ~8000ms | ~5ms | Dynamic content, JS rendering |

### Caching Strategy

All adapters use `@happyvertical/cache` with file-based storage by default and
optional S3-backed cache configuration:

- **Cache Keys**: Prefixed by adapter type (`simple:`, `dom:`, `crawlee:`, `crawl4ai:`)
- **Default Expiry**: 5 minutes (300,000ms)
- **Storage**: Structured cache files via `@happyvertical/cache`
- **Bypass**: Set `cache: false` in fetch options

**Cache Performance:**
- Cached fetches are typically 10-100x faster than network requests
- Crawlee benefits most (8000ms → ~5ms for Bentley town page)
- Cache files are automatically cleaned up based on TTL

### Resource Usage

| Adapter | Memory | CPU | Disk I/O | Best For |
|---------|--------|-----|----------|----------|
| **Simple** | Low | Low | Minimal | High-volume scraping |
| **DOM** | Medium | Medium | Moderate | Normalized HTML |
| **Crawlee** | High | High | Moderate | Accuracy over speed |

## Document Scraping

`scrapeDocument` supports only two scraper strategies: `basic` and `tree`.

```typescript
import { findDocumentLinks, scrapeDocument } from '@happyvertical/spider';

// Default: basic scraper with the DOM spider
await scrapeDocument('https://example.com/article');

// Browser-backed basic fetch
await scrapeDocument('https://example.com/dynamic-page', {
  scraper: 'basic',
  spider: 'crawlee',
});

// Tree/accordion expansion
await scrapeDocument('https://example.com/meetings', {
  scraper: 'tree',
});

const documentLinks = await findDocumentLinks('https://example.com/meetings');
```

`scraper: 'crawlee'` is not a valid `scrapeDocument` option. Use `scraper: 'basic', spider: 'crawlee'` for a browser-backed fetch, or `scraper: 'tree'` for browser interaction.

## Best Practices

### Ethical Web Scraping

- **Respect robots.txt**: Check and honor robots.txt rules
- **User-Agent**: Use descriptive User-Agent strings that identify your bot
- **Rate Limiting**: Implement delays between requests (not built-in, do this at app level)
- **Caching**: Use caching to minimize redundant requests
- **Error Handling**: Handle HTTP errors gracefully (404, 429, 500, etc.)

Example User-Agent pattern:
```typescript
const spider = await getSpider({
  adapter: 'simple',
});

const page = await spider.fetch(url, {
  headers: {
    'User-Agent': 'MyBot/1.0 (+https://mysite.com/bot-info)',
  },
});
```

### Choosing the Right Adapter

**Use Simple Adapter when:**
- ✅ Content is static HTML
- ✅ Speed is critical
- ✅ Processing many pages
- ✅ Resource constraints exist

**Use DOM Adapter when:**
- ✅ HTML needs normalization
- ✅ Complex DOM structures
- ✅ Moderate performance needs
- ✅ No JavaScript rendering required

**Use Crawlee Adapter when:**
- ✅ JavaScript renders content
- ✅ AJAX/dynamic loading
- ✅ Navigation requires interaction
- ✅ Discovering hidden links (accordions, dropdowns)
- ✅ Accuracy > speed

### Performance Optimization

1. **Enable Caching**: Always use `cache: true` for repeated requests
2. **Set Appropriate Expiry**: Match cache expiry to content update frequency
3. **Use Simple Adapter First**: Try simple before falling back to Crawlee
4. **Batch Requests**: Use `Promise.all()` for parallel fetching
5. **Monitor Timeouts**: Adjust timeout based on site performance

```typescript
// Good: Parallel fetching with appropriate adapter
const spider = await getSpider({ adapter: 'simple' });
const pages = await Promise.all(
  urls.map(url => spider.fetch(url, {
    cache: true,
    cacheExpiry: 600000 // 10 min for news sites
  }))
);

// Better: Cache expiry matches content update frequency
const hourlyContent = { cacheExpiry: 3600000 };  // 1 hour
const dailyContent = { cacheExpiry: 86400000 };  // 24 hours
const staticContent = { cacheExpiry: 604800000 }; // 7 days
```

## Platform Adapter Engine (`@happyvertical/spider/platform`)

A domain-agnostic layer on top of the spider adapters for building crawlers that
recognize a **platform** behind a URL and normalize it into typed items (job
postings, meeting documents, …). It provides an `AdapterRegistry` with two-phase
detection (URL patterns first, then fetched HTML), a `PlatformAdapter` contract,
a config-driven `filterLinks` helper over extracted links, and
`createAdapterContext` to wire adapters to spider's fetch/render.

```typescript
import {
  AdapterRegistry,
  createAdapterContext,
  filterLinks,
  type PlatformAdapter,
} from '@happyvertical/spider/platform';

interface JobPosting {
  title: string;
  url: string;
}

const greenhouse: PlatformAdapter<JobPosting> = {
  type: 'greenhouse',
  name: 'Greenhouse',
  priority: 100,
  detectUrl: (url) =>
    url.includes('greenhouse.io')
      ? { normalizedUrl: url, confidence: 'high', platformName: 'Greenhouse' }
      : null,
  async fetch(source, ctx) {
    const { links } = await ctx.scrapeIndex(source.url);
    return filterLinks(links, { urlContains: ['/jobs/'] }).map((l) => ({
      title: l.text,
      url: l.href,
    }));
  },
};

const registry = new AdapterRegistry<JobPosting>();
registry.register(greenhouse);

// 'simple' suits static boards/APIs like the Greenhouse example below; pass
// { adapter: 'crawlee' } for JavaScript-rendered boards that need
// browser-driven link expansion.
const ctx = await createAdapterContext({ spider: { adapter: 'simple' } });

// Detect + run the matching adapter end-to-end:
const postings = await registry.fetchItems(
  { url: 'https://boards.greenhouse.io/acme' },
  ctx,
);
```

Detection resolves in order: registered `source.type` → each adapter's
`detectUrl` → a single HTML fetch then each adapter's `detectHtml` → an optional
`fallbackType`. A throwing detector or a failed fetch is logged and skipped so
one misbehaving adapter never aborts detection. Consumers keep their own
(persisted) source model and map it to the minimal `AdapterSource`
(`{ url, type?, config? }`) at the boundary.

## Integration with Other @happyvertical Packages

The spider package integrates seamlessly with other SDK packages:

### With @happyvertical/pdf

Extract PDF links and hand them to your document pipeline:

```typescript
import { getSpider } from '@happyvertical/spider';

const spider = await getSpider({ adapter: 'crawlee' });
const page = await spider.fetch('https://example.com/documents');

const pdfLinks = page.links
  .map(link => link.href)
  .filter(href => href.endsWith('.pdf'));

// Fetch or enqueue PDFs with your application-owned download pipeline
for (const pdfUrl of pdfLinks) {
  console.log(pdfUrl);
}
```

### With @happyvertical/ai

Extract content and send to AI for processing:

```typescript
import { getSpider } from '@happyvertical/spider';
import { getAI } from '@happyvertical/ai';
import * as cheerio from 'cheerio';

const spider = await getSpider({ adapter: 'simple' });
const page = await spider.fetch('https://news.example.com/article');

const $ = cheerio.load(page.content);
const articleText = $('article').text();

const ai = await getAI({ type: 'anthropic' });
const summary = await ai.chat([
  { role: 'user', content: `Summarize this article:\n\n${articleText}` }
]);

console.log(summary.content);
```

### With @happyvertical/content

Build a content mirror system:

```typescript
import { getSpider } from '@happyvertical/spider';
import { Contents } from '@happyvertical/content';

const spider = await getSpider({ adapter: 'crawlee' });
const contents = await Contents.create({
  db: { url: 'sqlite:./content.db' }
});

// Mirror a page
const page = await spider.fetch('https://example.com/article');
await contents.mirror({
  url: page.url,
  html: page.content,
  context: 'research_articles',
});
```

## Migration from Earlier APIs

Earlier versions exposed lower-level page-source helpers. The current public API
uses adapter factories and convenience scraping functions.

### Breaking Changes

| Earlier API | Current API | Notes |
|----------------|----------------|-------|
| `fetchPageSource({ url, cheap: true })` | `getSpider({ adapter: 'simple' }).fetch(url)` | Simple HTTP |
| `fetchPageSource({ url, cheap: false })` | `getSpider({ adapter: 'dom' }).fetch(url)` | DOM processing |
| `parseIndexSource(html)` | `page.links` | Links extracted automatically |
| `createWindow()` | Use `happy-dom` directly | No longer exported |
| `processHtml(html)` | Use DOM adapter | Built-in normalization |

### Migration Examples

**Before:**
```typescript
import { fetchPageSource, parseIndexSource } from '@happyvertical/spider';

const html = await fetchPageSource({
  url: 'https://example.com',
  cheap: true,
  cache: true,
});

const links = await parseIndexSource(html);
```

**After:**
```typescript
import { getSpider } from '@happyvertical/spider';

const spider = await getSpider({ adapter: 'simple' });
const page = await spider.fetch('https://example.com', {
  cache: true
});

const links = page.links; // Already extracted
```

**Before:**
```typescript
const html = await fetchPageSource({
  url: 'https://example.com',
  cheap: false,
});
```

**After:**
```typescript
const spider = await getSpider({ adapter: 'dom' });
const page = await spider.fetch('https://example.com');
```

**Browser-backed adapter:**
```typescript
const spider = await getSpider({
  adapter: 'crawlee',
  headless: true,
});

const page = await spider.fetch('https://example.com');
// Automatically expands accordions and discovers hidden links
```

## Dependencies

### Runtime Dependencies

- **@happyvertical/cache** - Caching infrastructure
- **@happyvertical/utils** - Utility functions, error types, validation
- **cheerio** - Server-side HTML parsing (jQuery-like API)
- **happy-dom** - Lightweight DOM implementation for HTML processing
- **undici** - High-performance HTTP client for Node.js
- **crawlee** - Web scraping and browser automation framework
- **playwright** - Browser automation library (Crawlee dependency)

### Optional Peer Dependencies

- **cloakbrowser** - External stealth Chromium runtime, loaded only when `stealth: true`

### Development Dependencies

- **vitest** - Testing framework
- **vite** and **vite-plugin-dts** - ESM build and declaration generation
- **biome** - Linting/formatting
- **typedoc** - Generated API reference documentation

## Development

Common local checks:

```bash
# Lint, typecheck, and build
pnpm lint
pnpm typecheck
pnpm build

# Generate committed API reference docs under docs/api/
pnpm docs:api

# Verify generated API docs are current
pnpm docs:api:check

# Run the test suite with coverage thresholds
pnpm test:coverage
```

The API reference in [docs/api/index.html](docs/api/index.html) is generated
from public JSDoc. Keep public classes, functions, interfaces, and type aliases
documented with comments that are useful to package consumers.

## Testing

The package includes comprehensive unit and integration tests:

```bash
# Run all tests
pnpm test

# Run tests with coverage thresholds
pnpm test:coverage

# Run tests in watch mode
pnpm test:watch

# Run optional live integration tests
RUN_OPTIONAL_TESTS=1 pnpm test

# Run optional CloakBrowser tests
RUN_CLOAKBROWSER_TESTS=1 pnpm test
```

**Integration Test Coverage:**
- ✅ Local fixture coverage for adapter parity, cache behavior, downloads, and document detectors
- ✅ Navigation expansion (accordions, dropdowns)
- ✅ Cache behavior
- ✅ Absolute link handling
- ✅ Error handling and timeouts

## License

This package is licensed under the MIT License. See [LICENSE](LICENSE) for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/happyvertical/spider/issues)
- **Documentation**: This README, [SPEC.md](SPEC.md), and [API reference](docs/api/index.html)
- **Examples**: See `src/**/*.spec.ts`, `src/**/*.optional.test.ts`, and `testdata/`
