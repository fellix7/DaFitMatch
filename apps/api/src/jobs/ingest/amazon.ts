/**
 * Amazon Associates link building.
 *
 * Deliberately NOT a product API: the Associates Product Advertising API needs a separate
 * approval and the team has not applied yet. Until then we only build tagged links for the
 * ASINs the team curates by hand - no scraping, no crawling.
 */

const ASIN_PATTERN = /^[A-Z0-9]{10}$/;

/** Pulls the ASIN out of an Amazon product URL, or null when the URL has none. */
export function extractAsin(input: string): string | null {
  const value = input.trim();
  if (ASIN_PATTERN.test(value.toUpperCase())) return value.toUpperCase();
  const match = value.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/i);
  return match?.[1] ? match[1].toUpperCase() : null;
}

export interface AmazonLink {
  asin: string;
  url: string;
  /** Kept so the caller can show the product title next to the link. */
  title?: string;
}

export interface AmazonLinkOptions {
  /** The Associates tracking id, e.g. "dafitmatch-21". */
  tag: string;
  /** Marketplace host suffix. */
  marketplace?: string;
}

/** Builds a tagged Amazon link for each ASIN. Invalid ASINs are skipped, not fatal. */
export function buildAmazonLinks(
  items: readonly { asin?: string; url?: string; title?: string }[],
  options: AmazonLinkOptions,
): { links: AmazonLink[]; skipped: string[] } {
  const tag = options.tag.trim();
  if (!/^[a-zA-Z0-9_-]{6,40}$/.test(tag)) {
    throw new Error('Amazon Associates tag must be 6-40 characters of letters, digits, - or _');
  }
  const host = options.marketplace ?? 'amazon.in';
  const links: AmazonLink[] = [];
  const skipped: string[] = [];

  for (const item of items) {
    const asin = extractAsin(item.asin ?? item.url ?? '');
    if (!asin) {
      skipped.push(item.asin ?? item.url ?? '(empty)');
      continue;
    }
    const link: AmazonLink = {
      asin,
      url: `https://www.${host}/dp/${asin}?tag=${encodeURIComponent(tag)}`,
    };
    if (item.title) link.title = item.title;
    links.push(link);
  }
  return { links, skipped };
}
