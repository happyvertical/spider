import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startFixtureServer, type FixtureServer } from '../../testdata/local-server';
import { getScraper } from '../shared/scraper-factory';

describe('Scraper Factory', () => {
  it('should create basic scraper', async () => {
    const scraper = await getScraper({ scraper: 'basic' });
    expect(scraper).toBeDefined();
    expect(scraper.getType()).toBe('basic');
    expect(typeof scraper.scrape).toBe('function');
  });

  it('should create basic scraper with custom spider', async () => {
    const scraper = await getScraper({
      scraper: 'basic',
      spider: 'dom',
    });
    expect(scraper).toBeDefined();
    expect(scraper.getType()).toBe('basic');
  });

  it('should create tree scraper', async () => {
    const scraper = await getScraper({ scraper: 'tree' });
    expect(scraper).toBeDefined();
    expect(scraper.getType()).toBe('tree');
    expect(typeof scraper.scrape).toBe('function');
  });

  it('should throw error for unsupported scraper', async () => {
    await expect(getScraper({ scraper: 'invalid' } as any)).rejects.toThrow(
      'Unsupported scraper',
    );
  });
});

describe('scrapers', () => {
  let server: FixtureServer;
  let cachePrefix: string;

  beforeAll(async () => {
    server = await startFixtureServer();
    cachePrefix = `.cache/scraper-test-${Date.now()}`;
  });

  afterAll(async () => {
    await server.close();
  });

  it('basic scraper scrapes a simple page', async () => {
    const scraper = await getScraper({
      scraper: 'basic',
      spider: 'simple',
      cacheDir: `${cachePrefix}-basic`,
    });

    const result = await scraper.scrape(server.url('/'), { cache: false });

    expect(result.url).toBe(server.url('/'));
    expect(result.content).toContain('Fixture Home');
    expect(result.links.length).toBeGreaterThan(0);
    expect(result.links[0]).toEqual(
      expect.objectContaining({
        href: expect.stringMatching(/^http/),
        text: expect.any(String),
      }),
    );
    expect(result.strategy).toMatchObject({
      type: 'basic',
      spider: 'simple',
      confidence: 1,
    });
    expect(result.metrics).toMatchObject({
      linkCount: result.links.length,
      interactionCount: 0,
      complete: true,
    });
  });

  it('basic scraper can use the DOM spider', async () => {
    const scraper = await getScraper({
      scraper: 'basic',
      spider: 'dom',
      cacheDir: `${cachePrefix}-dom`,
    });

    const result = await scraper.scrape(server.url('/'), { cache: false });

    expect(result.strategy.spider).toBe('dom');
    expect(result.content).toContain('<html');
    expect(result.links.find((link) => link.href.endsWith('/relative'))).toEqual(
      expect.objectContaining({
        href: server.url('/relative'),
        title: 'Relative title',
        ariaLabel: 'Relative label',
        classes: ['primary', 'test'],
      }),
    );
  });

  it('basic scraper forwards browser options to crawl4ai', async () => {
    const scraper = await getScraper({
      scraper: 'basic',
      spider: 'crawl4ai',
      headless: false,
      userAgent: 'FixtureBot/1.0',
      baseUrl: server.origin,
      cacheDir: `${cachePrefix}-crawl4ai`,
    });

    const result = await scraper.scrape(server.url('/'), { cache: false });

    expect(result.strategy.spider).toBe('crawl4ai');
    expect(server.lastCrawlRequest()).toMatchObject({
      browser_config: {
        headless: false,
        user_agent: 'FixtureBot/1.0',
      },
    });
  });

  it('basic scraper respects cache options', async () => {
    const scraper = await getScraper({
      scraper: 'basic',
      spider: 'simple',
      cacheDir: `${cachePrefix}-cache`,
    });

    const before = server.requests();
    const result1 = await scraper.scrape(server.url('/'), {
      cache: true,
      cacheExpiry: 60000,
    });
    const afterFirst = server.requests();
    const result2 = await scraper.scrape(server.url('/'), {
      cache: true,
      cacheExpiry: 60000,
    });
    const afterSecond = server.requests();

    expect(result2.content).toBe(result1.content);
    expect(afterFirst).toBeGreaterThan(before);
    expect(afterSecond).toBe(afterFirst);
  });

  it('basic scraper propagates browser downloads from Crawlee', async () => {
    const scraper = await getScraper({
      scraper: 'basic',
      spider: 'crawlee',
      headless: true,
      cacheDir: `${cachePrefix}-download`,
    });

    const result = await scraper.scrape(server.url('/download/file.pdf'), {
      cache: false,
    });

    expect(result.downloads).toHaveLength(1);
    expect(result.downloads?.[0].filename).toBe('file.pdf');
    expect(result.raw.isDownload).toBe(true);
  }, 60000);

  it('tree scraper expands hidden content and extracts links', async () => {
    const scraper = await getScraper({
      scraper: 'tree',
      headless: true,
      maxIterations: 3,
      clickDelay: 50,
      rateLimit: 0,
      cacheDir: `${cachePrefix}-tree`,
    });

    const result = await scraper.scrape(server.url('/tree'), { cache: false });

    expect(result.strategy.type).toBe('tree');
    expect(result.strategy.spider).toBe('crawlee');
    expect(result.metrics.interactionCount).toBeGreaterThan(0);
    expect(result.strategy.confidence).toBe(0.9);
    expect(result.links).toContainEqual(
      expect.objectContaining({
        href: server.url('/tree/file.pdf'),
        title: 'Hidden file',
        classes: ['download'],
      }),
    );
  }, 60000);

  it('tree scraper respects cache options', async () => {
    const scraper = await getScraper({
      scraper: 'tree',
      headless: true,
      maxIterations: 1,
      clickDelay: 10,
      rateLimit: 0,
      cacheDir: `${cachePrefix}-tree-cache`,
    });

    const before = server.requests();
    const result1 = await scraper.scrape(server.url('/tree'), {
      cache: true,
      cacheExpiry: 60000,
    });
    const afterFirst = server.requests();
    const result2 = await scraper.scrape(server.url('/tree'), {
      cache: true,
      cacheExpiry: 60000,
    });
    const afterSecond = server.requests();

    expect(result2.content).toBe(result1.content);
    expect(result2.links).toEqual(result1.links);
    expect(afterFirst).toBeGreaterThan(before);
    expect(afterSecond).toBe(afterFirst);
  }, 60000);

  it('tree scraper varies cache entries by custom selectors', async () => {
    const cacheDir = `${cachePrefix}-tree-selector-cache`;
    const defaultScraper = await getScraper({
      scraper: 'tree',
      headless: true,
      maxIterations: 1,
      clickDelay: 0,
      rateLimit: 0,
      cacheDir,
    });
    const customScraper = await getScraper({
      scraper: 'tree',
      headless: true,
      maxIterations: 1,
      clickDelay: 0,
      rateLimit: 0,
      customSelectors: ['.custom-expander'],
      cacheDir,
    });

    const defaultResult = await defaultScraper.scrape(server.url('/custom-tree'), {
      cache: true,
      cacheExpiry: 60000,
    });
    const customResult = await customScraper.scrape(server.url('/custom-tree'), {
      cache: true,
      cacheExpiry: 60000,
    });

    expect(defaultResult.links).not.toContainEqual(
      expect.objectContaining({
        href: server.url('/custom-tree/file.pdf'),
      }),
    );
    expect(customResult.links).toContainEqual(
      expect.objectContaining({
        href: server.url('/custom-tree/file.pdf'),
        title: 'Custom hidden file',
      }),
    );
  }, 60000);

  it('tree scraper applies rate limiting delay', async () => {
    const rateLimit = 250;
    const scraper = await getScraper({
      scraper: 'tree',
      headless: true,
      maxIterations: 1,
      rateLimit,
      cacheDir: `${cachePrefix}-rate-limit`,
    });

    const startTime = Date.now();
    await scraper.scrape(server.url('/tree'), { cache: false });

    expect(Date.now() - startTime).toBeGreaterThanOrEqual(rateLimit);
  }, 60000);
});
