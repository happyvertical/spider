/**
 * Information about a file download triggered during page navigation
 */
export interface DownloadInfo {
  /** The URL that triggered the download */
  url: string;

  /** Suggested filename from Content-Disposition or download event */
  filename?: string;

  /** MIME type of the downloaded content */
  contentType?: string;

  /** Raw file content as Uint8Array */
  content?: Uint8Array;

  /** Error message if download failed */
  error?: string;
}

/**
 * Represents a link extracted from a web page with metadata
 */
export interface Link {
  /**
   * The URL the link points to (absolute or relative)
   */
  href: string;

  /**
   * The visible text content of the link
   */
  text: string;

  /**
   * The title attribute (hover text)
   */
  title?: string;

  /**
   * The aria-label attribute for accessibility
   */
  ariaLabel?: string;

  /**
   * The rel attribute (e.g., "nofollow", "external")
   */
  rel?: string;

  /**
   * The target attribute (e.g., "_blank")
   */
  target?: string;

  /**
   * CSS classes applied to the link
   */
  classes?: string[];
}

/**
 * Standardized data structure representing a web page
 */
export interface Page {
  /**
   * The final URL of the page after any redirects
   */
  url: string;

  /**
   * The full HTML content of the page
   */
  content: string;

  /**
   * An array of links extracted from the page with metadata
   */
  links: Link[];

  /**
   * The original raw response from the adapter
   * Useful for debugging or accessing adapter-specific data
   */
  raw: any;

  /**
   * Markdown representation of the page content (optional)
   * Available when using adapters that provide markdown conversion (e.g., crawl4ai)
   */
  markdown?: string;

  /**
   * Files downloaded during page navigation (e.g., Content-Disposition: attachment)
   * Present when a URL triggers a file download instead of rendering a page
   */
  downloads?: DownloadInfo[];
}

/**
 * Optional CloakBrowser runtime settings for browser-backed scraping.
 * CloakBrowser is an external optional dependency and is only loaded when
 * stealth mode is explicitly enabled.
 */
export interface CloakBrowserOptions {
  /** Patch browser interactions to use human-like input timing and movement */
  humanize?: boolean;

  /** Use a caller-provided CloakBrowser Chromium binary path */
  executablePath?: string;

  /** Set to false to disable CloakBrowser's background auto-update check */
  autoUpdate?: boolean;
}

/**
 * Options for fetch operations
 */
export interface FetchOptions {
  /**
   * Custom headers to include in the request
   */
  headers?: Record<string, string>;

  /**
   * Request timeout in milliseconds
   * @default 30000
   *
   * Can also be configured with `HAVE_SPIDER_TIMEOUT`.
   */
  timeout?: number;

  /**
   * Whether to use the cache
   * @default true
   */
  cache?: boolean;

  /**
   * Cache expiry time in milliseconds
   * @default 300000 (5 minutes)
   */
  cacheExpiry?: number;

  /**
   * Custom user agent string.
   *
   * Can also be configured with `HAVE_SPIDER_USER_AGENT`.
   */
  userAgent?: string;

  /**
   * Maximum number of requests allowed.
   *
   * Can also be configured with `HAVE_SPIDER_MAX_REQUESTS`.
   */
  maxRequests?: number;
}

/**
 * Interface that all spider adapters must implement
 */
export interface SpiderAdapter {
  /**
   * Fetches a web page and returns a standardized Page object
   *
   * @param url - The URL of the page to fetch
   * @param options - Optional configuration for the fetch operation
   * @returns Promise resolving to a Page object
   */
  fetch(url: string, options?: FetchOptions): Promise<Page>;
}

/**
 * Cache provider configuration
 * Allows selecting between file cache (local dev) and S3 cache (CI)
 */
export interface CacheProviderConfig {
  /** Provider type: 'file' for local, 's3' for cloud persistence */
  provider: 'file' | 's3';
  /** S3 bucket name (required if provider is 's3') */
  bucket?: string;
  /** S3 key prefix (default: 'cache/') */
  prefix?: string;
  /** AWS region (default: from AWS_REGION env var) */
  region?: string;
}

