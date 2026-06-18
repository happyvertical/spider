import { scrapeIndex } from '../scrapeIndex.js';
import { getSpider } from '../shared/factory.js';
import type { ScraperOptions, SpiderAdapterOptions } from '../shared/types.js';
import type { AdapterContext } from './types.js';

export interface CreateAdapterContextOptions {
  /** Spider adapter to back fetches with ('simple' static, 'crawlee' for JS). */
  spider?: SpiderAdapterOptions;
  /** Optional AI client passed through to adapter discoverOptions. */
  ai?: unknown;
  /** Optional structured logger. */
  log?: AdapterContext['log'];
}

/**
 * Mirror the chosen spider adapter (and its relevant knobs) into the basic
 * scraper options so `scrapeIndex` uses the same adapter as `fetchPage` — a
 * `crawlee` context expands JS-rendered boards instead of silently falling back
 * to the static default.
 */
function scraperOptionsFor(spider: SpiderAdapterOptions): ScraperOptions {
  return {
    scraper: 'basic',
    spider: spider.adapter,
    ...('cacheDir' in spider ? { cacheDir: spider.cacheDir } : {}),
    ...('cacheProvider' in spider
      ? { cacheProvider: spider.cacheProvider }
      : {}),
    ...('headless' in spider ? { headless: spider.headless } : {}),
    ...('userAgent' in spider ? { userAgent: spider.userAgent } : {}),
    ...('baseUrl' in spider ? { baseUrl: spider.baseUrl } : {}),
    ...('stealth' in spider ? { stealth: spider.stealth } : {}),
    ...('executablePath' in spider
      ? { executablePath: spider.executablePath }
      : {}),
    ...('cloak' in spider ? { cloak: spider.cloak } : {}),
  };
}

/**
 * Build an {@link AdapterContext} backed by @happyvertical/spider. Pick the
 * spider adapter for the job — `simple` for static HTML, `crawlee` for
 * JavaScript-rendered boards that need browser-driven link expansion.
 */
export async function createAdapterContext(
  options: CreateAdapterContextOptions = {},
): Promise<AdapterContext> {
  const spiderOptions = options.spider ?? { adapter: 'simple' };
  const spider = await getSpider(spiderOptions);
  const scraperOptions = scraperOptionsFor(spiderOptions);
  return {
    fetchPage: (url, fetchOptions) => spider.fetch(url, fetchOptions),
    scrapeIndex: (url, scrapeOptions) =>
      scrapeIndex(url, { scraper: scraperOptions, scrape: scrapeOptions }),
    ai: options.ai,
    log: options.log,
  };
}
