import { z } from 'zod';
import { GenderPresentation, Occasion, ProductGender, WardrobeMode } from '../enums';
import {
  BUDGET_BAND_IDS,
  FIT_PREF_OPTIONS,
  LAUNCH_CITY,
  NEVER_WEAR_OPTIONS,
  QUIZ_CARD_COUNT,
} from '../constants';
import { ColorName, ColorVocab, HttpUrl, Id, Inr } from './common';
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

// ════════════════════════════════════════════════════════════════════════════════════════
// Phase 2 — visual onboarding quiz
// The old `StyleQuizAnswers` above powers the guest "Try now" builder (ADR 0007) and is unchanged.
// This is the swipe-card onboarding for signed-in users: `quiz_cards` → swipes → taste profile.
// ════════════════════════════════════════════════════════════════════════════════════════

/** Which catalog section to shop from during onboarding. */
export const QuizCatalog = z.enum(['menswear', 'womenswear', 'both']);
export type QuizCatalog = z.infer<typeof QuizCatalog>;

/** A swipe card: a mini outfit (top + bottom + footwear) of catalog products. */
export const QuizCard = z.object({
  id: Id,
  archetype_id: Id,
  item_ids: z.array(Id).min(1).max(4),
  image_urls: z.array(HttpUrl).min(1).max(4),
});
export type QuizCard = z.infer<typeof QuizCard>;

/** First screen of the quiz. Optional fields stay optional: we never infer body details. */
export const QuizBasics = z.object({
  catalog: QuizCatalog,
  city: z.string().min(1).max(80).default(LAUNCH_CITY),
  budget_band: z.enum(BUDGET_BAND_IDS),
  height_cm: z.number().int().min(100).max(250).optional(),
  fit_pref: z.enum(FIT_PREF_OPTIONS).optional(),
});
export type QuizBasics = z.infer<typeof QuizBasics>;

export const QuizSwipeAction = z.enum(['like', 'skip', 'love']);
export type QuizSwipeAction = z.infer<typeof QuizSwipeAction>;

export const QuizSwipe = z.object({
  card_id: Id,
  action: QuizSwipeAction,
});
export type QuizSwipe = z.infer<typeof QuizSwipe>;

/** Third screen of the quiz. `comfort_vs_statement` is a 0–100 slider (0 = all comfort). */
export const QuizHardRules = z.object({
  colors_like: z.array(ColorVocab).max(8),
  colors_avoid: z.array(ColorVocab).max(8),
  never_wear: z.array(z.enum(NEVER_WEAR_OPTIONS)).max(12),
  comfort_vs_statement: z.number().int().min(0).max(100),
});
export type QuizHardRules = z.infer<typeof QuizHardRules>;

/** A complete quiz submission: basics + exactly QUIZ_CARD_COUNT swipes + hard rules. */
export const QuizSubmission = z.object({
  basics: QuizBasics,
  swipes: z.array(QuizSwipe).length(QUIZ_CARD_COUNT),
  hard_rules: QuizHardRules,
});
export type QuizSubmission = z.infer<typeof QuizSubmission>;

/** Map the 0–100 quiz slider onto the 1–5 `taste_profiles.comfort_vs_statement` column. */
export function comfortFromSlider(slider: number): number {
  return Math.min(5, Math.max(1, 1 + Math.round(slider / 25)));
}
