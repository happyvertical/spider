import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type FixtureServer,
  startFixtureServer,
} from '../testdata/local-server';
import { scrapeDocument } from './scrapeDocument';

describe('WordPress Download Manager detection (issue #449)', () => {
  let server: FixtureServer;

  beforeAll(async () => {
    server = await startFixtureServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it('detects WordPress download pages with the default DOM spider', async () => {
    const result = await scrapeDocument(server.url('/download/file/'), {
      scraper: 'basic',
      cache: false,
    });

    expect(result.metadata.strategy).toBe('wordpress-pdf-link');
    expect(result.metadata.isPdf).toBe(true);
    expect(result.url).toContain('wpdmdl=');
  });

  it('detects WordPress download pages with the simple spider', async () => {
    const result = await scrapeDocument(server.url('/download/file/'), {
      scraper: 'basic',
      spider: 'simple',
      cache: false,
    });

    expect(result.metadata.strategy).toBe('wordpress-pdf-link');
    expect(result.metadata.isPdf).toBe(true);
    expect(result.url).toContain('wpdmdl=');
  });

  it('does not create infinite loops when a wpdmdl URL returns HTML', async () => {
    const result = await scrapeDocument(
      server.url('/fixtures/wordpress-meeting-link.html?wpdmdl=17656'),
      {
        scraper: 'basic',
        spider: 'simple',
        cache: false,
      },
    );

    expect(result.metadata.strategy).not.toBe('wordpress-pdf-link');
    expect(result.type).toBe('text/html');
  });

  it('normalizes WordPress download URLs without trailing slashes', async () => {
    const result = await scrapeDocument(server.url('/download/file'), {
      scraper: 'basic',
      cache: false,
    });

    expect(result.metadata.strategy).toBe('wordpress-pdf-link');
    expect(result.metadata.isPdf).toBe(true);
    expect(result.url).toContain('wpdmdl=');
  });

  it('detects WordPress consistently with and without trailing slash', async () => {
    const withSlash = await scrapeDocument(server.url('/download/file/'), {
      scraper: 'basic',
      cache: false,
    });
    const withoutSlash = await scrapeDocument(server.url('/download/file'), {
      scraper: 'basic',
      cache: false,
    });

    expect(withSlash.metadata.strategy).toBe(withoutSlash.metadata.strategy);
    expect(withSlash.metadata.isPdf).toBe(withoutSlash.metadata.isPdf);
    expect(withSlash.metadata.strategy).toBe('wordpress-pdf-link');
  });
});
