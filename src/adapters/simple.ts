import {
  isUrl,
  loadEnvConfig,
  NetworkError,
  ValidationError,
} from '@happyvertical/utils';
import { getGlobalDispatcher, interceptors, request } from 'undici';
import { CacheManager, createCacheKey } from '../shared/cache';
import { extractHtmlLinks } from '../shared/links';
import type {
  FetchOptions,
  Page,
  SimpleAdapterOptions,
  SpiderAdapter,
} from '../shared/types';

/**
 * Simple HTTP adapter for fetching web pages
 * Uses undici for fast HTTP requests and cheerio for parsing
 */
export class SimpleAdapter implements SpiderAdapter {
  private cacheManager: CacheManager;

  constructor(options: SimpleAdapterOptions) {
    this.cacheManager = new CacheManager(
      options.cacheDir || '.cache/spider',
      options.cacheProvider,
    );
  }

  /**
   * Fetches a web page and returns a standardized Page object
   */
  async fetch(url: string, options?: FetchOptions): Promise<Page> {
    // Load configuration from environment variables and merge with user options
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
      cacheExpiry = 300000, // 5 minutes default
      userAgent,
    } = config;

    // Validate URL
    if (!url || typeof url !== 'string') {
      throw new ValidationError('URL is required and must be a string', {
        url,
      });
    }

    if (!isUrl(url)) {
      throw new ValidationError('Invalid URL format', { url });
    }

    const defaultHeaders = {
      'User-Agent':
        userAgent ||
        'Mozilla/5.0 (compatible; HappyVertical Spider/2.0; +https://happyvertical.com/bot)',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      // Note: undici automatically handles gzip/deflate/br decompression
      DNT: '1',
      Connection: 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      ...headers,
    };
    const cacheKey = createCacheKey('simple', url, [defaultHeaders]);

    // Check cache if enabled
    if (cache) {
      const cached = await this.cacheManager.get<Page>(cacheKey);

      if (cached) {
        return cached;
      }
    }

    // Fetch the page
    try {
      // Follow redirects so callers get the destination page (and its real
      // content), not an empty 3xx body. Without this a redirected board URL
      // yields blank HTML, breaking content-based detection/parsing. undici v7
      // requires the redirect interceptor (the `maxRedirections` request option
      // throws), so compose it onto the global dispatcher.
      const response = await request(url, {
        method: 'GET',
        headers: defaultHeaders,
        headersTimeout: timeout,
        bodyTimeout: timeout,
        dispatcher: getGlobalDispatcher().compose(
          interceptors.redirect({ maxRedirections: 5 }),
        ),
      });

      if (response.statusCode >= 400) {
        throw new NetworkError(
          `HTTP ${response.statusCode}: ${response.headers.status || 'Request failed'}`,
          { url, statusCode: response.statusCode, headers: response.headers },
        );
      }

      const content = await response.body.text();
      // undici records the redirect chain on `context.history` when it follows
      // redirects; the last entry is the final destination. Resolve links and
      // Page.url against it so the documented "final URL" contract holds.
      const finalUrl =
        (
          response.context as { history?: Array<URL | string> } | undefined
        )?.history?.at(-1)?.toString() ?? url;
      const links = extractHtmlLinks(content, finalUrl);

      const page: Page = {
        url: finalUrl,
        content,
        links,
        raw: {
          statusCode: response.statusCode,
          headers: response.headers,
        },
      };

      // Cache the result if caching is enabled
      if (cache) {
        await this.cacheManager.set(cacheKey, page, cacheExpiry);
      }

      return page;
    } catch (error) {
      if (error instanceof NetworkError || error instanceof ValidationError) {
        throw error;
      }

      if (error instanceof Error) {
        throw new NetworkError(`Failed to fetch page: ${error.message}`, {
          url,
          error: error.message,
          stack: error.stack,
        });
      }

      throw error;
    }
  }
}
