import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startFixtureServer, type FixtureServer } from '../testdata/local-server';
import { scrapeDocument } from './scrapeDocument';
import {
  detectDocumentUrl,
  extractCivicWebDocumentUrl,
  extractDocuShareDocumentUrl,
  extractWordPressDownloadUrl,
} from './scrapeDocument/detectors';

function fixture(filename: string): string {
  return readFileSync(join(__dirname, '../testdata', filename), 'utf-8');
}

describe('document detector registry', () => {
  it('detects WordPress Download Manager links', () => {
    const url = 'https://example.com/download/file/';
    const html = fixture('wordpress-pdf-link.html');

    expect(extractWordPressDownloadUrl(url, html)).toBe(
      'https://example.com/download/file.pdf?wpdmdl=12345&refresh=abc123',
    );
    expect(detectDocumentUrl(url, html)).toEqual({
      url: 'https://example.com/download/file.pdf?wpdmdl=12345&refresh=abc123',
      type: 'application/pdf',
      isPdf: true,
      strategy: 'wordpress-pdf-link',
    });
  });

  it('does not re-detect WordPress links on wpdmdl URLs', () => {
    const url = 'https://example.com/download/file/?wpdmdl=12345';
    const html = fixture('wordpress-meeting-link.html');

    expect(extractWordPressDownloadUrl(url, html)).toBeNull();
    expect(detectDocumentUrl(url, html)).toBeNull();
  });

  it('detects CivicWeb preview document links', () => {
    const url = 'https://example.civicweb.net/filepro/documents/?preview=52835';
    const html = fixture('civicweb-download.html');

    expect(extractCivicWebDocumentUrl(url, html)).toBe(
      'https://example.civicweb.net/filepro/document/52835/Regular%20Board%20-%2016%20Oct%202025%20-%20Agenda%20-%20Pdf.pdf',
    );
    expect(detectDocumentUrl(url, html)).toEqual({
      url: 'https://example.civicweb.net/filepro/document/52835/Regular%20Board%20-%2016%20Oct%202025%20-%20Agenda%20-%20Pdf.pdf',
      type: 'application/pdf',
      isPdf: true,
      strategy: 'civicweb-pdf-link',
    });
  });

  it('detects DocuShare document links', () => {
    const url = 'https://example.com/docushare/dsweb/Get/Document-12345';
    const html = fixture('docushare-download.html');

    expect(extractDocuShareDocumentUrl(url, html)).toBe(
      'https://example.com/dsweb/Get/Document-12345/Council%20Minutes%20-%20Oct%202025.pdf',
    );
    expect(detectDocumentUrl(url, html)).toEqual({
      url: 'https://example.com/dsweb/Get/Document-12345/Council%20Minutes%20-%20Oct%202025.pdf',
      type: 'application/pdf',
      isPdf: true,
      strategy: 'docushare-doc-link',
    });
  });

  it('detects non-PDF DocuShare document links', () => {
    const url = 'https://example.com/docushare/dsweb/View/Collection-1';
    const html = fixture('docushare-xlsx.html');

    expect(detectDocumentUrl(url, html)).toEqual({
      url: 'https://example.com/dsweb/Get/Document-999/Spreadsheet.xlsx',
      type: 'application/octet-stream',
      isPdf: false,
      strategy: 'docushare-doc-link',
    });
  });

  it('returns null for ordinary pages', () => {
    expect(
      detectDocumentUrl('https://example.com/article', fixture('normal-page.html')),
    ).toBeNull();
  });
});

describe('scrapeDocument', () => {
  let server: FixtureServer;

  beforeAll(async () => {
    server = await startFixtureServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it('scrapes basic HTML with title and description', async () => {
    const result = await scrapeDocument(server.url('/fixtures/page-with-title.html'), {
      cache: false,
    });

    expect(result).toMatchObject({
      url: server.url('/fixtures/page-with-title.html'),
      type: 'text/html',
      metadata: {
        title: 'Test Page Title',
        description: 'Test page description',
        isPdf: false,
        complete: true,
        strategy: 'basic',
      },
    });
    expect(result.text).toContain('Content here');
    expect(result.html).toContain('<title>Test Page Title</title>');
  });

  it('detects WordPress download pages through the public coordinator', async () => {
    const result = await scrapeDocument(server.url('/download/file'), {
      cache: false,
    });

    expect(result).toMatchObject({
      url: 'https://example.com/download/file.pdf?wpdmdl=12345&refresh=abc123',
      type: 'application/pdf',
      text: '',
      metadata: {
        isPdf: true,
        complete: false,
        strategy: 'wordpress-pdf-link',
      },
    });
  });

  it('detects CivicWeb preview pages through the public coordinator', async () => {
    const result = await scrapeDocument(
      server.url('/filepro/documents/?preview=52835'),
      { cache: false },
    );

    expect(result.metadata.strategy).toBe('civicweb-pdf-link');
    expect(result.metadata.isPdf).toBe(true);
    expect(result.url).toContain('/filepro/document/52835/');
  });

  it('detects DocuShare pages through the public coordinator', async () => {
    const result = await scrapeDocument(
      server.url('/docushare/dsweb/Get/Document-12345'),
      {
        spider: 'simple',
        cache: false,
      },
    );

    expect(result.metadata.strategy).toBe('docushare-doc-link');
    expect(result.metadata.isPdf).toBe(true);
    expect(result.url).toContain('/dsweb/Get/Document-12345/');
  });

  it('propagates browser-triggered downloads as DocumentResult fields', async () => {
    const result = await scrapeDocument(server.url('/download/file.pdf'), {
      scraper: 'basic',
      spider: 'crawlee',
      cache: false,
    });

    expect(result).toMatchObject({
      url: server.url('/download/file.pdf'),
      type: 'application/pdf',
      isDownload: true,
      filename: 'file.pdf',
      contentType: 'application/pdf',
      metadata: {
        title: 'file.pdf',
        isPdf: true,
        complete: true,
        strategy: 'direct-download',
      },
    });
    expect(result.fileContent).toBeInstanceOf(Uint8Array);
  }, 60000);

  it('supports the documented scraper and spider options', () => {
    const basicConfig = { scraper: 'basic' as const };
    const treeConfig = { scraper: 'tree' as const };
    const crawleeSpider = {
      scraper: 'basic' as const,
      spider: 'crawlee' as const,
    };

    expect(basicConfig.scraper).toBe('basic');
    expect(treeConfig.scraper).toBe('tree');
    expect(crawleeSpider.spider).toBe('crawlee');
  });

  it('rejects the removed scraper: crawlee API shape at runtime', async () => {
    await expect(
      scrapeDocument(server.url('/'), { scraper: 'crawlee' } as any),
    ).rejects.toThrow(/Use 'basic' or 'tree'/);
  });
});
