import {
  resolveBrowserExecutablePath,
  runSinglePageWithBrowser,
} from '../shared/browser-runner';
import { CacheManager, createCacheKey } from '../shared/cache';
import { extractBrowserLinks } from '../shared/links';
import type {
  Link,
  ScrapeMetrics,
  ScrapeOptions,
  ScrapeResult,
  Scraper,
  ScraperStrategy,
  ScraperType,
  TreeScraperOptions,
} from '../shared/types';

const DEFAULT_MAX_ITERATIONS = 10;
const DEFAULT_CLICK_DELAY = 100;
const DEFAULT_RATE_LIMIT = 1000;

/**
 * Tree scraper - expand hierarchical tree structures to reveal hidden content
 *
 * This scraper handles pages with nested, hierarchical content structures
 * like directory browsers, file trees, or multi-level accordions. It
 * systematically expands tree nodes to reveal all nested content.
 *
 * Optimized for deep hierarchical structures like jQuery File Tree where
 * clicking one element reveals new expandable elements (years → months → files).
 *
 * @example
 * ```typescript
 * const scraper = new TreeScraper({
 *   scraper: 'tree',
 *   maxIterations: 20,
 *   clickDelay: 500,
 *   customSelectors: ['.my-tree-node'],
 *   handleExclusive: true
 * });
 *
 * const result = await scraper.scrape('https://example.com/meetings');
 * console.log(`Found ${result.links.length} links after ${result.metrics.interactionCount} clicks`);
 * console.log(`Confidence: ${result.strategy.confidence}`);
 * ```
 */
export class TreeScraper implements Scraper {
  private options: TreeScraperOptions;
  private cacheDir: string;
  private cacheManager: CacheManager;

  // Default tree/expandable element selectors
  // Ordered from most specific (tree structures) to most generic (buttons)
  // This prioritizes file/directory trees over navigation menus
  private readonly DEFAULT_SELECTORS = [
    // Specific tree/directory structures (highest priority)
    'li.directory.collapsed > a', // jqueryFileTree and similar
    'li.collapsed > a', // Generic collapsed list items
    'details summary', // HTML5 details/summary

    // Accordion-specific triggers
    '[data-accordion-trigger]',
    '[data-toggle="collapse"]',
    '.accordion-button',
    '.expand-button',

    // Generic expandable buttons (lowest priority - often nav menus)
    '[role="button"][aria-expanded]',
    'button[aria-expanded]',
  ];

  constructor(options: TreeScraperOptions) {
    this.options = {
      maxIterations: DEFAULT_MAX_ITERATIONS,
      clickDelay: DEFAULT_CLICK_DELAY,
      handleExclusive: true,
      headless: true,
      ...options,
    };
    this.cacheDir = options.cacheDir || '.cache/spider';
    this.cacheManager = new CacheManager(this.cacheDir, options.cacheProvider);
  }

  /**
   * Get the scraper type
   */
  getType(): ScraperType {
    return 'tree';
  }

  /**
   * Generate a cache key from a URL and scrape options
   *
   * Cache key includes browser and expansion options that can change which
   * hidden links are revealed.
   */
  private getCacheKey(url: string, options?: ScrapeOptions): string {
    const maxIterations =
      this.options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    const clickDelay = this.options.clickDelay ?? DEFAULT_CLICK_DELAY;
    const rateLimit = this.options.rateLimit ?? DEFAULT_RATE_LIMIT;
    const resolvedExecutablePath = resolveBrowserExecutablePath(
      this.options.executablePath,
      { includeEnvironment: !this.options.stealth },
    );

    return createCacheKey('tree', url, [
      maxIterations,
      clickDelay,
      rateLimit,
      this.options.customSelectors,
      this.options.handleExclusive,
      this.options.headless,
      this.options.userAgent,
      options?.headers,
      options?.timeout,
      this.options.stealth,
      resolvedExecutablePath,
      this.options.cloak?.humanize,
      this.options.cloak?.executablePath,
      this.options.cloak?.autoUpdate,
    ]);
  }

