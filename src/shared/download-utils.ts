import { readFile } from 'node:fs/promises';
import type { DownloadInfo } from './types';

/**
 * Common MIME type mappings for file extensions
 * Used when Content-Type header is not available
 */
const MIME_TYPES: Record<string, string> = {
  // Documents
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx':
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx':
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.odt': 'application/vnd.oasis.opendocument.text',
  '.ods': 'application/vnd.oasis.opendocument.spreadsheet',
  '.odp': 'application/vnd.oasis.opendocument.presentation',
  '.rtf': 'application/rtf',
  '.txt': 'text/plain',
  '.csv': 'text/csv',

  // Archives
  '.zip': 'application/zip',
  '.rar': 'application/vnd.rar',
  '.7z': 'application/x-7z-compressed',
  '.tar': 'application/x-tar',
  '.gz': 'application/gzip',

  // Images
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',

  // Media
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.wav': 'audio/wav',
  '.avi': 'video/x-msvideo',

  // Web
  '.html': 'text/html',
  '.htm': 'text/html',
  '.xml': 'application/xml',
  '.json': 'application/json',
};

/**
 * Infer MIME content type from filename extension
 * @param filename - The filename to analyze
 * @returns The inferred MIME type, or 'application/octet-stream' if unknown
 */
export function inferContentType(filename?: string): string {
  if (!filename) return 'application/octet-stream';

  const ext = filename.toLowerCase().match(/\.[^.]+$/)?.[0];
  if (!ext) return 'application/octet-stream';

  return MIME_TYPES[ext] || 'application/octet-stream';
}

/**
 * Check if a filename represents a PDF file
 */
export function isPdfFile(filename?: string): boolean {
  return filename?.toLowerCase().endsWith('.pdf') ?? false;
}

/**
 * Handle a Playwright download event and create DownloadInfo
 * @param download - The Playwright Download object
 * @returns Promise<DownloadInfo>
 */
export async function handlePlaywrightDownload(
  download: { url(): string; suggestedFilename(): string; path(): Promise<string | null> },
): Promise<DownloadInfo> {
  try {
    const url = download.url();
    const filename = download.suggestedFilename();
    const path = await download.path();

    if (path) {
      const content = await readFile(path);
      return {
        url,
        filename,
        contentType: inferContentType(filename),
        content: new Uint8Array(content),
      };
    } else {
      return {
        url,
        filename,
        contentType: inferContentType(filename),
        error: 'Download path not available',
      };
    }
  } catch (err) {
    return {
      url: download.url(),
      filename: download.suggestedFilename(),
      error: err instanceof Error ? err.message : 'Download failed',
    };
  }
}

/**
 * Check if an error message indicates a download was triggered
 * Note: This relies on Playwright/Chromium error messages which may change
 * @param errorMessage - The error message to check
 * @returns true if the error indicates a download was triggered
 */
export function isDownloadError(errorMessage: string): boolean {
  return (
    errorMessage.includes('Download is starting') ||
    errorMessage.includes('net::ERR_ABORTED')
  );
}
