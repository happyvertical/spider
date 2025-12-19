import type {
  Crawl4aiAdapterOptions,
  CrawleeAdapterOptions,
  DomAdapterOptions,
  SimpleAdapterOptions,
  SpiderAdapter,
  SpiderAdapterOptions,
} from './types';

/**
 * Type guard for Simple adapter options
 */
function isSimpleOptions(
  options: SpiderAdapterOptions,
): options is SimpleAdapterOptions {
  return options.adapter === 'simple';
}

/**
 * Type guard for DOM adapter options
 */
function isDomOptions(
  options: SpiderAdapterOptions,
): options is DomAdapterOptions {
  return options.adapter === 'dom';
}

/**
 * Type guard for Crawlee adapter options
 */
function isCrawleeOptions(
  options: SpiderAdapterOptions,
): options is CrawleeAdapterOptions {
  return options.adapter === 'crawlee';
}

/**
 * Type guard for Crawl4ai adapter options
 */
function isCrawl4aiOptions(
  options: SpiderAdapterOptions,
): options is Crawl4aiAdapterOptions {
  return options.adapter === 'crawl4ai';
}

/**
 * Factory function to create a spider adapter instance
 *
 * @param options - Configuration options for the spider adapter
 * @returns Promise resolving to a spider adapter that implements SpiderAdapter
 *
 * @example
 * ```typescript
 * // Create simple HTTP adapter
 * const spider = await getSpider({ adapter: 'simple' });
 *
 * // Create DOM processing adapter
 * const domSpider = await getSpider({ adapter: 'dom' });
 *
 * // Create Crawlee headless browser adapter
 * const crawleeSpider = await getSpider({
 *   adapter: 'crawlee',
 *   headless: true,
 *   userAgent: 'MyBot/1.0'
 * });
 *
 * // Create Crawl4ai remote adapter (connects to crawl4ai server)
 * const crawl4aiSpider = await getSpider({
 *   adapter: 'crawl4ai',
 *   baseUrl: 'http://crawl4ai.default.svc:11235'
 * });
 *
 * // Use the adapter
 * const page = await spider.fetch('https://example.com');
 * console.log(page.links);
 * console.log(page.markdown); // Available with crawl4ai adapter
 * ```
 */
export async function getSpider(
  options: SpiderAdapterOptions,
): Promise<SpiderAdapter> {
  if (isSimpleOptions(options)) {
    const { SimpleAdapter } = await import('../adapters/simple.js');
    return new SimpleAdapter(options);
  }

  if (isDomOptions(options)) {
    const { DomAdapter } = await import('../adapters/dom.js');
    return new DomAdapter(options);
  }

  if (isCrawleeOptions(options)) {
    const { CrawleeAdapter } = await import('../adapters/crawlee.js');
    return new CrawleeAdapter(options);
  }

  if (isCrawl4aiOptions(options)) {
    const { Crawl4aiAdapter } = await import('../adapters/crawl4ai.js');
    return new Crawl4aiAdapter(options);
  }

  // This should never happen due to TypeScript's discriminated union
  throw new Error(`Unsupported adapter: ${(options as any).adapter}`);
}
