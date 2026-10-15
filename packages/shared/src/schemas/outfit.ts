import { z } from 'zod';
import { Occasion } from '../enums';
import { Id, Inr, Timestamp } from './common';

export const Outfit = z.object({
  id: Id,
  owner_id: Id,
  archetype_id: Id.nullable(),
  item_ids: z.array(Id).min(1),
  total_price_inr: Inr,
  score: z.number().nullable(),
  rationale: z.string().nullable(),
  styling_tip: z.string().nullable(),
  occasion: Occasion.nullable(),
  created_at: Timestamp,
});
export type Outfit = z.infer<typeof Outfit>;
