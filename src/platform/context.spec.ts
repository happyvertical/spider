import { beforeEach, describe, expect, it, vi } from 'vitest';

const scrapeIndexMock = vi.fn(async () => ({}) as never);
const fetchMock = vi.fn(async () => ({
  url: '',
  content: '',
  links: [],
  raw: null,
}));

vi.mock('../scrapeIndex.js', () => ({
  scrapeIndex: (...args: unknown[]) => scrapeIndexMock(...(args as [])),
}));
vi.mock('../shared/factory.js', () => ({
  getSpider: vi.fn(async () => ({ fetch: fetchMock })),
}));

import { createAdapterContext } from './context.js';

describe('createAdapterContext', () => {
  beforeEach(() => {
    scrapeIndexMock.mockClear();
    fetchMock.mockClear();
  });

  it('threads the configured spider adapter (and knobs) into scrapeIndex', async () => {
    const ctx = await createAdapterContext({
      spider: { adapter: 'crawlee', headless: true },
    });
    await ctx.scrapeIndex('https://x');
    expect(scrapeIndexMock).toHaveBeenCalledWith('https://x', {
      scraper: expect.objectContaining({
        scraper: 'basic',
        spider: 'crawlee',
        headless: true,
      }),
      scrape: undefined,
    });
  });

  it('defaults to the simple adapter', async () => {
    const ctx = await createAdapterContext();
    await ctx.scrapeIndex('https://y');
    expect(scrapeIndexMock).toHaveBeenCalledWith('https://y', {
      scraper: expect.objectContaining({ scraper: 'basic', spider: 'simple' }),
      scrape: undefined,
    });
  });

  it('fetchPage delegates to the spider adapter', async () => {
    const ctx = await createAdapterContext();
    await ctx.fetchPage('https://z');
    expect(fetchMock).toHaveBeenCalledWith('https://z', undefined);
  });
});
