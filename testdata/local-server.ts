import { readFile } from 'node:fs/promises';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const testdataDir = dirname(fileURLToPath(import.meta.url));

export interface FixtureServer {
  origin: string;
  url: (path?: string) => string;
  close: () => Promise<void>;
  requests: () => number;
  lastCrawlRequest: () => unknown;
}

function headerValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value.join(',');
  }

  return value || '';
}

function send(
  response: ServerResponse,
  statusCode: number,
  headers: Record<string, string>,
  body: string | Uint8Array,
): void {
  response.writeHead(statusCode, headers);
  response.end(body);
}

function baseHtml(title: string, body: string): string {
  return `<!doctype html>
<html>
<head>
  <title>${title}</title>
  <meta name="description" content="${title} description">
</head>
<body>
${body}
</body>
</html>`;
}

async function readRequestBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString('utf-8');
}

function htmlForFixture(pathname: string): string | undefined {
  if (!pathname.startsWith('/fixtures/')) {
    return undefined;
  }

  const fixtureName = pathname.replace('/fixtures/', '');
  if (!fixtureName.endsWith('.html')) {
    return undefined;
  }

  return fixtureName;
}

export async function startFixtureServer(): Promise<FixtureServer> {
  let requestCount = 0;
  let lastCrawlRequest: unknown;
  const server = createServer(async (request, response) => {
    requestCount++;

    const host = request.headers.host || '127.0.0.1';
    const requestUrl = new URL(request.url || '/', `http://${host}`);
    const { pathname } = requestUrl;

    try {
      if (pathname === '/') {
        send(
          response,
          200,
          { 'Content-Type': 'text/html; charset=utf-8' },
          baseHtml(
            'Fixture Home',
            `<h1>Fixture Home</h1>
<a href="/relative" title="Relative title" aria-label="Relative label" rel="nofollow" target="_blank" class="primary test">Relative Link</a>
<a href="https://external.example/path">External Link</a>
<a href="#section">Anchor Link</a>
<a href="/relative">Duplicate Relative Link</a>
<section id="section">Section text</section>`,
          ),
        );
        return;
      }

      if (pathname === '/relative') {
        send(
          response,
          200,
          { 'Content-Type': 'text/html; charset=utf-8' },
          baseHtml('Relative Page', '<p>Relative page content.</p>'),
        );
        return;
      }

      if (pathname === '/vary') {
        const variant = headerValue(request.headers['x-fixture-variant']);
        const userAgent = headerValue(request.headers['user-agent']);

        send(
          response,
          200,
          { 'Content-Type': 'text/html; charset=utf-8' },
          baseHtml(
            'Vary Page',
            `<p id="variant">${variant || 'none'}</p>
<p id="user-agent">${userAgent}</p>`,
          ),
        );
        return;
      }

      if (pathname === '/tree') {
        send(
          response,
          200,
          { 'Content-Type': 'text/html; charset=utf-8' },
          baseHtml(
            'Tree Page',
            `<button aria-expanded="false" onclick="this.setAttribute('aria-expanded', 'true'); document.getElementById('hidden').innerHTML = '<a href=&quot;/tree/file.pdf&quot; title=&quot;Hidden file&quot; class=&quot;download&quot;>Hidden PDF</a>';">Open folder</button>
<div id="hidden"></div>`,
          ),
        );
        return;
      }

      if (pathname === '/custom-tree') {
        send(
          response,
          200,
          { 'Content-Type': 'text/html; charset=utf-8' },
          baseHtml(
            'Custom Tree Page',
            `<span class="custom-expander" onclick="document.getElementById('custom-hidden').innerHTML = '<a href=&quot;/custom-tree/file.pdf&quot; title=&quot;Custom hidden file&quot;>Custom PDF</a>';">Open custom folder</span>
<div id="custom-hidden"></div>`,
          ),
        );
        return;
      }

      if (pathname === '/download/file.pdf' || pathname === '/tree/file.pdf') {
        send(
          response,
          200,
          {
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'attachment; filename="file.pdf"',
          },
          new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]),
        );
        return;
      }

      if (pathname === '/custom-tree/file.pdf') {
        send(
          response,
          200,
          {
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'attachment; filename="custom-file.pdf"',
          },
          new Uint8Array([0x25, 0x50, 0x44, 0x46]),
        );
        return;
      }

      if (pathname === '/download/file/') {
        const html = await readFile(
          join(testdataDir, 'wordpress-pdf-link.html'),
          'utf-8',
        );
        send(
          response,
          200,
          { 'Content-Type': 'text/html; charset=utf-8' },
          html,
        );
        return;
      }

      if (pathname === '/filepro/documents/') {
        const html = await readFile(
          join(testdataDir, 'civicweb-download.html'),
          'utf-8',
        );
        send(
          response,
          200,
          { 'Content-Type': 'text/html; charset=utf-8' },
          html,
        );
        return;
      }

      if (pathname === '/docushare/dsweb/Get/Document-12345') {
        const html = await readFile(
          join(testdataDir, 'docushare-download.html'),
          'utf-8',
        );
        send(
          response,
          200,
          { 'Content-Type': 'text/html; charset=utf-8' },
          html,
        );
        return;
      }

      if (pathname === '/crawl' && request.method === 'POST') {
        const body = await readRequestBody(request);
        const payload = JSON.parse(body || '{}') as {
          urls?: string[];
          browser_config?: {
            headless?: boolean;
            user_agent?: string;
          };
          crawler_config?: {
            params?: {
              wait_until?: string;
            };
          };
        };
        lastCrawlRequest = payload;
        const targetUrl = payload.urls?.[0] || `${requestUrl.origin}/`;
        const targetOrigin = new URL(targetUrl).origin;
        const crawlUserAgent = payload.browser_config?.user_agent || 'none';
        const crawlHeadless = String(payload.browser_config?.headless);
        const crawlWaitUntil =
          payload.crawler_config?.params?.wait_until || 'unset';

        send(
          response,
          200,
          { 'Content-Type': 'application/json' },
          JSON.stringify({
            success: true,
            url: targetUrl,
            cleaned_html: baseHtml(
              'Crawl4ai Fixture',
              `<p id="crawl-user-agent">${crawlUserAgent}</p>
<p id="crawl-headless">${crawlHeadless}</p>
<p id="crawl-wait-until">${crawlWaitUntil}</p>
<a href="/relative" title="Crawl relative">Crawl Relative</a>`,
            ),
            markdown: '# Crawl4ai Fixture',
            links: {
              internal: [
                {
                  href: '/relative',
                  text: 'Crawl Relative',
                  title: 'Crawl relative',
                },
              ],
              external: [
                {
                  href: `${targetOrigin}/external`,
                  text: 'Crawl External',
                },
              ],
            },
          }),
        );
        return;
      }

      const fixtureName = htmlForFixture(pathname);
      if (fixtureName) {
        const html = await readFile(join(testdataDir, fixtureName), 'utf-8');
        send(
          response,
          200,
          { 'Content-Type': 'text/html; charset=utf-8' },
          html,
        );
        return;
      }

      send(
        response,
        404,
        { 'Content-Type': 'text/plain; charset=utf-8' },
        'Not found',
      );
    } catch (error) {
      send(
        response,
        500,
        { 'Content-Type': 'text/plain; charset=utf-8' },
        error instanceof Error ? error.message : String(error),
      );
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Fixture server failed to bind to a local port');
  }

  const origin = `http://127.0.0.1:${address.port}`;

  return {
    origin,
    url: (path = '/') => new URL(path, origin).toString(),
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
    requests: () => requestCount,
    lastCrawlRequest: () => lastCrawlRequest,
  };
}
