import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const browserRoot = process.env.PLAYWRIGHT_BROWSERS_PATH;
const explicitExecutablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?.trim();

if (!browserRoot && !explicitExecutablePath) {
  throw new Error(
    'Set PLAYWRIGHT_BROWSERS_PATH for a Playwright runtime or PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH for system Chromium',
  );
}

const playwrightRoot = dirname(require.resolve('playwright'));
const playwrightRequire = createRequire(join(playwrightRoot, 'package.json'));
const playwrightCoreRoot = dirname(playwrightRequire.resolve('playwright-core'));
const playwrightPackage = JSON.parse(
  await readFile(join(playwrightRoot, 'package.json'), 'utf8'),
);
const browserMetadata = JSON.parse(
  await readFile(join(playwrightCoreRoot, 'browsers.json'), 'utf8'),
);

const expectedVersion = process.env.EXPECTED_PLAYWRIGHT_VERSION;
if (expectedVersion && playwrightPackage.version !== expectedVersion) {
  throw new Error(
    `Expected Playwright ${expectedVersion}, found ${playwrightPackage.version}`,
  );
}

const requiredBrowsers = ['chromium', 'chromium-headless-shell', 'ffmpeg'];
const installed = new Map(
  browserMetadata.browsers.map((browser) => [browser.name, browser]),
);

if (browserRoot && process.platform === 'linux') {
  for (const browserName of requiredBrowsers) {
    const browser = installed.get(browserName);
    if (!browser) {
      throw new Error(`Playwright metadata does not declare ${browserName}`);
    }

    const directoryName = `${browserName.replaceAll('-', '_')}-${browser.revision}`;
    const browserPath = join(browserRoot, directoryName);
    try {
      await access(browserPath, constants.R_OK | constants.X_OK);
    } catch {
      throw new Error(
        `Missing Playwright ${browserName} revision ${browser.revision} at ${browserPath}`,
      );
    }
  }
}

const chromiumMetadata = installed.get('chromium');
const expectedChromiumRevision =
  process.env.EXPECTED_PLAYWRIGHT_CHROMIUM_REVISION;
if (
  expectedChromiumRevision &&
  chromiumMetadata.revision !== expectedChromiumRevision
) {
  throw new Error(
    `Expected Chromium revision ${expectedChromiumRevision}, found ${chromiumMetadata.revision}`,
  );
}

const resolvedExecutablePath =
  explicitExecutablePath || chromium.executablePath();
await access(resolvedExecutablePath, constants.R_OK | constants.X_OK);

const browser = await chromium.launch({
  headless: true,
  ...(explicitExecutablePath
    ? { executablePath: explicitExecutablePath }
    : {}),
});
try {
  const page = await browser.newPage();
  await page.setContent('<main id="runtime-check">Spider browser runtime</main>');
  const text = await page.locator('#runtime-check').textContent();
  if (text !== 'Spider browser runtime') {
    throw new Error('Playwright launched, but the runtime page check failed');
  }
} finally {
  await browser.close();
}

console.log(
  `Playwright ${playwrightPackage.version} runtime verified with Chromium revision ${chromiumMetadata.revision}.`,
);
