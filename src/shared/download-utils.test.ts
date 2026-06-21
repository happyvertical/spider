import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  handlePlaywrightDownload,
  inferContentType,
  isDownloadError,
  isPdfFile,
} from './download-utils';

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { force: true, recursive: true });
    tempDir = undefined;
  }
});

describe('download utilities', () => {
  it('infers content type from known, unknown, and missing extensions', () => {
    expect(inferContentType('AGENDA.PDF')).toBe('application/pdf');
    expect(inferContentType('archive.unknown')).toBe(
      'application/octet-stream',
    );
    expect(inferContentType()).toBe('application/octet-stream');
  });

  it('detects PDF filenames case-insensitively', () => {
    expect(isPdfFile('minutes.PDF')).toBe(true);
    expect(isPdfFile('minutes.docx')).toBe(false);
    expect(isPdfFile()).toBe(false);
  });

  it('reads Playwright download content when a path is available', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'spider-download-'));
    const file = join(tempDir, 'agenda.pdf');
    await writeFile(file, 'pdf content');

    const result = await handlePlaywrightDownload({
      url: () => 'https://example.com/agenda.pdf',
      suggestedFilename: () => 'agenda.pdf',
      path: async () => file,
    });

    expect(result).toMatchObject({
      url: 'https://example.com/agenda.pdf',
      filename: 'agenda.pdf',
      contentType: 'application/pdf',
    });
    expect(new TextDecoder().decode(result.content)).toBe('pdf content');
  });

  it('returns an error when a download path is unavailable', async () => {
    const result = await handlePlaywrightDownload({
      url: () => 'https://example.com/agenda.pdf',
      suggestedFilename: () => 'agenda.pdf',
      path: async () => null,
    });

    expect(result).toMatchObject({
      error: 'Download path not available',
      contentType: 'application/pdf',
    });
  });

  it('normalizes thrown download failures', async () => {
    const result = await handlePlaywrightDownload({
      url: () => 'https://example.com/agenda.pdf',
      suggestedFilename: () => 'agenda.pdf',
      path: async () => {
        throw new Error('permission denied');
      },
    });

    expect(result).toMatchObject({
      url: 'https://example.com/agenda.pdf',
      filename: 'agenda.pdf',
      error: 'permission denied',
    });
  });

  it('identifies Playwright download-trigger errors', () => {
    expect(isDownloadError('page.goto: Download is starting')).toBe(true);
    expect(isDownloadError('net::ERR_ABORTED at navigation')).toBe(true);
    expect(isDownloadError('socket hang up')).toBe(false);
  });
});
