import type { CacheAdapter } from '@happyvertical/cache';
import { getCache } from '@happyvertical/cache';
import { createHash } from 'node:crypto';
import type { CacheProviderConfig } from './types';

export class CacheManager {
  private cache?: CacheAdapter;

  constructor(
    private readonly cacheDir: string,
    private readonly cacheProviderConfig?: CacheProviderConfig,
  ) {}

  async get<T>(key: string): Promise<T | undefined> {
    const cache = await this.init();
    const value = await cache.get<T>(key);
    return value ?? undefined;
  }

  async set<T>(key: string, value: T, cacheExpiryMs: number): Promise<void> {
    const cache = await this.init();
    await cache.set(key, value, Math.floor(cacheExpiryMs / 1000));
  }

  private async init(): Promise<CacheAdapter> {
    if (this.cache) {
      return this.cache;
    }

    if (this.cacheProviderConfig?.provider === 's3') {
      this.cache = await getCache({
        provider: 's3',
        bucket: this.cacheProviderConfig.bucket!,
        prefix: this.cacheProviderConfig.prefix || 'cache/',
        region: this.cacheProviderConfig.region,
      });
    } else {
      this.cache = await getCache({
        provider: 'file',
        cacheDir: this.cacheDir,
      });
    }

    return this.cache;
  }
}

export function createCacheKey(
  namespace: string,
  url: string,
  parts: unknown[] = [],
): string {
  const signatureParts = parts
    .map(normalizeCacheKeyPart)
    .filter((part) => part !== undefined);
  const signature = stableStringify({ parts: signatureParts, url });
  const digest = createHash('sha256').update(signature).digest('hex');

  return `${namespace}:${digest}`;
}

function normalizeCacheKeyPart(part: unknown): string | undefined {
  if (part === undefined) {
    return undefined;
  }

  return stableStringify(part);
}

function stableStringify(value: unknown): string {
  if (value === undefined) {
    return 'undefined';
  }

  if (value === null) {
    return 'null';
  }

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));

    return `{${entries
      .map(
        ([entryKey, entryValue]) =>
          `${JSON.stringify(entryKey)}:${stableStringify(entryValue)}`,
      )
      .join(',')}}`;
  }

  return JSON.stringify(String(value));
}
