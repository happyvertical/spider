import type {
  FetchOptions,
  Link,
  Page,
  ScrapeOptions,
  ScrapeResult,
} from '../shared/types.js';

/** Confidence in a platform detection match. */
export type DetectionConfidence = 'high' | 'medium' | 'low';

/**
 * Minimal source shape the engine reads. Consumers keep their own (often
 * persisted) source model and map it to this at the boundary.
 */
export interface AdapterSource {
  /** The source URL (board / careers page / API root). */
  url: string;
  /** The resolved adapter type, when already known. */
  type?: string;
  /** Optional per-source configuration (search query, extraction filters, …). */
  config?: Record<string, unknown>;
}

/** Result of URL-only detection (no network). */
export interface UrlDetection {
  normalizedUrl: string;
  confidence: DetectionConfidence;
  platformName: string;
}

/** Result of HTML-based detection (after fetching the page). */
export interface HtmlDetection extends UrlDetection {
  version?: string;
}

/** Resolved detection, including which adapter matched. */
export interface DetectionResult extends HtmlDetection {
  type: string;
}

/**
 * I/O surface handed to adapters. Decouples the engine from how pages are
 * fetched/rendered — wire it to @happyvertical/spider with createAdapterContext.
 */
export interface AdapterContext {
  /** Fetch + render a single page (static or browser, per the wired spider). */
  fetchPage(url: string, options?: FetchOptions): Promise<Page>;
  /** Scrape an index page for links, with optional browser-driven expansion. */
  scrapeIndex(url: string, options?: ScrapeOptions): Promise<ScrapeResult>;
  /** Optional AI client for discoverOptions (untyped to avoid a hard dep). */
  ai?: unknown;
  /** Optional structured logger. */
  log?(message: string, meta?: Record<string, unknown>): void;
}

/**
 * A platform adapter: detects whether a URL belongs to a platform and turns a
 * configured source into normalized domain items (`TItem`).
 *
 * Priority bands (lower runs first during detection):
 * - 100–199 built-in
 * - 200–299 packages (default 200)
 * - 300–399 custom
 * - 999 fallback
 */
export interface PlatformAdapter<
  TItem,
  TSource extends AdapterSource = AdapterSource,
> {
  /** Unique adapter type identifier (e.g. 'greenhouse'). */
  readonly type: string;
  /** Human-readable platform name (e.g. 'Greenhouse'). */
  readonly name: string;
  /** Detection priority — lower runs first (default 200). */
  readonly priority?: number;
  /** Detect from the URL alone (no network). Return null if no match. */
  detectUrl?(url: string): UrlDetection | null;
  /** Detect from fetched HTML. Return null if no match. */
  detectHtml?(
    html: string,
    url: string,
  ): HtmlDetection | null | Promise<HtmlDetection | null>;
  /** Discover per-source configuration (folders, filters, …). */
  discoverOptions?(
    url: string,
    ctx: AdapterContext,
  ): Promise<Record<string, unknown>>;
  /** Fetch normalized items from a configured source. */
  fetch(source: TSource, ctx: AdapterContext): Promise<TItem[]>;
}

export type { Link, Page };
