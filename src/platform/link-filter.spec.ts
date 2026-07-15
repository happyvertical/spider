import { describe, expect, it } from 'vitest';
import type { Link } from '../shared/types.js';
import { filterLinks } from './link-filter.js';

const link = (href: string, text = ''): Link => ({ href, text });

describe('filterLinks', () => {
  it('returns all links (deduped) when no filters are set', () => {
    const links = [link('/a'), link('/b'), link('/a')];
    expect(filterLinks(links)).toEqual([link('/a'), link('/b')]);
  });

  it('keeps links matching urlContains', () => {
    const links = [link('/jobs/123'), link('/about'), link('/jobs/456')];
    expect(filterLinks(links, { urlContains: ['/jobs/'] })).toEqual([
      link('/jobs/123'),
      link('/jobs/456'),
    ]);
  });

  it('keeps links matching textContains', () => {
    const links = [link('/x', 'Apply now'), link('/y', 'Home')];
    expect(filterLinks(links, { textContains: ['apply'] })).toEqual([
      link('/x', 'Apply now'),
    ]);
  });

  it('unions url and text includes', () => {
    const links = [
      link('/jobs/1', 'Role'),
      link('/p', 'View posting'),
      link('/q', 'Nope'),
    ];
    expect(
      filterLinks(links, {
        urlContains: ['/jobs/'],
        textContains: ['posting'],
      }),
    ).toEqual([link('/jobs/1', 'Role'), link('/p', 'View posting')]);
  });

  it('drops excluded links by href or text', () => {
    const links = [
      link('/jobs/1', 'Role'),
      link('/jobs/login', 'Sign in'),
      link('/jobs/2', 'Apply'),
    ];
    expect(
      filterLinks(links, {
        urlContains: ['/jobs/'],
        excludes: ['login', 'sign in'],
      }),
    ).toEqual([link('/jobs/1', 'Role'), link('/jobs/2', 'Apply')]);
  });

  it('can keep duplicates when dedupe is false', () => {
    const links = [link('/a'), link('/a')];
    expect(filterLinks(links, { dedupe: false })).toHaveLength(2);
  });
});