/**
 * Options for simple HTTP adapter
 */
export interface SimpleAdapterOptions {
  adapter: 'simple';
  /**
   * Default cache directory for storing fetched pages
   * @default '.cache/spider'
   */
  cacheDir?: string;
  /**
   * Cache provider configuration (optional, defaults to file)
   * Use this to enable S3 caching in CI environments
   */
  cacheProvider?: CacheProviderConfig;
}

/**
 * Options for DOM processing adapter
 */
export interface DomAdapterOptions {
  adapter: 'dom';
  /**
   * Default cache directory for storing fetched pages
   * @default '.cache/spider'
   */
  cacheDir?: string;
  /**
   * Cache provider configuration (optional, defaults to file)
   * Use this to enable S3 caching in CI environments
   */
  cacheProvider?: CacheProviderConfig;
}

/**
 * Options for Crawlee headless browser adapter
 */
export interface CrawleeAdapterOptions {
  adapter: 'crawlee';
  /**
   * Default cache directory for storing fetched pages
   * @default '.cache/spider'
   */
  cacheDir?: string;
  /**
   * Cache provider configuration (optional, defaults to file)
   * Use this to enable S3 caching in CI environments
   */
  cacheProvider?: CacheProviderConfig;
  /**
   * Whether to run browser in headless mode
   * @default true
   */
  headless?: boolean;
  /**
   * Custom user agent string
   */
  userAgent?: string;

  /**
   * Browser executable path for Crawlee. If omitted, spider honors
   * HAVE_SPIDER_BROWSER_EXECUTABLE_PATH and PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.
   */
  executablePath?: string;

  /**
   * Use CloakBrowser's external stealth Chromium runtime.
   * Requires callers to install the optional peer dependency `cloakbrowser`.
   */
  stealth?: boolean;

  /** CloakBrowser runtime settings used when stealth is enabled */
  cloak?: CloakBrowserOptions;
}

/**
 * Options for Crawl4ai remote adapter
 * Connects to a crawl4ai server running on Kubernetes or Docker
 */
export interface Crawl4aiAdapterOptions {
  adapter: 'crawl4ai';
  /**
   * Base URL of the crawl4ai server
   * @default 'http://localhost:11235'
   *
   * Can also be configured with `HAVE_SPIDER_CRAWL4AI_URL`.
   */
  baseUrl?: string;
  /**
   * Default cache directory for storing fetched pages
   * @default '.cache/spider'
   */
  cacheDir?: string;
  /**
   * Cache provider configuration (optional, defaults to file)
   * Use this to enable S3 caching in CI environments
   */
  cacheProvider?: CacheProviderConfig;
  /**
   * Whether to run browser in headless mode on the server
   * @default true
   */
  headless?: boolean;
  /**
   * Custom user agent string
   */
  userAgent?: string;
  /**
   * Wait strategy for page load
   * @default 'networkidle'
   */
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
}

/**
 * Discriminated union of all spider adapter options
 */
export type SpiderAdapterOptions =
  | SimpleAdapterOptions
  | DomAdapterOptions
  | CrawleeAdapterOptions
  | Crawl4aiAdapterOptions;

// ============================================================================
// Scraper Types - Content Extraction Strategies
// ============================================================================

/**
 * Result from a scrape operation with metadata about the strategy used
 */
export interface ScrapeResult {
  /** The final URL after any redirects */
  url: string;

  /** Raw HTML content */
  content: string;

  /** Extracted links with metadata */
  links: Link[];

  /** Scraper strategy that was used */
  strategy: ScraperStrategy;

  /** Performance metrics */
  metrics: ScrapeMetrics;

  /** Raw response data */
  raw: any;

  /** Files downloaded during page navigation */
  downloads?: DownloadInfo[];
}

/**
 * Information about which scraping strategy was used
 */
export interface ScraperStrategy {
  /** Type of scraper used */
  type: ScraperType;

  /** Spider adapter used */
  spider: 'simple' | 'dom' | 'crawlee' | 'crawl4ai';

