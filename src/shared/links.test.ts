import { Window } from 'happy-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { extractBrowserLinks, extractHtmlLinks, resolveHref } from './links';

const originalDocument = globalThis.document;

afterEach(() => {
  globalThis.document = originalDocument;
});

describe('link utilities', () => {
  it('resolves valid hrefs and preserves invalid ones', () => {
    expect(resolveHref('/docs', 'https://example.com/base/')).toBe(
      'https://example.com/docs',
    );
    expect(resolveHref('http://[invalid', 'not-a-base-url')).toBe(
      'http://[invalid',
    );
  });

  it('extracts unique HTML links with metadata', () => {
    const links = extractHtmlLinks(
      `
        <a href="/docs" title="Docs" aria-label="Docs link" rel="nofollow" target="_blank" class="primary  docs">Docs</a>
        <a href="/docs">Duplicate</a>
        <a href="/plain">Plain</a>
      `,
      'https://example.com/base/',
    );

    expect(links).toEqual([
      {
        href: 'https://example.com/docs',
        text: 'Docs',
        title: 'Docs',
        ariaLabel: 'Docs link',
        rel: 'nofollow',
        target: '_blank',
        classes: ['primary', 'docs'],
      },
      {
        href: 'https://example.com/plain',
        text: 'Plain',
        title: undefined,
        ariaLabel: undefined,
        rel: undefined,
        target: undefined,
        classes: undefined,
      },
    ]);
  });

  it('extracts browser links with metadata and de-duplicates hrefs', async () => {
    const window = new Window();
    window.document.body.innerHTML = `
      <a href="https://example.com/a" title="A" aria-label="Alpha" rel="external" target="_blank" class="one two">Alpha</a>
      <a href="https://example.com/a">Duplicate</a>
      <a href="https://example.com/b">Beta</a>
    `;
    globalThis.document = window.document;

    const links = await extractBrowserLinks({
      evaluate: async (fn) => fn(),
    });

    expect(links).toEqual([
      {
        href: 'https://example.com/a',
        text: 'Alpha',
        title: 'A',
        ariaLabel: 'Alpha',
        rel: 'external',
        target: '_blank',
        classes: ['one', 'two'],
      },
      {
        href: 'https://example.com/b',
        text: 'Beta',
        title: undefined,
        ariaLabel: undefined,
        rel: undefined,
        target: undefined,
        classes: undefined,
      },
    ]);
  });
});
