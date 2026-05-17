import { ValidationError } from '@happyvertical/utils';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startFixtureServer, type FixtureServer } from '../testdata/local-server';
import { getSpider } from './index';
import type { SpiderAdapterOptions } from './shared/types';

describe('getSpider factory', () => {
  it('should create simple adapter', async () => {
    const spider = await getSpider({ adapter: 'simple' });
    expect(spider).toBeDefined();
    expect(typeof spider.fetch).toBe('function');
  });

  it('should create dom adapter', async () => {
    const spider = await getSpider({ adapter: 'dom' });
    expect(spider).toBeDefined();
    expect(typeof spider.fetch).toBe('function');
  });

  it('should create crawlee adapter', async () => {
    const spider = await getSpider({ adapter: 'crawlee' });
    expect(spider).toBeDefined();
    expect(typeof spider.fetch).toBe('function');
  });

  it('should create crawl4ai adapter', async () => {
    const spider = await getSpider({ adapter: 'crawl4ai' });
    expect(spider).toBeDefined();
    expect(typeof spider.fetch).toBe('function');
  });

  it('should throw error for unsupported adapter', async () => {
    await expect(getSpider({ adapter: 'invalid' } as any)).rejects.toThrow(
      'Unsupported adapter',
    );
  });
});

describe('adapter parity', () => {
  let server: FixtureServer;
  let cachePrefix: string;

  beforeAll(async () => {
    server = await startFixtureServer();
    cachePrefix = `.cache/spider-test-${Date.now()}`;
  });

  afterAll(async () => {
    await server.close();
  });

  function optionsFor(adapter: SpiderAdapterOptions['adapter']) {
    const cacheDir = `${cachePrefix}-${adapter}`;

    switch (adapter) {
      case 'simple':
        return { adapter, cacheDir } as const;
      case 'dom':
        return { adapter, cacheDir } as const;
      case 'crawlee':
        return { adapter, cacheDir, headless: true } as const;
      case 'crawl4ai':
        return { adapter, cacheDir, baseUrl: server.origin } as const;
    }
  }

  for (const adapter of ['simple', 'dom', 'crawlee', 'crawl4ai'] as const) {
    it(
      `${adapter} returns absolute links with consistent metadata`,
      async () => {
        const spider = await getSpider(optionsFor(adapter));
        const page = await spider.fetch(server.url('/'), { cache: false });

        expect(page.url).toContain(server.origin);
        expect(Array.isArray(page.links)).toBe(true);
        expect(page.links.length).toBeGreaterThan(0);
        expect(page.links.every((link) => link.href.startsWith('http'))).toBe(
          true,
        );

        const relativeLink = page.links.find((link) =>
          link.href.endsWith('/relative'),
        );
        expect(relativeLink).toMatchObject({
          href: server.url('/relative'),
          text: expect.any(String),
        });

        if (adapter !== 'crawl4ai') {
          expect(relativeLink).toMatchObject({
            title: 'Relative title',
            ariaLabel: 'Relative label',
            rel: 'nofollow',
            target: '_blank',
            classes: ['primary', 'test'],
          });
        }
      },
      60000,
    );

    it(`${adapter} caches fetched pages`, async () => {
      const spider = await getSpider(optionsFor(adapter));
      const before = server.requests();
      const page1 = await spider.fetch(server.url('/'), {
        cache: true,
        cacheExpiry: 60000,
      });
      const afterFirst = server.requests();
      const page2 = await spider.fetch(server.url('/'), {
        cache: true,
        cacheExpiry: 60000,
      });
      const afterSecond = server.requests();

      expect(page2.content).toBe(page1.content);
      expect(afterFirst).toBeGreaterThan(before);
      expect(afterSecond).toBe(afterFirst);
    }, 60000);

    it(`${adapter} throws ValidationError for invalid URLs`, async () => {
      const spider = await getSpider(optionsFor(adapter));

      await expect(spider.fetch('')).rejects.toThrow(ValidationError);
      await expect(spider.fetch('not-a-url')).rejects.toThrow(ValidationError);
    });
  }

  it('crawlee exposes browser-triggered downloads as first-class fields', async () => {
    const spider = await getSpider({
      adapter: 'crawlee',
      cacheDir: '.cache/spider-test-crawlee-download',
      headless: true,
    });

    const page = await spider.fetch(server.url('/download/file.pdf'), {
      cache: false,
    });

    expect(page.downloads).toHaveLength(1);
    expect(page.downloads?.[0]).toMatchObject({
      url: server.url('/download/file.pdf'),
      filename: 'file.pdf',
      contentType: 'application/pdf',
    });
    expect(page.raw.isDownload).toBe(true);
  }, 60000);

  it('crawlee ignores CloakBrowser options unless stealth is enabled', async () => {
    const spider = await getSpider({
      adapter: 'crawlee',
      cacheDir: '.cache/spider-test-crawlee-cloak-disabled',
      headless: true,
      cloak: {
        humanize: true,
      },
    });

    const page = await spider.fetch(server.url('/'), {
      cache: false,
    });

    expect(page.content).toContain('Fixture Home');
  }, 60000);

  it('crawl4ai reports a clear network error when the server is unavailable', async () => {
    const spider = await getSpider({
      adapter: 'crawl4ai',
      baseUrl: 'http://127.0.0.1:1',
    });

    await expect(spider.fetch(server.url('/'), { cache: false })).rejects.toThrow(
      /Cannot connect to crawl4ai server|Failed to fetch page via crawl4ai/,
    );
  });
});
