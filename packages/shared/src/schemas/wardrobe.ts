import { z } from 'zod';
import { Slot } from '../enums';
import { ColorName, Id, Timestamp } from './common';

/**
 * A garment the user already owns. Composer can mix these with buyable products.
 * The photo lives in the private `wardrobe-photos` bucket at `{user_id}/<file>`; the API returns
 * a short-lived signed `image_url`. `embedding` is filled by the batch embedder and never leaves the DB.
 */
export const WardrobeItem = z.object({
  id: Id,
  user_id: Id,
  slot: Slot,
  category: z.string().min(1).max(60),
  title: z.string().max(120).nullable(),
  colors: z.array(ColorName),
  formality: z.number().int().min(1).max(5).nullable(),
  occasions: z.array(z.string()),
  tags: z.array(z.string()),
  image_url: z.url().nullable(),
  /** False until the batch embedder has processed the item; until then it is matched by tags only. */
  is_embedded: z.boolean(),
  is_archived: z.boolean(),
  created_at: Timestamp,
  updated_at: Timestamp,
});
export type WardrobeItem = z.infer<typeof WardrobeItem>;

export const WardrobeImagePath = z
  .string()
  .regex(/^[0-9a-fA-F-]{36}\/[^/]+$/, 'Expected {user_id}/<file>');

const WardrobeItemFields = z.object({
  slot: Slot,
  category: z.string().min(1).max(60),
  title: z.string().max(120),
  colors: z.array(ColorName).max(5),
  formality: z.number().int().min(1).max(5),
  occasions: z.array(z.string()).max(6),
  tags: z.array(z.string()).max(12),
  /** Upload to `wardrobe-photos/{user_id}/...` with supabase-js first, then send the path. */
  image_path: WardrobeImagePath,
});

export const CreateWardrobeItemRequest = WardrobeItemFields.extend({
  title: WardrobeItemFields.shape.title.optional(),
  colors: WardrobeItemFields.shape.colors.default([]),
  formality: WardrobeItemFields.shape.formality.optional(),
  occasions: WardrobeItemFields.shape.occasions.default([]),
  tags: WardrobeItemFields.shape.tags.default([]),
  image_path: WardrobeImagePath.optional(),
});
export type CreateWardrobeItemRequest = z.infer<typeof CreateWardrobeItemRequest>;

/** Partial update; no defaults, so omitted fields are left untouched. */
export const UpdateWardrobeItemRequest = WardrobeItemFields.partial().extend({
  is_archived: z.boolean().optional(),
});
export type UpdateWardrobeItemRequest = z.infer<typeof UpdateWardrobeItemRequest>;