  /**
   * Extract all links from the current page state
   */
  private async extractCurrentLinks(page: any): Promise<Link[]> {
    return extractBrowserLinks(page);
  }

  /**
   * Extract links from a page by expanding hierarchical tree structures
   *
   * This method uses Playwright's native click() to properly trigger events.
   * It systematically clicks expandable tree nodes and extracts links after each click.
   * Optimized for deep hierarchical trees (e.g., years → months → files).
   *
   * @param page - Playwright page instance
   * @returns Promise resolving to array of links and interaction count
   */
  private async extractLinksWithTreeExpansion(
    page: any,
  ): Promise<{ links: Link[]; interactionCount: number }> {
    const selectors = [
      ...this.DEFAULT_SELECTORS,
      ...(this.options.customSelectors || []),
    ];

    const linkMap = new Map<string, Link>();
    let interactionCount = 0;
    const clickedSelectors = new Set<string>();

    // Extract initial links
    const initialLinks = await this.extractCurrentLinks(page);
    for (const link of initialLinks) {
      linkMap.set(link.href, link);
    }

    // Keep expanding until no more expandable elements are found
    // This handles deep hierarchical structures (trees) by continuously
    // re-querying for newly revealed expandable elements
    let consecutiveEmptyIterations = 0;
    const maxConsecutiveEmpty = 2; // Stop after 2 iterations with no clicks

    for (
      let iteration = 0;
      iteration < (this.options.maxIterations ?? DEFAULT_MAX_ITERATIONS);
      iteration++
    ) {
      let clickedInIteration = 0;

      // Try each selector, clicking ALL matching elements we find
      for (const selector of selectors) {
        // Re-query DOM to find newly revealed elements
        const elements = await page.$$(selector);

        for (const element of elements) {
          // Generate a unique identifier for this element
          const elementId = await element.evaluate(
            (el: Element, sel: string) => {
              // Create a unique path for this element
              const getPath = (el: Element): string => {
                if (el.id) return `#${el.id}`;
                const parent = el.parentElement;
                if (!parent) return el.tagName;
                const index = Array.from(parent.children).indexOf(el);
                return `${getPath(parent)} > ${el.tagName}:nth-child(${index + 1})`;
              };
              return `${sel}::${getPath(el)}`;
            },
            selector,
          );

          // Skip if already clicked
          if (clickedSelectors.has(elementId)) {
            continue;
          }

          // Check if element is visible
          const isVisible = await element.isVisible();
          if (!isVisible) {
            continue;
          }

          // Click using jQuery if available (for jqueryFileTree), otherwise native DOM click
          // Playwright's element.click() dispatches synthetic events that don't trigger jQuery handlers
          try {
            // Use jQuery click if available, otherwise fall back to native click
            // jqueryFileTree specifically requires jQuery's event system
            await element.evaluate((el: Element) => {
              const win = window as any;
              if (typeof win.jQuery !== 'undefined') {
                win.jQuery(el).click();
              } else {
                (el as HTMLElement).click();
              }
            });

            clickedSelectors.add(elementId);
            interactionCount++;
            clickedInIteration++;

            // Wait for AJAX content to load - jqueryFileTree uses async loading
            await page.waitForTimeout(
              this.options.clickDelay ?? DEFAULT_CLICK_DELAY,
            );

            // Extract links after each click (not just at the end)
            const newLinks = await this.extractCurrentLinks(page);
            for (const link of newLinks) {
              linkMap.set(link.href, link);
            }

            // After clicking, immediately re-query this selector to find
            // any newly revealed elements at the same level or deeper
            // This enables proper hierarchical expansion
            break; // Break to re-query and find newly revealed elements
          } catch {
            // Click failed, continue to next element
          }
        }

        // If we clicked something with this selector, restart selector loop
        // to check for newly revealed elements
        if (clickedInIteration > 0) {
          break;
        }
      }

      // Track consecutive iterations with no clicks
      if (clickedInIteration === 0) {
        consecutiveEmptyIterations++;
        if (consecutiveEmptyIterations >= maxConsecutiveEmpty) {
          // No elements found for multiple iterations, we're done
          break;
        }
      } else {
        // Reset counter when we click something
        consecutiveEmptyIterations = 0;
      }
    }

    return {
      links: Array.from(linkMap.values()),
      interactionCount,
    };
  }

