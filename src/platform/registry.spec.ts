import { describe, expect, it, vi } from 'vitest';
import type { Page, ScrapeResult } from '../shared/types.js';
import { AdapterRegistry } from './registry.js';
import type { AdapterContext, PlatformAdapter } from './types.js';

interface Item {
  id: string;
}

function makeContext(
  html = '',
  url = 'https://example.com',
  fetchImpl?: AdapterContext['fetchPage'],
): AdapterContext {
  const page: Page = { url, content: html, links: [], raw: null };
  const scrapeResult: ScrapeResult = {
    url,
    content: html,
    links: [],
    strategy: { type: 'basic', spider: 'simple', config: {}, confidence: 1 },
    metrics: { duration: 0, linkCount: 0, interactionCount: 0, complete: true },
    raw: null,
  };
  return {
    fetchPage: vi.fn(fetchImpl ?? (async () => page)),
    scrapeIndex: vi.fn(async () => scrapeResult),
    log: vi.fn(),
  };
}

function adapter(
  type: string,
  overrides: Partial<PlatformAdapter<Item>> = {},
): PlatformAdapter<Item> {
  return { type, name: type, fetch: async () => [], ...overrides };
}

describe('AdapterRegistry', () => {
  it('registers and looks up adapters', () => {
    const registry = new AdapterRegistry<Item>();
    const a = adapter('greenhouse');
    registry.register(a);
    expect(registry.has('greenhouse')).toBe(true);
    expect(registry.get('greenhouse')).toBe(a);
  });

  it('throws on duplicate type', () => {
    const registry = new AdapterRegistry<Item>();
    registry.register(adapter('x'));
    expect(() => registry.register(adapter('x'))).toThrow(
      'Adapter already registered',
    );
  });

  it('unregisters adapters', () => {
    const registry = new AdapterRegistry<Item>();
    registry.register(adapter('x'));
    expect(registry.unregister('x')).toBe(true);
    expect(registry.has('x')).toBe(false);
    expect(registry.unregister('x')).toBe(false);
  });

  it('sorts by ascending priority', () => {
    const registry = new AdapterRegistry<Item>();
    registry.register(adapter('default'));
    registry.register(adapter('high', { priority: 100 }));
    registry.register(adapter('fallback', { priority: 999 }));
    expect(registry.all().map((a) => a.type)).toEqual([
      'high',
      'default',
      'fallback',
    ]);
  });

  it('detects by URL without fetching', async () => {
    const registry = new AdapterRegistry<Item>();
    const ctx = makeContext();
    registry.register(
      adapter('greenhouse', {
        detectUrl: (url) =>
          url.includes('greenhouse.io')
            ? {
                normalizedUrl: url,
                confidence: 'high',
                platformName: 'Greenhouse',
              }
            : null,
      }),
    );
    const result = await registry.detect(
      'https://boards.greenhouse.io/acme',
      ctx,
    );
    expect(result).toMatchObject({ type: 'greenhouse', confidence: 'high' });
    expect(ctx.fetchPage).not.toHaveBeenCalled();
  });

  it('cannot have its resolved type overridden by a stray detection field', async () => {
    const registry = new AdapterRegistry<Item>();
    const ctx = makeContext();
    registry.register(
      adapter('greenhouse', {
        // Carries a rogue `type` — the registry must win.
        detectUrl: () =>
          ({
            normalizedUrl: 'u',
            confidence: 'high',
            platformName: 'X',
            type: 'spoofed',
          }) as never,
      }),
    );
    const result = await registry.detect('https://x', ctx);
    expect(result?.type).toBe('greenhouse');
  });

  it('falls back to HTML detection when URL detection misses', async () => {
    const registry = new AdapterRegistry<Item>();
    const ctx = makeContext('<meta name="generator" content="Workday">');
    registry.register(
      adapter('workday', {
        detectHtml: (html) =>
          html.includes('Workday')
            ? {
                normalizedUrl: 'https://x',
                confidence: 'medium',
                platformName: 'Workday',
              }
            : null,
      }),
    );
    const result = await registry.detect('https://jobs.example.com', ctx);
    expect(result).toMatchObject({ type: 'workday', confidence: 'medium' });
    expect(ctx.fetchPage).toHaveBeenCalledOnce();
  });

  it('keeps detecting when one adapter detectHtml throws', async () => {
    const registry = new AdapterRegistry<Item>();
    const ctx = makeContext('<html>ashby</html>');
    registry.register(
      adapter('boom', {
        priority: 100,
        detectHtml: () => {
          throw new Error('bad regex');
        },
      }),
    );
    registry.register(
      adapter('ashby', {
        priority: 200,
        detectHtml: (html) =>
          html.includes('ashby')
            ? { normalizedUrl: 'u', confidence: 'high', platformName: 'Ashby' }
            : null,
      }),
    );
    const result = await registry.detect('https://x', ctx);
    expect(result?.type).toBe('ashby');
  });

  it('falls through to fallback when the detection fetch fails', async () => {
    const registry = new AdapterRegistry<Item>();
    const ctx = makeContext('', 'https://x', async () => {
      throw new Error('network');
    });
    registry.register(adapter('documents', { priority: 999 }));
    registry.register(adapter('needshtml', { detectHtml: () => null }));
    const result = await registry.detect('https://x', ctx, {
      fallbackType: 'documents',
    });
    expect(result).toMatchObject({ type: 'documents', confidence: 'low' });
  });

  it('returns the fallback type when nothing matches', async () => {
    const registry = new AdapterRegistry<Item>();
    const ctx = makeContext('<html></html>');
    registry.register(adapter('documents', { priority: 999 }));
    const result = await registry.detect('https://nope.example.com', ctx, {
      fallbackType: 'documents',
    });
    expect(result).toMatchObject({ type: 'documents', confidence: 'low' });
  });

  it('returns null and logs when fallbackType is not registered', async () => {
    const registry = new AdapterRegistry<Item>();
    const ctx = makeContext('<html></html>');
    expect(
      await registry.detect('https://x', ctx, { fallbackType: 'missing' }),
    ).toBeNull();
    expect(ctx.log).toHaveBeenCalled();
  });

  it('returns null when nothing matches and no fallback is given', async () => {
    const registry = new AdapterRegistry<Item>();
    const ctx = makeContext('<html></html>');
    registry.register(adapter('greenhouse', { detectUrl: () => null }));
    expect(await registry.detect('https://nope.example.com', ctx)).toBeNull();
  });

  describe('resolve / fetchItems', () => {
    it('uses a preset source.type without detecting', async () => {
      const registry = new AdapterRegistry<Item>();
      const ctx = makeContext();
      registry.register(adapter('greenhouse'));
      const resolved = await registry.resolve(
        { url: 'https://x', type: 'greenhouse' },
        ctx,
      );
      expect(resolved?.adapter.type).toBe('greenhouse');
      expect(resolved?.detection).toBeNull();
      expect(ctx.fetchPage).not.toHaveBeenCalled();
    });

    it('detects when source.type is unset', async () => {
      const registry = new AdapterRegistry<Item>();
      const ctx = makeContext();
      registry.register(
        adapter('greenhouse', {
          detectUrl: () => ({
            normalizedUrl: 'u',
            confidence: 'high',
            platformName: 'Greenhouse',
          }),
        }),
      );
      const resolved = await registry.resolve(
        { url: 'https://boards.greenhouse.io/x' },
        ctx,
      );
      expect(resolved?.adapter.type).toBe('greenhouse');
      expect(resolved?.detection?.type).toBe('greenhouse');
    });

    it('fetchItems runs the resolved adapter', async () => {
      const registry = new AdapterRegistry<Item>();
      const ctx = makeContext();
      registry.register(
        adapter('greenhouse', {
          fetch: async () => [{ id: 'a' }, { id: 'b' }],
        }),
      );
      const items = await registry.fetchItems(
        { url: 'https://x', type: 'greenhouse' },
        ctx,
      );
      expect(items).toEqual([{ id: 'a' }, { id: 'b' }]);
    });

    it('fetchItems throws when nothing resolves', async () => {
      const registry = new AdapterRegistry<Item>();
      const ctx = makeContext('<html></html>');
      await expect(
        registry.fetchItems({ url: 'https://x' }, ctx),
      ).rejects.toThrow('No platform adapter resolved');
    });
  });
});
