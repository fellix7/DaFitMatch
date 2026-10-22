import {
  COLOR_VOCAB,
  type FeedProductRow,
  type ProductGender,
  type Slot,
} from '@dafitmatch/shared';
import { containsPhrase, mapCategoryToSlot, normalizeText } from './slots';

/**
 * Parses a vendor price ("₹1,299", "Rs. 2499.00", "1 299") into whole rupees.
 * Returns null when there is no usable number (the row is skipped, never guessed).
 */
export function parsePriceInr(raw: unknown): number | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw >= 0 ? Math.round(raw) : null;
  }
  if (typeof raw !== 'string') return null;
  // The first number in the cell, with Indian/English thousand separators removed.
  const match = raw.match(/\d[\d,.\s]*/);
  if (!match) return null;
  const cleaned = match[0].replace(/[,\s]/g, '');
  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value);
}

/** Lowercase, punctuation-free category text, e.g. "Men's Casual Wear > T-Shirts" -> "men s casual wear t shirts". */
export function normalizeCategory(raw: string): string {
  return normalizeText(raw)
    .replace(/\s*>\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Maps a vendor gender value onto the catalog enum, falling back to the product text. */
export function normalizeGender(raw: unknown, hintText = ''): ProductGender {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (value.startsWith('m') && value !== 'multi') return 'men';
  if (value.startsWith('w')) return 'women';
  if (value.startsWith('u')) return 'unisex';
  const hint = normalizeText(hintText);
  if (containsPhrase(hint, 'women')) return 'women';
  if (containsPhrase(hint, 'men')) return 'men';
  if (containsPhrase(hint, 'unisex')) return 'unisex';
  return 'unisex';
}

/**
 * Colours mentioned in the product text, restricted to the shared COLOR_VOCAB.
 * A multi-word colour ("sky blue") wins over its parts ("blue").
 */
export function extractColors(...texts: string[]): string[] {
  const text = normalizeText(texts.join(' '));
  const found: string[] = [];
  for (const color of [...COLOR_VOCAB].sort((a, b) => b.length - a.length)) {
    if (containsPhrase(text, color)) found.push(color);
  }
  const multi = found.filter((c) => c.includes(' '));
  const singles = found.filter(
    (c) => !c.includes(' ') && !multi.some((m) => m.split(' ').includes(c)),
  );
  return [...multi, ...singles].slice(0, 6);
}

export type NormalisedRow =
  | { ok: true; row: CatalogRowDraft }
  | { ok: false; reason: 'unmappable_slot' | 'bad_price'; detail: string };

/** The parts of a catalog row that normalisation derives from a feed row. */
export interface CatalogRowDraft {
  source: FeedProductRow['source'];
  external_id: string;
  brand: string;
  title: string;
  category: string;
  slot: Slot;
  gender: ProductGender;
  colors: string[];
  formality: number;
  occasions: string[];
  price_inr: number;
  image_url: string;
  affiliate_url: string;
  in_stock: boolean;
}

/** Provisional formality until the offline LLM tagger runs (it overwrites colours/occasions too). */
export const PROVISIONAL_FORMALITY = 3;

/**
 * Turns a validated feed row into a catalog row: cleans the category, maps the slot, extracts
 * colours and normalises the price. Unknown slots are rejected (and logged) rather than guessed.
 */
export function normaliseFeedRow(row: FeedProductRow): NormalisedRow {
  const price = parsePriceInr(row.price_inr);
  if (price === null) return { ok: false, reason: 'bad_price', detail: String(row.price_inr) };

  const category = normalizeCategory(row.category_raw);
  const slot = mapCategoryToSlot(row.category_raw, row.title);
  if (!slot) return { ok: false, reason: 'unmappable_slot', detail: row.category_raw };

  return {
    ok: true,
    row: {
      source: row.source,
      external_id: row.external_id.trim(),
      brand: row.brand.trim(),
      title: row.title.trim(),
      category,
      slot,
      gender: row.gender,
      colors: extractColors(row.title, row.brand),
      formality: PROVISIONAL_FORMALITY,
      occasions: [],
      price_inr: price,
      image_url: row.image_url,
      affiliate_url: row.affiliate_url,
      in_stock: row.in_stock,
    },
  };
}
