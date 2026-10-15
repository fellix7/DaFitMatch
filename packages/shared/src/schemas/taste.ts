import { z } from 'zod';
import { ColorName, Id, Timestamp } from './common';

/** archetype slug -> weight in [0, 1]. */
export const ArchetypeWeights = z.record(z.string(), z.number().min(0).max(1));

export const FitPrefs = z
  .object({
    top: z.enum(['slim', 'regular', 'relaxed', 'oversized']).optional(),
    bottom: z.enum(['skinny', 'slim', 'straight', 'relaxed', 'wide']).optional(),
    rise: z.enum(['low', 'mid', 'high']).optional(),
  })
  .catchall(z.string());

/**
 * API shape of a taste profile. `taste_vector` (halfvec(768)) is deliberately excluded:
 * vectors stay in the database and never travel to the browser.
 */
export const TasteProfile = z.object({
  user_id: Id,
  archetype_weights: ArchetypeWeights,
  colors_like: z.array(ColorName),
  colors_avoid: z.array(ColorName),
  never_wear: z.array(z.string()),
  /** 1 = all comfort, 5 = all statement. */
  comfort_vs_statement: z.number().int().min(1).max(5),
  fit_prefs: FitPrefs,
  interaction_count: z.number().int().nonnegative(),
  version: z.number().int().nonnegative(),
  updated_at: Timestamp,
});
export type TasteProfile = z.infer<typeof TasteProfile>;
