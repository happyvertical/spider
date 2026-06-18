import {
  isUrl,
  loadEnvConfig,
  NetworkError,
  ValidationError,
} from '@happyvertical/utils';
import {
  resolveBrowserExecutablePath,
  runSinglePageWithBrowser,
} from '../shared/browser-runner';
import { CacheManager, createCacheKey } from '../shared/cache';
import { extractBrowserLinks } from '../shared/links';
import type {
  CloakBrowserOptions,
  CrawleeAdapterOptions,
  FetchOptions,
  Link,
  Page,
  SpiderAdapter,
} from '../shared/types';

/**
 * Crawlee headless browser adapter for fetching web pages.
 * Browser setup, downloads, timeouts, and optional CloakBrowser runtime wiring
 * are delegated to the shared browser runner.
 */
export class CrawleeAdapter implements SpiderAdapter {
  private cacheManager: CacheManager;
  private cacheDir: string;
  private headless: boolean;
  private userAgent?: string;
  private stealth?: boolean;
  private executablePath?: string;
  private cloak?: CloakBrowserOptions;

  constructor(options: CrawleeAdapterOptions) {
    this.cacheDir = options.cacheDir || '.cache/spider';
    this.cacheManager = new CacheManager(this.cacheDir, options.cacheProvider);
    this.headless = options.headless !== false;
    this.userAgent = options.userAgent;
    this.stealth = options.stealth;
    this.executablePath = options.executablePath;
    this.cloak = options.cloak;
  }

  private getCacheKey(
    url: string,
    headers: Record<string, string>,
    effectiveUserAgent: string | undefined,
  ): string {
    const resolvedExecutablePath = resolveBrowserExecutablePath(
      this.executablePath,
      { includeEnvironment: !this.stealth },
    );

    return createCacheKey('crawlee', url, [
      this.headless,
      effectiveUserAgent,
      headers,
      this.stealth,
      resolvedExecutablePath,
      this.cloak?.humanize,
      this.cloak?.executablePath,
      this.cloak?.autoUpdate,
    ]);
  }

  /**
   * Expand navigation/accordion elements and extract all links from a page.
   *
   * This method is useful for pages with hidden content behind expandable
   * elements. It preserves the public helper while relying on shared link
   * normalization for the final extraction.
   */
  async extractLinks(page: any): Promise<Link[]> {
    const expandedLinks = await page.evaluate(() => {
      const linkMap = new Map<string, Link>();
      const clickedElements = new Set<Element>();

      const extractLinks = () => {
        document.querySelectorAll('a[href]').forEach((anchor) => {
          const link = anchor as HTMLAnchorElement;
          const href = link.href;

          if (linkMap.has(href)) {
            return;
          }

          const className =
            typeof link.className === 'string' ? link.className : undefined;

          linkMap.set(href, {
            href,
            text: link.textContent?.trim() || '',
            title: link.title || undefined,
            ariaLabel: link.getAttribute('aria-label') || undefined,
            rel: link.rel || undefined,
            target: link.target || undefined,
            classes: className
              ? className.split(/\s+/).filter((className) => className.trim())
              : undefined,
          });
        });
      };

      const clickAndWait = (element: Element) => {
        if (clickedElements.has(element)) return false;

        try {
          (element as HTMLElement).click();
          clickedElements.add(element);
          return true;
        } catch {
          return false;
        }
      };

      extractLinks();

      for (let iteration = 0; iteration < 3; iteration++) {
        let clickedCount = 0;
        const semanticSelectors = [
          'button[aria-expanded="false"]',
          '[role="button"][aria-expanded="false"]',
          '.accordion-header',
          '.accordion-button',
          'summary',
          '[data-toggle]',
        ];

        for (const selector of semanticSelectors) {
          document.querySelectorAll(selector).forEach((el) => {
            if (clickAndWait(el)) clickedCount++;
          });
        }

        document.querySelectorAll('a[href="#"]').forEach((link) => {
          const text = link.textContent?.trim() || '';
          if (text.toLowerCase().includes('skip')) return;
          if (text.toLowerCase().includes('menu')) return;
          if (text.length > 100) return;

          if (clickAndWait(link)) clickedCount++;
        });

        extractLinks();

        if (clickedCount === 0) break;
      }

      return Array.from(linkMap.values());
    });

    const finalLinks = await extractBrowserLinks(page);
    const linksByHref = new Map<string, Link>();

    for (const link of [...expandedLinks, ...finalLinks]) {
      if (!linksByHref.has(link.href)) {
        linksByHref.set(link.href, link);
      }
    }

    return Array.from(linksByHref.values());
  }

  /**
   * Fetches a web page using a headless browser and returns a standardized Page.
   */
  async fetch(url: string, options?: FetchOptions): Promise<Page> {
    const config = loadEnvConfig<FetchOptions>(options || {}, {
      packageName: 'spider',
      schema: {
        timeout: 'number',
        maxRequests: 'number',
        userAgent: 'string',
      },
    });

    const {
      headers = {},
      timeout = 30000,
      cache = true,
      cacheExpiry = 300000,
      userAgent: envUserAgent,
    } = config;

    const effectiveUserAgent = this.userAgent || envUserAgent;

    if (!url || typeof url !== 'string') {
      throw new ValidationError('URL is required and must be a string', {
        url,
      });
    }

    if (!isUrl(url)) {
      throw new ValidationError('Invalid URL format', { url });
    }

    const cacheKey = this.getCacheKey(url, headers, effectiveUserAgent);

    if (cache) {
      const cached = await this.cacheManager.get<Page>(cacheKey);

      if (cached) {
        return cached;
      }
    }

    try {
      const pageData = await runSinglePageWithBrowser<Page>({
        url,
        cacheDir: this.cacheDir,
        headless: this.headless,
        timeout,
        headers,
        userAgent: effectiveUserAgent,
        stealth: this.stealth,
        executablePath: this.executablePath,
        cloak: this.cloak,
        onPage: async ({ page, request, downloads, sleep }) => {
          await page.waitForLoadState('networkidle', { timeout });
          await sleep(500);

          const links = await this.extractLinks(page);
          const content = await page.content();
          const finalUrl = page.url();

          return {
            url: finalUrl,
            content,
            links,
            downloads: downloads.length > 0 ? downloads : undefined,
            raw: {
              requestUrl: request.url,
              loadedUrl: finalUrl,
            },
          };
        },
        onDownload: ({ request, downloads }) => ({
          url: request.url,
          content: '',
          links: [],
          downloads,
          raw: {
            requestUrl: request.url,
            loadedUrl: request.url,
            isDownload: true,
          },
        }),
      });

      if (cache) {
        await this.cacheManager.set(cacheKey, pageData, cacheExpiry);
      }

      return pageData;
    } catch (error) {
      if (error instanceof NetworkError || error instanceof ValidationError) {
        throw error;
      }

      if (error instanceof Error) {
        throw new NetworkError(
          `Failed to fetch page with Crawlee: ${error.message}`,
          {
            url,
            error: error.message,
            stack: error.stack,
          },
        );
      }

      throw error;
    }
  }
}