  /** Configuration used */
  config: Record<string, any>;

  /** Confidence score (0-1) of strategy effectiveness */
  confidence: number;
}

/**
 * Performance metrics from a scrape
 */
export interface ScrapeMetrics {
  /** Total execution time in ms */
  duration: number;

  /** Number of links found */
  linkCount: number;

  /** Number of interactions performed (clicks, scrolls, etc) */
  interactionCount: number;

  /** Whether the scraper believes it found all content */
  complete: boolean;
}

/** Runtime-supported scraping strategies. */
export type ScraperType =
  | 'basic' // No interactions, just scrape
  | 'tree'; // Expand hierarchical trees/accordions

/**
 * Base interface all scrapers must implement
 */
export interface Scraper {
  /**
   * Scrape content from a URL
   */
  scrape(url: string, options?: ScrapeOptions): Promise<ScrapeResult>;

  /**
   * Get scraper type
   */
  getType(): ScraperType;
}

/**
 * Options for scrape operations
 */
export interface ScrapeOptions {
  /** Custom headers */
  headers?: Record<string, string>;

  /** Timeout in ms */
  timeout?: number;

  /** Use cache for fetched pages */
  cache?: boolean;

  /** Cache expiry time in ms */
  cacheExpiry?: number;

  /** Max time to spend scraping in ms */
  maxDuration?: number;

  /** Max interactions to perform */
  maxInteractions?: number;
}

/**
 * Options for basic scraper
 */
export interface BasicScraperOptions {
  scraper: 'basic';

  /** Which spider to use */
  spider?: 'simple' | 'dom' | 'crawlee' | 'crawl4ai';

  /** Cache directory */
  cacheDir?: string;

  /** Cache provider configuration (optional, defaults to file) */
  cacheProvider?: CacheProviderConfig;

  /** Whether to run browser-backed spiders in headless mode */
  headless?: boolean;

  /** Custom user agent string for browser-backed spiders */
  userAgent?: string;

  /**
   * Browser executable path for Crawlee-backed spiders. If omitted, spider honors
   * HAVE_SPIDER_BROWSER_EXECUTABLE_PATH and PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.
   */
  executablePath?: string;

  /** Base URL for the crawl4ai server when using spider: 'crawl4ai' */
  baseUrl?: string;

  /**
   * Use CloakBrowser's external stealth Chromium runtime for browser-backed spiders.
   * Requires callers to install the optional peer dependency `cloakbrowser`.
   */
  stealth?: boolean;

  /** CloakBrowser runtime settings used when stealth is enabled */
  cloak?: CloakBrowserOptions;
}

/**
 * Options for tree scraper
 */
export interface TreeScraperOptions {
  scraper: 'tree';

  /** Cache directory */
  cacheDir?: string;

  /** Cache provider configuration (optional, defaults to file) */
  cacheProvider?: CacheProviderConfig;

  /** Max iterations for tree expansion */
  maxIterations?: number;

  /** Delay between clicks in ms */
  clickDelay?: number;

  /** Rate limit delay between page loads in ms (default: 1000ms) */
  rateLimit?: number;

  /** Custom tree node selectors */
  customSelectors?: string[];

  /** Handle exclusive expansion (one-at-a-time) */
  handleExclusive?: boolean;

  /** Whether to run browser in headless mode */
  headless?: boolean;

  /** Custom user agent string */
  userAgent?: string;

  /**
   * Browser executable path for Crawlee. If omitted, spider honors
   * HAVE_SPIDER_BROWSER_EXECUTABLE_PATH and PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.
   */
  executablePath?: string;

  /**
   * Use CloakBrowser's external stealth Chromium runtime.
   * Requires callers to install the optional peer dependency `cloakbrowser`.
   */
  stealth?: boolean;

  /** CloakBrowser runtime settings used when stealth is enabled */
  cloak?: CloakBrowserOptions;
}

/** Discriminated union of runtime-supported scraper options. */
export type ScraperOptions = BasicScraperOptions | TreeScraperOptions;
