import { ValidationError } from '@happyvertical/utils';
import type { FetchOptions } from '../shared/types.js';
import type {
  AdapterContext,
  AdapterSource,
  DetectionResult,
  PlatformAdapter,
} from './types.js';

const DEFAULT_PRIORITY = 200;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Options for {@link AdapterRegistry.detect} / `resolve` / `fetchItems`. */
export interface DetectOptions {
  /** Adapter type to fall back to when nothing matches. */
  fallbackType?: string;
  /** Fetch options for the detection HTML fetch (cache, timeout, headers). */
  fetch?: FetchOptions;
}

/** A resolved adapter plus the detection that selected it (null if preset). */
export interface ResolvedAdapter<TItem, TSource extends AdapterSource> {
  adapter: PlatformAdapter<TItem, TSource>;
  detection: DetectionResult | null;
}

/**
 * Registry of platform adapters with two-phase detection. Generic over the
 * normalized item type (`TItem`) so it serves any domain (job postings,
 * meetings, …).
 */
export class AdapterRegistry<
  TItem,
  TSource extends AdapterSource = AdapterSource,
> {
  private readonly adapters = new Map<
    string,
    PlatformAdapter<TItem, TSource>
  >();

  /** Register an adapter. Throws if its `type` is already registered. */
  register(adapter: PlatformAdapter<TItem, TSource>): void {
    if (this.adapters.has(adapter.type)) {
      throw new ValidationError(
        `Adapter already registered for type: ${adapter.type}`,
        { type: adapter.type },
      );
    }
    this.adapters.set(adapter.type, adapter);
  }

  /** Remove an adapter by type. Returns true if one was removed. */
  unregister(type: string): boolean {
    return this.adapters.delete(type);
  }

  /** Get an adapter by type, or undefined. */
  get(type: string): PlatformAdapter<TItem, TSource> | undefined {
    return this.adapters.get(type);
  }

  /** Whether an adapter is registered for `type`. */
  has(type: string): boolean {
    return this.adapters.has(type);
  }

  /** All adapters, sorted by ascending priority (lower runs first). */
  all(): PlatformAdapter<TItem, TSource>[] {
    return [...this.adapters.values()].sort(
      (a, b) =>
        (a.priority ?? DEFAULT_PRIORITY) - (b.priority ?? DEFAULT_PRIORITY),
    );
  }

  /**
   * Resolve which adapter handles a URL:
   *  1. `detectUrl` on every adapter (no network).
   *  2. fetch the page once via `ctx.fetchPage`, then `detectHtml` on each.
   *  3. fall back to `options.fallbackType` if registered, else return null.
   *
   * A throwing `detectUrl`/`detectHtml` or a failed fetch is logged and skipped
   * so one misbehaving adapter never aborts detection for the rest.
   */
  async detect(
    url: string,
    ctx: AdapterContext,
    options: DetectOptions = {},
  ): Promise<DetectionResult | null> {
    const sorted = this.all();

    for (const adapter of sorted) {
      try {
        const hit = adapter.detectUrl?.(url);
        if (hit) return { ...hit, type: adapter.type };
      } catch (error) {
        ctx.log?.('platform detect: detectUrl threw', {
          type: adapter.type,
          error: errorMessage(error),
        });
      }
    }

    if (sorted.some((adapter) => adapter.detectHtml)) {
      let html: { content: string; url: string } | null = null;
      try {
        const page = await ctx.fetchPage(url, options.fetch);
        html = { content: page.content, url: page.url || url };
      } catch (error) {
        ctx.log?.('platform detect: HTML fetch failed', {
          url,
          error: errorMessage(error),
        });
      }

      if (html) {
        for (const adapter of sorted) {
          if (!adapter.detectHtml) continue;
          try {
            const hit = await adapter.detectHtml(html.content, html.url);
            if (hit) return { ...hit, type: adapter.type };
          } catch (error) {
            ctx.log?.('platform detect: detectHtml threw', {
              type: adapter.type,
              error: errorMessage(error),
            });
          }
        }
      }
    }

    if (options.fallbackType) {
      const fallback = this.adapters.get(options.fallbackType);
      if (fallback) {
        return {
          type: fallback.type,
          normalizedUrl: url,
          confidence: 'low',
          platformName: fallback.name,
        };
      }
      ctx.log?.('platform detect: fallbackType is not registered', {
        fallbackType: options.fallbackType,
      });
    }
    return null;
  }

  /**
   * Resolve a source to an adapter end-to-end: use `source.type` when it names a
   * registered adapter, otherwise run {@link detect}. Returns null if nothing
   * resolves.
   */
  async resolve(
    source: TSource,
    ctx: AdapterContext,
    options: DetectOptions = {},
  ): Promise<ResolvedAdapter<TItem, TSource> | null> {
    const preset = source.type ? this.adapters.get(source.type) : undefined;
    if (preset) return { adapter: preset, detection: null };

    const detection = await this.detect(source.url, ctx, options);
    if (!detection) return null;
    const adapter = this.adapters.get(detection.type);
    return adapter ? { adapter, detection } : null;
  }

  /**
   * Resolve a source and fetch its normalized items. Throws `ValidationError`
   * when no adapter resolves.
   */
  async fetchItems(
    source: TSource,
    ctx: AdapterContext,
    options: DetectOptions = {},
  ): Promise<TItem[]> {
    const resolved = await this.resolve(source, ctx, options);
    if (!resolved) {
      throw new ValidationError(
        `No platform adapter resolved for source URL: ${source.url}`,
        { url: source.url },
      );
    }
    return resolved.adapter.fetch(source, ctx);
  }
}
