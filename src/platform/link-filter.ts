import type { Link } from '../shared/types.js';

/** Declarative filter for narrowing extracted links to the ones you want. */
export interface LinkFilterConfig {
  /** Keep links whose href contains at least one of these (case-insensitive). */
  urlContains?: string[];
  /** Keep links whose text contains at least one of these (case-insensitive). */
  textContains?: string[];
  /** Drop links whose href or text contains any of these (case-insensitive). */
  excludes?: string[];
  /** Drop duplicate hrefs (default true). */
  dedupe?: boolean;
}

function lower(value: string | undefined): string {
  return (value ?? '').toLowerCase();
}

/**
 * Filter a page's links with a declarative config. When `urlContains` and/or
 * `textContains` are set a link is kept if EITHER matches (union); `excludes`
 * then removes any remaining hit. Adapted from praeco's parser-config filters.
 */
export function filterLinks(
  links: Link[],
  config: LinkFilterConfig = {},
): Link[] {
  const urlNeedles = config.urlContains?.map((s) => s.toLowerCase()) ?? [];
  const textNeedles = config.textContains?.map((s) => s.toLowerCase()) ?? [];
  const excludeNeedles = config.excludes?.map((s) => s.toLowerCase()) ?? [];
  const hasInclude = urlNeedles.length > 0 || textNeedles.length > 0;
  const dedupe = config.dedupe ?? true;
  const seen = new Set<string>();
  const result: Link[] = [];

  for (const link of links) {
    const href = lower(link.href);
    const text = lower(link.text);
    if (!href) continue;

    if (hasInclude) {
      const matches =
        urlNeedles.some((needle) => href.includes(needle)) ||
        textNeedles.some((needle) => text.includes(needle));
      if (!matches) continue;
    }

    if (
      excludeNeedles.some(
        (needle) => href.includes(needle) || text.includes(needle),
      )
    ) {
      continue;
    }

    if (dedupe) {
      // URL paths are case-sensitive; match case-insensitively but dedupe on
      // the original href so /Jobs/A and /jobs/a stay distinct.
      if (seen.has(link.href)) continue;
      seen.add(link.href);
    }
    result.push(link);
  }

  return result;
}
