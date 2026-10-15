import { z } from 'zod';
import { GenderPresentation, Occasion, ProductGender, WardrobeMode } from '../enums';
import { ColorName, Inr } from './common';
import { FitPrefs } from './taste';

/**
 * Answers from the "Try now" style builder. Filled in as a GUEST (kept in the browser), then sent
 * with PUT /me/taste right after sign-in so nothing the user chose is lost.
 * Profile-level fields are saved to `profiles` + `taste_profiles`; date-level fields (occasion,
 * budget, wardrobe mode) also seed the first "Generate fit" request.
 */
export const StyleQuizAnswers = z.object({
  // about you
  gender_presentation: GenderPresentation,
  /** Which catalog section to shop from. */
  shop_gender: ProductGender,
  height_cm: z.number().int().min(100).max(250).optional(),

  // the date
  occasion: Occasion,
  budget_inr: Inr.min(500).max(200_000),

  // style
  /** 1–3 archetype slugs, most-liked first. */
  archetypes: z
    .array(z.string().regex(/^[a-z0-9-]+$/))
    .min(1)
    .max(3),
  colors_like: z.array(ColorName).max(8),
  colors_avoid: z.array(ColorName).max(8),
  never_wear: z.array(z.string().min(1).max(40)).max(12),
  /** 1 = all comfort, 5 = all statement. */
  comfort_vs_statement: z.number().int().min(1).max(5),
  fit_prefs: FitPrefs,

  wardrobe_mode: WardrobeMode,
});
export type StyleQuizAnswers = z.infer<typeof StyleQuizAnswers>;

/** Weights for picked archetypes: first pick weighs most, then normalised to sum to 1. */
export function archetypeWeightsFromPicks(slugs: readonly string[]): Record<string, number> {
  const raw = slugs.map((_, i) => slugs.length - i);
  const total = raw.reduce((a, b) => a + b, 0);
  return Object.fromEntries(slugs.map((s, i) => [s, Math.round((raw[i]! / total) * 1000) / 1000]));
}
