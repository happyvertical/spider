import { ValidationError } from '@happyvertical/utils';
import { inferContentType, isPdfFile } from './shared/download-utils';
import { getScraper } from './shared/scraper-factory';
import type {
  CacheProviderConfig,
  CloakBrowserOptions,
  ScrapeOptions,
  ScraperOptions,
} from './shared/types';
import { detectDocumentUrl } from './scrapeDocument/detectors';

/**
 * Options for document scraping with scraper configuration.
 */
export interface DocumentScrapeOptions extends ScrapeOptions {
  /**
   * Scraper type to use for content extraction.
   * - 'basic': Fast static scraping with the selected spider adapter (default)
   * - 'tree': Browser-backed expansion of trees and accordions
   *
   * @default 'basic'
   */
  scraper?: 'basic' | 'tree';

  /**
   * Spider adapter used by the basic scraper.
   * - 'simple': Basic HTTP fetch
   * - 'dom': HTML parsing with happy-dom (default)
   * - 'crawlee': Headless browser through Crawlee
   * - 'crawl4ai': Remote crawl4ai server
   *
   * @default 'dom'
   */
  spider?: 'simple' | 'dom' | 'crawlee' | 'crawl4ai';

  /** Cache directory passed to the selected scraper/adapter */
  cacheDir?: string;

  /** Cache provider configuration (optional, defaults to file cache) */
  cacheProvider?: CacheProviderConfig;

  /** Whether browser-backed paths should run headless */
  headless?: boolean;

  /** Custom user agent for browser-backed paths */
  userAgent?: string;

  /**
   * Browser executable path for Crawlee-backed paths. If omitted, spider honors
   * HAVE_SPIDER_BROWSER_EXECUTABLE_PATH and PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.
   */
  executablePath?: string;

  /** Base URL for the crawl4ai server when using spider: 'crawl4ai' */
  baseUrl?: string;

  /** Max iterations for the tree scraper */
  maxIterations?: number;

  /** Delay between tree expansion clicks in ms */
  clickDelay?: number;

  /** Rate limit delay before browser-backed tree page loads */
  rateLimit?: number;

  /** Additional selectors for tree expansion */
  customSelectors?: string[];

  /** Handle exclusive tree expansion widgets */
  handleExclusive?: boolean;

  /**
   * Use CloakBrowser's external stealth Chromium runtime for browser-backed paths.
   * Requires callers to install the optional peer dependency `cloakbrowser`.
   */
  stealth?: boolean;

  /** CloakBrowser runtime settings used when stealth is enabled */
  cloak?: CloakBrowserOptions;
}

/**
 * Simple document structure returned by scrapeDocument.
 */
export interface DocumentResult {
  /** Original or detected document URL */
  url: string;

  /** Detected content type (text/html, application/pdf, etc.) */
  type: string;

  /** Extracted text content */
  text: string;

  /** Full HTML content (if applicable) */
  html?: string;

  /** Whether this URL triggered a file download instead of rendering a page */
  isDownload?: boolean;

  /** Raw file content for downloads (as Uint8Array for ESM compatibility) */
  fileContent?: Uint8Array;

  /** Suggested filename from Content-Disposition header or download event */
  filename?: string;

  /** MIME content type of downloaded file */
  contentType?: string;

  /** Additional metadata */
  metadata: {
    /** Content title extracted from page */
    title?: string;

    /** Content description */
    description?: string;

    /** Whether this was a PDF document */
    isPdf: boolean;

    /** Whether content extraction was successful */
    complete: boolean;

    /** Strategy used to scrape the document */
    strategy: string;
  };
}

function normalizeDownloadPageUrl(url: string): string {
  const looksLikeFilePath = (() => {
    try {
      return /\.[a-z0-9]{2,8}$/i.test(new URL(url).pathname);
    } catch {
      return /\.[a-z0-9]{2,8}$/i.test(url.split('?')[0] || url);
    }
  })();

  if (
    url.includes('/download/') &&
    !url.includes('?') &&
    !url.endsWith('/') &&
    !looksLikeFilePath
  ) {
    return `${url}/`;
  }

  return url;
}

function buildScraperOptions(options?: DocumentScrapeOptions): ScraperOptions {
  const scraperType = options?.scraper || 'basic';

  if (scraperType !== 'basic' && scraperType !== 'tree') {
    throw new ValidationError(
      `Unsupported document scraper: ${String(scraperType)}. Use 'basic' or 'tree'.`,
      { scraper: scraperType },
    );
  }

  if (scraperType === 'tree') {
    return {
      scraper: 'tree',
      cacheDir: options?.cacheDir,
      cacheProvider: options?.cacheProvider,
      maxIterations: options?.maxIterations,
      clickDelay: options?.clickDelay,
      rateLimit: options?.rateLimit,
      customSelectors: options?.customSelectors,
      handleExclusive: options?.handleExclusive,
      headless: options?.headless,
      userAgent: options?.userAgent,
      executablePath: options?.executablePath,
      stealth: options?.stealth,
      cloak: options?.cloak,
    };
  }

  return {
    scraper: 'basic',
    spider: options?.spider || 'dom',
    cacheDir: options?.cacheDir,
    cacheProvider: options?.cacheProvider,
    headless: options?.headless,
    userAgent: options?.userAgent,
    executablePath: options?.executablePath,
    baseUrl: options?.baseUrl,
    stealth: options?.stealth,
    cloak: options?.cloak,
  };
}

