import { beforeEach, describe, expect, it, vi } from 'vitest';
import { scrapeIndex } from './scrapeIndex';
import type { ScrapeResult, Scraper } from './shared/types';

const scrapeMock = vi.fn();
const getScraperMock = vi.fn();

vi.mock('./shared/scraper-factory', () => ({
  getScraper: (...args: unknown[]) => getScraperMock(...args),
}));

const result: ScrapeResult = {
  url: 'https://example.com/docs',
  content: '<a href="/agenda.pdf">Agenda</a>',
  links: [{ href: 'https://example.com/agenda.pdf', text: 'Agenda' }],
  strategy: {
    type: 'basic',
    spider: 'simple',
    config: {},
    confidence: 1,
  },
  metrics: {
    duration: 12,
    linkCount: 1,
    interactionCount: 0,
    complete: true,
  },
  raw: {},
};

describe('scrapeIndex', () => {
  beforeEach(() => {
    scrapeMock.mockReset();
    getScraperMock.mockReset();
    scrapeMock.mockResolvedValue(result);
    getScraperMock.mockResolvedValue({
      scrape: scrapeMock,
      getType: () => 'basic',
    } satisfies Scraper);
  });

  it('uses the basic simple scraper by default', async () => {
    await expect(scrapeIndex('https://example.com/docs')).resolves.toBe(result);

    expect(getScraperMock).toHaveBeenCalledWith({
      scraper: 'basic',
      spider: 'simple',
    });
    expect(scrapeMock).toHaveBeenCalledWith(
      'https://example.com/docs',
      undefined,
    );
  });

  it('passes scraper configuration and scrape options through', async () => {
    const scrapeOptions = {
      cache: false,
      timeout: 60000,
      headers: { 'User-Agent': 'DocsBot/1.0' },
    };

    await scrapeIndex('https://example.com/meetings', {
      scraper: {
        scraper: 'tree',
        maxIterations: 3,
      },
      scrape: scrapeOptions,
    });

    expect(getScraperMock).toHaveBeenCalledWith({
      scraper: 'tree',
      maxIterations: 3,
    });
    expect(scrapeMock).toHaveBeenCalledWith(
      'https://example.com/meetings',
      scrapeOptions,
    );
  });
});
