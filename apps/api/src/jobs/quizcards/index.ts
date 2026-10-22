import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@dafitmatch/shared/db';
import { QUIZ_CARD_COUNT } from '@dafitmatch/shared';

type ProductGender = Database['public']['Enums']['product_gender'];
type Slot = Database['public']['Enums']['slot'];

interface CandidateRow {
  id: string;
  slot: Slot;
  gender: ProductGender;
  image_url: string;
  similarity: number;
}

export interface QuizCardOptions {
  /** Cards per archetype and gender. */
  cardsPerArchetype?: number;
  /** Items per card (2–4, the schema's limit). */
  itemsPerCard?: number;
  /** Genders to build cards for. */
  genders?: ProductGender[];
  /** Plan the run, write nothing. */
  dryRun?: boolean;
  /** Deactivate the previous cards of an archetype before inserting the new ones. */
  replace?: boolean;
  onProgress?: (progress: { archetype: string; cards: number }) => void;
}

export interface QuizCardReport {
  archetypes: number;
  cards: number;
  skipped: number;
  items: number;
}

/** Slots a card is built from, in the order they appear on the card. */
const CARD_SLOTS: Slot[] = ['full', 'top', 'bottom', 'footwear', 'accessory'];

/**
 * Builds the onboarding swipe cards.
 *
 * A card is a mini outfit (2–4 catalog items) that stands in for an archetype: the items are the
 * products closest to the archetype centroid, so a swipe teaches the taste vector something real.
 * Cards are built offline; the live quiz only reads them.
 */
export async function generateQuizCards(
  client: SupabaseClient<Database>,
  options: QuizCardOptions = {},
): Promise<QuizCardReport> {
  const perArchetype = Math.max(1, options.cardsPerArchetype ?? 4);
  const maxItems = Math.min(4, Math.max(2, options.itemsPerCard ?? 3));
  const genders = options.genders ?? (['women', 'men'] as ProductGender[]);
  const report: QuizCardReport = { archetypes: 0, cards: 0, skipped: 0, items: 0 };

  const { data: archetypes, error } = await client
    .from('archetypes')
    .select('id, slug, centroid')
    .order('slug', { ascending: true });
  if (error) throw new Error(`could not read archetypes: ${error.message}`);

  for (const archetype of archetypes ?? []) {
    report.archetypes += 1;
    if (!archetype.centroid) {
      report.skipped += 1;
      continue;
    }

    for (const gender of genders) {
      const candidates = await loadCandidates(client, archetype.id, gender);
      if (candidates.size === 0) {
        report.skipped += 1;
        continue;
      }

      const cards = buildCards(candidates, perArchetype, maxItems);
      if (cards.length === 0) {
        report.skipped += 1;
        continue;
      }

      if (!options.dryRun) {
        if (options.replace !== false) {
          await client
            .from('quiz_cards')
            .update({ active: false })
            .eq('archetype_id', archetype.id)
            .eq('gender', gender);
        }
        const { error: insertError } = await client.from('quiz_cards').insert(
          cards.map((card) => ({
            archetype_id: archetype.id,
            gender,
            item_ids: card.itemIds,
            image_urls: card.imageUrls,
            active: true,
          })),
        );
        if (insertError) throw new Error(`could not insert quiz cards: ${insertError.message}`);
      }

      report.cards += cards.length;
      report.items += cards.reduce((sum, card) => sum + card.itemIds.length, 0);
      options.onProgress?.({ archetype: archetype.slug, cards: cards.length });
    }
  }

  return report;
}

interface BuiltCard {
  itemIds: string[];
  imageUrls: string[];
}

/**
 * Pairs the closest items per slot into cards: the best top with the best bottom and shoes, the
 * second best with the second best, and so on.
 */
export function buildCards(
  candidates: Map<Slot, CandidateRow[]>,
  perArchetype: number,
  maxItems: number,
): BuiltCard[] {
  const slots = CARD_SLOTS.filter((slot) => (candidates.get(slot) ?? []).length > 0);
  if (slots.length === 0) return [];

  const cards: BuiltCard[] = [];
  for (let index = 0; index < perArchetype; index += 1) {
    const itemIds: string[] = [];
    const imageUrls: string[] = [];
    for (const slot of slots) {
      if (itemIds.length >= maxItems) break;
      const row = candidates.get(slot)?.[index];
      if (!row) continue;
      itemIds.push(row.id);
      imageUrls.push(row.image_url);
    }
    if (itemIds.length >= 2) cards.push({ itemIds, imageUrls });
  }
  return cards;
}

async function loadCandidates(
  client: SupabaseClient<Database>,
  archetypeId: string,
  gender: ProductGender,
): Promise<Map<Slot, CandidateRow[]>> {
  const bySlot = new Map<Slot, CandidateRow[]>();
  for (const slot of CARD_SLOTS) {
    const { data, error } = await client.rpc('archetype_slot_products', {
      p_archetype_id: archetypeId,
      p_slot: slot,
      p_gender: gender,
      k: 6,
    });
    if (error) throw new Error(`could not read ${slot} products: ${error.message}`);
    bySlot.set(slot, (data ?? []) as CandidateRow[]);
  }
  return bySlot;
}

/** How many cards the quiz needs per gender; the generator aims for a bit more than that. */
export const QUIZ_CARDS_PER_GENDER = Math.ceil(QUIZ_CARD_COUNT / 2);
