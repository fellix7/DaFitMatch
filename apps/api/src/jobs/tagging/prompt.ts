import { z } from 'zod';
import { COLOR_VOCAB, OCCASIONS, type Slot } from '@dafitmatch/shared';

/** One product handed to the tagger. */
export interface TagInput {
  id: string;
  title: string;
  brand: string;
  category: string;
  price_inr: number;
}

/** The tagger's answer for one product. */
export interface TagItem {
  id: string;
  slot: Slot;
  formality: number;
  colors: string[];
  occasions: string[];
}

export interface TagUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface TagBatchResult {
  items: TagItem[];
  usage: TagUsage;
}

/**
 * The tagger contract. The job never talks to a provider directly, so the tests can run without
 * a key and the CLI can swap in the real model.
 */
export type TagModel = (batch: TagInput[]) => Promise<TagBatchResult>;

/** Slots the tagger may return. `full` = a one-piece look (dress, kurta set, jumpsuit). */
export const TAG_SLOTS = ['top', 'bottom', 'full', 'footwear', 'layer', 'accessory'] as const;

export const TagItemSchema = z.object({
  id: z.string().min(1),
  slot: z.enum(TAG_SLOTS),
  formality: z.number().int().min(1).max(5),
  colors: z.array(z.enum(COLOR_VOCAB)).max(8),
  occasions: z.array(z.enum(OCCASIONS)).max(6),
});

export const TagBatchSchema = z.object({
  items: z.array(TagItemSchema),
});

/**
 * The tagging prompt. It only ever sees the product title, brand, category and price - never a
 * user id, never a photo, never a URL. The answer is constrained to the fixed colour vocabulary
 * and the shared occasion list, so the tags stay comparable across the catalog.
 */
export function buildTaggingPrompt(batch: TagInput[]): string {
  const catalogue = batch.map((item) => ({
    id: item.id,
    title: item.title,
    brand: item.brand,
    category: item.category,
    price_inr: item.price_inr,
  }));

  return [
    'You tag fashion products for an Indian dating outfit app.',
    'For every product, return: slot, formality, colors and occasions.',
    '',
    `slot - exactly one of: ${TAG_SLOTS.join(', ')}.`,
    "  'full' = a one-piece look (dress, kurta set, jumpsuit, sari).",
    '  Use the closest slot when unsure; never invent a new slot.',
    'formality - an integer 1 to 5:',
    '  1 = very casual (loungewear, graphic tee, sneakers),',
    '  2 = casual (jeans, casual shirt),',
    '  3 = smart casual (chinos, shirt with sneakers, blazer with tee),',
    '  4 = formal (dress shirt, tailored trousers, heels, blazer),',
    '  5 = black tie / heavy festive (sherwani, sequins, lehenga, tuxedo).',
    `colors - 0 to 8 colours from this list only: ${COLOR_VOCAB.join(', ')}.`,
    '  Use the dominant colours of the product. Empty list if the product has no clear colour.',
    `occasions - 0 to 6 from this list only: ${OCCASIONS.join(', ')}.`,
    '  Choose the occasions this product actually fits; empty list if none fit.',
    '',
    'Rules: keep the same id for every product, return one entry per product, no extra keys,',
    'no markdown, no explanation. Prices are in rupees.',
    '',
    JSON.stringify(catalogue),
  ].join('\n');
}
