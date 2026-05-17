import { NetworkError } from '@happyvertical/utils';
import { Configuration, LogLevel, PlaywrightCrawler } from 'crawlee';
import { handlePlaywrightDownload, isDownloadError } from './download-utils';
import type { CloakBrowserOptions, DownloadInfo } from './types';

const DEFAULT_BROWSER_ARGS = ['--use-mock-keychain'];
const CONTAINER_BROWSER_ARGS = [
  '--use-mock-keychain',
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
];
const CLOAK_IGNORE_DEFAULT_ARGS = [
  '--enable-automation',
  '--enable-unsafe-swiftshader',
];

let cloakAutoUpdateEnvQueue: Promise<void> = Promise.resolve();

export interface BrowserRunnerOptions<T> {
  url: string;
  cacheDir: string;
  headless: boolean;
  timeout: number;
  headers?: Record<string, string>;
  userAgent?: string;
  containerSafe?: boolean;
  stealth?: boolean;
  cloak?: CloakBrowserOptions;
  onPage: (context: BrowserRunnerPageContext) => Promise<T>;
  onDownload: (context: BrowserRunnerDownloadContext) => T;
}

export interface BrowserRunnerPageContext {
  page: any;
  request: { url: string };
  downloads: DownloadInfo[];
  sleep: (ms: number) => Promise<void>;
}

export interface BrowserRunnerDownloadContext {
  request: { url: string };
  downloads: DownloadInfo[];
}

