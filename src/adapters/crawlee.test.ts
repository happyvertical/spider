import { Window } from 'happy-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { CrawleeAdapter } from './crawlee';

const originalDocument = globalThis.document;

afterEach(() => {
  globalThis.document = originalDocument;
});

describe('CrawleeAdapter', () => {
  it('expands interactive elements and merges browser links by href', async () => {
    const window = new Window();
    window.document.body.innerHTML = `
      <button aria-expanded="false">Open section</button>
      <details><summary>More</summary></details>
      <a href="https://example.com/initial" title="Initial" aria-label="Initial link" rel="nofollow" target="_blank" class="primary link">Initial</a>
      <a href="https://example.com/initial">Duplicate</a>
      <a href="#">Skip navigation</a>
      <a href="#">Menu</a>
      <a href="#">${'x'.repeat(101)}</a>
      <a href="https://example.com/final">Final</a>
    `;
    globalThis.document = window.document;

    const adapter = new CrawleeAdapter({ adapter: 'crawlee' });
    const links = await adapter.extractLinks({
      evaluate: async (fn: () => unknown) => fn(),
    });

    expect(links).toEqual([
      {
        href: 'https://example.com/initial',
        text: 'Initial',
        title: 'Initial',
        ariaLabel: 'Initial link',
        rel: 'nofollow',
        target: '_blank',
        classes: ['primary', 'link'],
      },
      {
        href: 'about:blank#',
        text: 'Skip navigation',
        title: undefined,
        ariaLabel: undefined,
        rel: undefined,
        target: undefined,
        classes: undefined,
      },
      {
        href: 'https://example.com/final',
        text: 'Final',
        title: undefined,
        ariaLabel: undefined,
        rel: undefined,
        target: undefined,
        classes: undefined,
      },
    ]);
  });
});
