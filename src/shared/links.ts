import * as cheerio from 'cheerio';
import type { Link } from './types';

function splitClasses(value?: string): string[] | undefined {
  const classes = value?.split(/\s+/).filter((className) => className.trim());
  return classes && classes.length > 0 ? classes : undefined;
}

export function resolveHref(href: string, baseUrl: string): string {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return href;
  }
}

export function extractHtmlLinks(html: string, baseUrl: string): Link[] {
  const $ = cheerio.load(html);
  const links: Link[] = [];
  const seen = new Set<string>();

  $('a[href]').each((_, element) => {
    const $link = $(element);
    const href = $link.attr('href');

    if (!href) {
      return;
    }

    const absoluteHref = resolveHref(href, baseUrl);
    if (seen.has(absoluteHref)) {
      return;
    }

    seen.add(absoluteHref);
    links.push({
      href: absoluteHref,
      text: $link.text().trim() || '',
      title: $link.attr('title'),
      ariaLabel: $link.attr('aria-label'),
      rel: $link.attr('rel'),
      target: $link.attr('target'),
      classes: splitClasses($link.attr('class')),
    });
  });

  return links;
}

export async function extractBrowserLinks(page: {
  evaluate: <T>(fn: () => T) => Promise<T>;
}): Promise<Link[]> {
  return page.evaluate(() => {
    const linkMap = new Map<string, Link>();

    document.querySelectorAll('a[href]').forEach((anchor) => {
      const link = anchor as HTMLAnchorElement;
      const href = link.href;

      if (linkMap.has(href)) {
        return;
      }

      const className =
        typeof link.className === 'string' ? link.className : undefined;

      linkMap.set(href, {
        href,
        text: link.textContent?.trim() || '',
        title: link.title || undefined,
        ariaLabel: link.getAttribute('aria-label') || undefined,
        rel: link.rel || undefined,
        target: link.target || undefined,
        classes: className
          ? className.split(/\s+/).filter((className) => className.trim())
          : undefined,
      });
    });

    return Array.from(linkMap.values());
  });
}