function extractHtmlMetadata(html: string): {
  title?: string;
  description?: string;
} {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const descMatch = html.match(
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
  );

  return {
    title: titleMatch?.[1]?.trim(),
    description: descMatch?.[1]?.trim(),
  };
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Convenience function to scrape and extract document content from a URL.
 *
 * This function intelligently handles HTML pages, PDF links, browser-triggered
 * downloads, WordPress Download Manager pages, CivicWeb preview pages, and
 * DocuShare document pages. For full document processing with PDF support, use
 * @happyvertical/content's Document class.
 *
 * @example Basic HTML page
 * ```typescript
 * import { scrapeDocument } from '@happyvertical/spider';
 *
 * const doc = await scrapeDocument('https://example.com/article');
 * console.log(doc.text);
 * console.log(doc.metadata.title);
 * ```
 *
 * @example Browser-backed tree expansion
 * ```typescript
 * const doc = await scrapeDocument(
 *   'https://example.civicweb.net/filepro/documents/?preview=12345',
 *   { scraper: 'tree' }
 * );
 * ```
 *
 * @example Basic scraper with Crawlee
 * ```typescript
 * const doc = await scrapeDocument('https://example.com/dynamic-page', {
 *   scraper: 'basic',
 *   spider: 'crawlee',
 * });
 * ```
 */
export async function scrapeDocument(
  url: string,
  options?: DocumentScrapeOptions,
): Promise<DocumentResult> {
  const normalizedUrl = normalizeDownloadPageUrl(url);
  const scraper = await getScraper(buildScraperOptions(options));
  const result = await scraper.scrape(normalizedUrl, options);
  const actualUrl = result.url || normalizedUrl;

  const downloads = result.downloads;
  if (downloads && downloads.length > 0) {
    const download = downloads[0];
    const filename = download.filename || '';
    const contentType = download.contentType || inferContentType(filename);

    return {
      url: download.url || actualUrl,
      type: contentType,
      text: '',
      html: undefined,
      isDownload: true,
      fileContent: download.content,
      filename: download.filename,
      contentType,
      metadata: {
        title: download.filename,
        description: undefined,
        isPdf: isPdfFile(filename),
        complete: !!download.content && !download.error,
        strategy: 'direct-download',
      },
    };
  }

  const detected = detectDocumentUrl(actualUrl, result.content);
  if (detected) {
    return {
      url: detected.url,
      type: detected.type,
      text: '',
      html: undefined,
      metadata: {
        title: undefined,
        description: undefined,
        isPdf: detected.isPdf,
        complete: false,
        strategy: detected.strategy,
      },
    };
  }

  const isPdf =
    actualUrl.toLowerCase().endsWith('.pdf') ||
    result.content.includes('application/pdf') ||
    result.content.includes('%PDF-');
  const metadata = !isPdf ? extractHtmlMetadata(result.content) : {};
  const text = isPdf ? result.content : stripHtmlToText(result.content);

  return {
    url: actualUrl,
    type: isPdf ? 'application/pdf' : 'text/html',
    text,
    html: !isPdf ? result.content : undefined,
    metadata: {
      title: metadata.title,
      description: metadata.description,
      isPdf,
      complete: result.metrics.complete,
      strategy: result.strategy.type,
    },
  };
}

/**
 * Options for detecting downloadable documents.
 */
export interface DocumentLinkOptions {
  /** File extensions to consider as documents */
  extensions?: string[];
}

/**
 * Helper function to detect document download links in a scraped page.
 */
export async function findDocumentLinks(
  url: string,
  options?: DocumentLinkOptions,
): Promise<string[]> {
  const extensions = options?.extensions || [
    '.pdf',
    '.doc',
    '.docx',
    '.txt',
    '.md',
    '.rtf',
  ];

  const scraper = await getScraper({
    scraper: 'basic',
    spider: 'simple',
  });

  const result = await scraper.scrape(url);
  const documentLinks = result.links
    .filter((link) => {
      const href = link.href.toLowerCase();
      return extensions.some((ext) => href.endsWith(ext));
    })
    .map((link) => link.href);

  return [...new Set(documentLinks)];
}
