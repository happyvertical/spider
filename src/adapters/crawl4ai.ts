import type { CacheAdapter } from '@happyvertical/cache';
import { getCache } from '@happyvertical/cache';
import {
  isUrl,
  loadEnvConfig,
  NetworkError,
  ValidationError,
} from '@happyvertical/utils';
import * as cheerio from 'cheerio';
import { request } from 'undici';
import type {
  CacheProviderConfig,
  Crawl4aiAdapterOptions,
  FetchOptions,
  Link,
  Page,
  SpiderAdapter,
} from '../shared/types';

/**
 * Response structure from crawl4ai /crawl endpoint
 */
interface Crawl4aiResponse {
  success: boolean;
  url: string;
  html?: string;
  cleaned_html?: string;
  markdown?: string | { raw_markdown?: string; fit_markdown?: string };
  links?: {
    internal?: Array<{ href: string; text?: string; title?: string }>;
    external?: Array<{ href: string; text?: string; title?: string }>;
  };
  error_message?: string;
  status_code?: number;
}

/**
 * Crawl4ai adapter for fetching web pages via a remote crawl4ai server
 * Connects to a crawl4ai instance running on Kubernetes or Docker
 */
export class Crawl4aiAdapter implements SpiderAdapter {
  private cache?: CacheAdapter;
  private cacheDir: string;
  private cacheProviderConfig?: CacheProviderConfig;
  private baseUrl: string;
  private headless: boolean;
  private userAgent?: string;
  private waitUntil: 'load' | 'domcontentloaded' | 'networkidle';

  constructor(options: Crawl4aiAdapterOptions) {
    this.cacheDir = options.cacheDir || '.cache/spider';
    this.cacheProviderConfig = options.cacheProvider;
    this.baseUrl = options.baseUrl || 'http://localhost:11235';
    this.headless = options.headless ?? true;
    this.userAgent = options.userAgent;
    this.waitUntil = options.waitUntil || 'networkidle';
  }

  /**
   * Initialize the cache adapter if needed
   * Uses S3 if cacheProvider is configured, otherwise falls back to file
   */
  private async initCache(): Promise<CacheAdapter> {
    if (!this.cache) {
      if (this.cacheProviderConfig?.provider === 's3') {
        this.cache = await getCache({
          provider: 's3',
          bucket: this.cacheProviderConfig.bucket!,
          prefix: this.cacheProviderConfig.prefix || 'cache/',
          region: this.cacheProviderConfig.region,
        });
      } else {
        this.cache = await getCache({
          provider: 'file',
          cacheDir: this.cacheDir,
        });
      }
    }
    return this.cache;
  }

  /**
   * Generate a cache key from a URL
   */
  private getCacheKey(url: string): string {
    return `crawl4ai:${encodeURIComponent(url)}`;
  }

  /**
   * Extract links from crawl4ai response or fallback to cheerio
   */
  private extractLinks(
    response: Crawl4aiResponse,
    html: string,
  ): Link[] {
    // If crawl4ai provided structured links, use them
    if (response.links) {
      const links: Link[] = [];

      for (const link of response.links.internal || []) {
        if (link.href) {
          links.push({
            href: link.href,
            text: link.text?.trim() || '',
            title: link.title,
          });
        }
      }

      for (const link of response.links.external || []) {
        if (link.href) {
          links.push({
            href: link.href,
            text: link.text?.trim() || '',
            title: link.title,
          });
        }
      }

      if (links.length > 0) {
        return links;
      }
    }

    // Fallback to cheerio extraction
    return this.extractLinksFromHtml(html);
  }

  /**
   * Extract links from HTML using cheerio (fallback)
   */
  private extractLinksFromHtml(html: string): Link[] {
    const $ = cheerio.load(html);
    const links: Link[] = [];

    $('a').each((_, element) => {
      const $link = $(element);
      const href = $link.attr('href');
      if (href) {
        const classes = $link.attr('class');
        links.push({
          href,
          text: $link.text().trim() || '',
          title: $link.attr('title'),
          ariaLabel: $link.attr('aria-label'),
          rel: $link.attr('rel'),
          target: $link.attr('target'),
          classes: classes
            ? classes.split(' ').filter((c) => c.trim())
            : undefined,
        });
      }
    });

    return links;
  }

  /**
   * Extract markdown content from crawl4ai response
   */
  private extractMarkdown(response: Crawl4aiResponse): string | undefined {
    if (!response.markdown) {
      return undefined;
    }

    if (typeof response.markdown === 'string') {
      return response.markdown;
    }

    // Handle MarkdownGenerationResult structure
    return response.markdown.fit_markdown || response.markdown.raw_markdown;
  }

