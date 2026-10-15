import { z } from 'zod';
import { InteractionAction, InteractionTarget, TryOnStatus } from '../enums';
import { Id, Timestamp } from './common';

export const Interaction = z.object({
  id: Id,
  user_id: Id,
  target_type: InteractionTarget,
  target_id: Id,
  action: InteractionAction,
  created_at: Timestamp,
});
export type Interaction = z.infer<typeof Interaction>;

/**
 * API shape of a try-on. The API converts `result_path` into a short-lived signed URL;
 * `input_hash`, `input_photo_path` and `cost_usd` stay server-side.
 */
export const TryOn = z.object({
  id: Id,
  user_id: Id,
  outfit_id: Id.nullable(),
  product_id: Id,
  status: TryOnStatus,
  result_url: z.url().nullable(),
  created_at: Timestamp,
});
export type TryOn = z.infer<typeof TryOn>;