async function importExternalPackage(packageName: string): Promise<any> {
  const dynamicImport = new Function(
    'packageName',
    'return import(packageName)',
  ) as (packageName: string) => Promise<any>;

  try {
    return await dynamicImport(packageName);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Optional dependency "${packageName}" is required when stealth is enabled. Install it with "pnpm add ${packageName} playwright-core" and try again. Original error: ${message}`,
    );
  }
}

async function withCloakAutoUpdateEnv<T>(
  cloak: CloakBrowserOptions | undefined,
  callback: () => Promise<T>,
): Promise<T> {
  const autoUpdateAlreadyDisabled =
    process.env.CLOAKBROWSER_AUTO_UPDATE?.toLowerCase() === 'false';

  if (cloak?.autoUpdate !== false || autoUpdateAlreadyDisabled) {
    return callback();
  }

  const run = cloakAutoUpdateEnvQueue.then(async () => {
    const previous = process.env.CLOAKBROWSER_AUTO_UPDATE;
    process.env.CLOAKBROWSER_AUTO_UPDATE = 'false';

    try {
      return await callback();
    } finally {
      if (previous === undefined) {
        delete process.env.CLOAKBROWSER_AUTO_UPDATE;
      } else {
        process.env.CLOAKBROWSER_AUTO_UPDATE = previous;
      }
    }
  });

  cloakAutoUpdateEnvQueue = run.then(
    () => undefined,
    () => undefined,
  );

  return run;
}

async function resolveLaunchOptions(options: {
  headless: boolean;
  containerSafe?: boolean;
  stealth?: boolean;
  cloak?: CloakBrowserOptions;
}): Promise<Record<string, unknown>> {
  const args = options.containerSafe
    ? [...CONTAINER_BROWSER_ARGS]
    : [...DEFAULT_BROWSER_ARGS];

  if (!options.stealth) {
    return {
      headless: options.headless,
      args,
    };
  }

  const { executablePath, stealthArgs } = await withCloakAutoUpdateEnv(
    options.cloak,
    async () => {
      const cloakbrowser = await importExternalPackage('cloakbrowser');
      const executablePath =
        options.cloak?.executablePath || (await cloakbrowser.ensureBinary());
      const stealthArgs =
        typeof cloakbrowser.getDefaultStealthArgs === 'function'
          ? cloakbrowser.getDefaultStealthArgs()
          : [];

      return { executablePath, stealthArgs };
    },
  );

  return {
    headless: options.headless,
    executablePath,
    args: [...stealthArgs, ...args],
    ignoreDefaultArgs: CLOAK_IGNORE_DEFAULT_ARGS,
  };
}

async function maybePatchHumanizedContext(
  page: any,
  cloak?: CloakBrowserOptions,
): Promise<void> {
  if (!cloak?.humanize) {
    return;
  }

  const human = await importExternalPackage('cloakbrowser/human');
  const config =
    typeof human.resolveConfig === 'function'
      ? human.resolveConfig('default')
      : undefined;

  if (typeof human.patchContext === 'function') {
    human.patchContext(page.context(), config);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createDownloadFallback<T>(
  request: { url: string },
  downloads: DownloadInfo[],
  onDownload: (context: BrowserRunnerDownloadContext) => T,
): T | undefined {
  if (downloads.length === 0) {
    return undefined;
  }

  return onDownload({ request, downloads: dedupeDownloads(downloads) });
}

function dedupeDownloads(downloads: DownloadInfo[]): DownloadInfo[] {
  const seen = new Set<string>();
  const unique: DownloadInfo[] = [];

  for (const download of downloads) {
    const key = [download.url, download.filename, download.contentType].join(
      '\0',
    );

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(download);
  }

  return unique;
}

export async function runSinglePageWithBrowser<T>(
  options: BrowserRunnerOptions<T>,
): Promise<T> {
  const downloads: DownloadInfo[] = [];
  let result: T | null = null;
  let runError: Error | null = null;
  let crawler: PlaywrightCrawler | undefined;

  const crawlerConfig = new Configuration({
    logLevel: LogLevel.ERROR,
    storageClientOptions: {
      localDataDirectory: `${options.cacheDir}/crawlee-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    },
    persistStorage: false,
  });

  try {
    const launchOptions = await resolveLaunchOptions(options);

    crawler = new PlaywrightCrawler(
      {
        headless: options.headless,
        maxRequestRetries: 0,
        launchContext: {
          launchOptions,
        },
        browserPoolOptions: {
          postPageCreateHooks: [
            async (page) => {
              await maybePatchHumanizedContext(
                page,
                options.stealth ? options.cloak : undefined,
              );
              page.on('download', async (download: any) => {
                downloads.push(await handlePlaywrightDownload(download));
              });
            },
          ],
        },
        requestHandlerTimeoutSecs: Math.floor(options.timeout / 1000),
        preNavigationHooks: [
          async ({ page }) => {
            const headers = {
              ...(options.userAgent ? { 'User-Agent': options.userAgent } : {}),
              ...(options.headers || {}),
            };

            if (Object.keys(headers).length > 0) {
              await page.setExtraHTTPHeaders(headers);
            }

            page.setDefaultNavigationTimeout(options.timeout);
            page.setDefaultTimeout(options.timeout);
          },
        ],
        requestHandler: async ({ page, request }) => {
          try {
            result = await options.onPage({
              page,
              request,
              downloads,
              sleep,
            });
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);

            if (isDownloadError(errorMessage)) {
              await sleep(2000);
              const fallback = createDownloadFallback(
                request,
                downloads,
                options.onDownload,
              );

              if (fallback) {
                result = fallback;
                return;
              }
            }

            runError = error instanceof Error ? error : new Error(errorMessage);
          }
        },
        failedRequestHandler: async ({ request }, error) => {
          if (isDownloadError(error.message || '')) {
            await sleep(2000);
            const fallback = createDownloadFallback(
              request,
              downloads,
              options.onDownload,
            );

            if (fallback) {
              result = fallback;
              return;
            }
          }

          runError = new NetworkError(
            `Failed to crawl ${request.url}: ${error.message}`,
            {
              url: request.url,
              error: error.message,
            },
          );
        },
      },
      crawlerConfig,
    );

    await crawler.run([options.url]);
  } finally {
    await crawler?.teardown();
  }

  if (runError) {
    throw runError;
  }

  if (!result) {
    throw new NetworkError('Failed to fetch page: No data returned', {
      url: options.url,
    });
  }

  return result;
}