  /**
   * Fetches a web page via the crawl4ai server and returns a standardized Page object
   */
  async fetch(url: string, options?: FetchOptions): Promise<Page> {
    // Load configuration from environment variables and merge with user options
    const config = loadEnvConfig<FetchOptions & { crawl4aiUrl?: string }>(
      options || {},
      {
        packageName: 'spider',
        schema: {
          timeout: 'number',
          maxRequests: 'number',
          userAgent: 'string',
          crawl4aiUrl: 'string',
        },
      },
    );

    const {
      timeout = 60000, // Higher default for crawl4ai (browser-based)
      cache = true,
      cacheExpiry = 300000, // 5 minutes default
      userAgent,
      crawl4aiUrl,
    } = config;

    // Use env var for base URL if provided
    const serverUrl = crawl4aiUrl || this.baseUrl;

    // Validate URL
    if (!url || typeof url !== 'string') {
      throw new ValidationError('URL is required and must be a string', {
        url,
      });
    }

    if (!isUrl(url)) {
      throw new ValidationError('Invalid URL format', { url });
    }

    // Check cache if enabled
    if (cache) {
      const cacheAdapter = await this.initCache();
      const cacheKey = this.getCacheKey(url);
      const cached = await cacheAdapter.get<Page>(cacheKey);

      if (cached) {
        return cached;
      }
    }

    // Fetch via crawl4ai server
    try {
      const requestBody = {
        urls: [url],
        browser_config: {
          headless: this.headless,
          ...(userAgent || this.userAgent
            ? { user_agent: userAgent || this.userAgent }
            : {}),
        },
        crawler_config: {
          type: 'CrawlerRunConfig',
          params: {
            wait_until: this.waitUntil,
          },
        },
      };

      const response = await request(`${serverUrl}/crawl`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        headersTimeout: timeout,
        bodyTimeout: timeout,
      });

      if (response.statusCode >= 400) {
        throw new NetworkError(
          `Crawl4ai server returned HTTP ${response.statusCode}`,
          { url, serverUrl, statusCode: response.statusCode },
        );
      }

      const responseText = await response.body.text();
      let crawl4aiResult: Crawl4aiResponse;

      try {
        crawl4aiResult = JSON.parse(responseText);
      } catch {
        throw new NetworkError('Invalid JSON response from crawl4ai server', {
          url,
          serverUrl,
          response: responseText.substring(0, 500),
        });
      }

      // Handle crawl4ai array response (it returns array for urls array)
      if (Array.isArray(crawl4aiResult)) {
        crawl4aiResult = crawl4aiResult[0];
      }

      if (!crawl4aiResult.success) {
        throw new NetworkError(
          `Crawl4ai failed: ${crawl4aiResult.error_message || 'Unknown error'}`,
          { url, serverUrl, error: crawl4aiResult.error_message },
        );
      }

      // Get HTML content (prefer cleaned_html, fallback to html)
      const content = crawl4aiResult.cleaned_html || crawl4aiResult.html || '';
      const links = this.extractLinks(crawl4aiResult, content);
      const markdown = this.extractMarkdown(crawl4aiResult);

      const page: Page = {
        url: crawl4aiResult.url || url,
        content,
        links,
        raw: crawl4aiResult,
        ...(markdown ? { markdown } : {}),
      };

      // Cache the result if caching is enabled
      if (cache) {
        const cacheAdapter = await this.initCache();
        const cacheKey = this.getCacheKey(url);
        const ttl = Math.floor(cacheExpiry / 1000); // Convert to seconds
        await cacheAdapter.set(cacheKey, page, ttl);
      }

      return page;
    } catch (error) {
      if (error instanceof NetworkError || error instanceof ValidationError) {
        throw error;
      }

      if (error instanceof Error) {
        // Check for connection errors
        if (
          error.message.includes('ECONNREFUSED') ||
          error.message.includes('ENOTFOUND')
        ) {
          throw new NetworkError(
            `Cannot connect to crawl4ai server at ${serverUrl}: ${error.message}`,
            { url, serverUrl, error: error.message },
          );
        }

        throw new NetworkError(
          `Failed to fetch page via crawl4ai: ${error.message}`,
          {
            url,
            serverUrl,
            error: error.message,
            stack: error.stack,
          },
        );
      }

      throw error;
    }
  }
}
