import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startFixtureServer, type FixtureServer } from '../testdata/local-server';
import { getSpider } from './index';

describe.skipIf(process.env.RUN_CLOAKBROWSER_TESTS !== '1')(
  'CloakBrowser optional runtime',
  () => {
    let server: FixtureServer;

    beforeAll(async () => {
      server = await startFixtureServer();
    });

    afterAll(async () => {
      await server.close();
    });

    it('uses CloakBrowser only when stealth is explicitly enabled', async () => {
      const spider = await getSpider({
        adapter: 'crawlee',
        headless: true,
        stealth: true,
        cloak: {
          autoUpdate: process.env.CLOAKBROWSER_AUTO_UPDATE !== 'false',
          executablePath: process.env.CLOAKBROWSER_BINARY_PATH,
        },
      });

      const page = await spider.fetch(server.url('/'), { cache: false });

      expect(page.url).toContain(server.origin);
      expect(page.content).toContain('Fixture Home');
      expect(page.links.length).toBeGreaterThan(0);
    }, 120000);
  },
);