  /**
   * Scrape content from a URL by expanding hierarchical tree structures
   *
   * This method launches a headless browser, navigates to the URL,
   * and systematically expands all tree nodes to extract all hidden links.
   * Optimized for deep hierarchical structures like directory browsers.
   *
   * @param url - The URL to scrape
   * @param options - Optional scrape configuration
   * @returns Promise resolving to scrape results with metrics
   */
  async scrape(url: string, options?: ScrapeOptions): Promise<ScrapeResult> {
    const startTime = Date.now();
    const timeout = options?.timeout || 30000;
    const cache = options?.cache !== false; // Default to true
    const cacheExpiry = options?.cacheExpiry || 300000; // 5 minutes default

    // Check cache if enabled
    if (cache) {
      const cacheKey = this.getCacheKey(url, options);
      const cached = await this.cacheManager.get<ScrapeResult>(cacheKey);

      if (cached) {
        return cached;
      }
    }

    // Rate limiting: delay before page load to be respectful to servers
    const rateLimit =
      this.options.rateLimit !== undefined
        ? this.options.rateLimit
        : DEFAULT_RATE_LIMIT;
    if (rateLimit > 0) {
      await new Promise((resolve) => setTimeout(resolve, rateLimit));
    }

    try {
      const scrapeResult = await runSinglePageWithBrowser<ScrapeResult>({
        url,
        cacheDir: this.cacheDir,
        headless: this.options.headless !== false,
        timeout,
        headers: options?.headers,
        userAgent:
          this.options.userAgent ||
          'Mozilla/5.0 (compatible; HappyVertical Spider/2.0; +https://happyvertical.com/bot)',
        containerSafe: true,
        stealth: this.options.stealth,
        executablePath: this.options.executablePath,
        cloak: this.options.cloak,
        onPage: async ({ page, request, downloads, sleep }) => {
          await page.waitForLoadState('networkidle', { timeout });
          await sleep(1000);

          const { links, interactionCount } =
            await this.extractLinksWithTreeExpansion(page);
          const content = await page.content();
          const duration = Date.now() - startTime;

          const strategy: ScraperStrategy = {
            type: this.getType(),
            spider: 'crawlee',
            config: {
              maxIterations: this.options.maxIterations,
              clickDelay: this.options.clickDelay,
              customSelectors: this.options.customSelectors,
              handleExclusive: this.options.handleExclusive,
              headless: this.options.headless,
              stealth: this.options.stealth,
              cloak: this.options.cloak,
            },
            confidence: interactionCount > 0 ? 0.9 : 0.5,
          };

          const metrics: ScrapeMetrics = {
            duration,
            linkCount: links.length,
            interactionCount,
            complete: true,
          };

          return {
            url: page.url(),
            content,
            links,
            strategy,
            metrics,
            downloads: downloads.length > 0 ? downloads : undefined,
            raw: {
              requestUrl: request.url,
              loadedUrl: page.url(),
              interactionCount,
              downloads: downloads.length > 0 ? downloads : undefined,
            },
          };
        },
        onDownload: ({ request, downloads }) => {
          const duration = Date.now() - startTime;

          return {
            url: request.url,
            content: '',
            links: [],
            strategy: {
              type: this.getType(),
              spider: 'crawlee',
              config: {},
              confidence: 0.8,
            },
            metrics: {
              duration,
              linkCount: 0,
              interactionCount: 0,
              complete: true,
            },
            downloads,
            raw: {
              requestUrl: request.url,
              loadedUrl: request.url,
              isDownload: true,
              downloads,
            },
          };
        },
      });

      // Cache the result if caching is enabled
      if (cache) {
        const cacheKey = this.getCacheKey(url, options);
        await this.cacheManager.set(cacheKey, scrapeResult, cacheExpiry);
      }

      return scrapeResult;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(
          `Failed to scrape page with TreeScraper: ${error.message}`,
        );
      }
      throw error;
    }
  }
}
