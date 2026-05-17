import type { CacheAdapter } from '@happyvertical/cache';
import { getCache } from '@happyvertical/cache';
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
  parts: Array<string | number | boolean | undefined> = [],
): string {
  const suffix = parts
    .filter((part) => part !== undefined)
    .map((part) => encodeURIComponent(String(part)))
    .join(':');

  return [namespace, encodeURIComponent(url), suffix]
    .filter((part) => part.length > 0)
    .join(':');
}
