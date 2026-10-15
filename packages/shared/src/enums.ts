import { z } from 'zod';

// Every enum here mirrors a Postgres enum in supabase/migrations. Change both together
// (new migration + `pnpm db:types`); enums.test.ts asserts they stay in sync.

export const ProductSource = z.enum(['myntra', 'ajio', 'flipkart', 'amazon', 'other']);
export type ProductSource = z.infer<typeof ProductSource>;

export const Slot = z.enum(['top', 'bottom', 'footwear', 'layer', 'accessory', 'full']);
export type Slot = z.infer<typeof Slot>;

export const ProductGender = z.enum(['men', 'women', 'unisex']);
export type ProductGender = z.infer<typeof ProductGender>;

export const GenderPresentation = z.enum(['masculine', 'feminine', 'androgynous']);
export type GenderPresentation = z.infer<typeof GenderPresentation>;

export const CoordinationMode = z.enum(['matching', 'complementary', 'one_leads']);
export type CoordinationMode = z.infer<typeof CoordinationMode>;

export const Occasion = z.enum(['brunch', 'dinner', 'gallery', 'rooftop', 'movie', 'festive']);
export type Occasion = z.infer<typeof Occasion>;

export const RoomStatus = z.enum(['open', 'active', 'locked', 'closed']);
export type RoomStatus = z.infer<typeof RoomStatus>;

export const Vote = z.enum(['up', 'down']);
export type Vote = z.infer<typeof Vote>;

export const InteractionAction = z.enum(['like', 'skip', 'love', 'save', 'click', 'tryon', 'swap']);
export type InteractionAction = z.infer<typeof InteractionAction>;

export const InteractionTarget = z.enum([
  'product',
  'outfit',
  'room_pair',
  'venue',
  'archetype',
  'wardrobe_item',
]);
export type InteractionTarget = z.infer<typeof InteractionTarget>;

export const TryOnStatus = z.enum(['queued', 'running', 'succeeded', 'failed']);
export type TryOnStatus = z.infer<typeof TryOnStatus>;

/** How the composer uses the caller's own wardrobe. App-level only (no DB enum). */
export const WardrobeMode = z.enum(['off', 'mix', 'only']);
export type WardrobeMode = z.infer<typeof WardrobeMode>;
