import { z } from 'zod';
import { GenderPresentation } from '../enums';
import { Id, Inr, Timestamp } from './common';

export const Profile = z.object({
  id: Id,
  display_name: z.string().nullable(),
  gender_presentation: GenderPresentation.nullable(),
  height_cm: z.number().int().min(100).max(250).nullable(),
  city: z.string().nullable(),
  default_budget_inr: Inr.nullable(),
  is_adult: z.boolean(),
  /** Null until the age gate is completed. The birth date itself is never stored. */
  age_confirmed_at: Timestamp.nullable(),
  created_at: Timestamp,
  updated_at: Timestamp,
});
export type Profile = z.infer<typeof Profile>;

export const ConfirmAgeRequest = z.object({
  /** Used once to compute is_adult, then discarded (never stored or logged). */
  birth_date: z.iso.date(),
});
export type ConfirmAgeRequest = z.infer<typeof ConfirmAgeRequest>;

export const ConfirmAgeResponse = z.object({ is_adult: z.boolean() });
export type ConfirmAgeResponse = z.infer<typeof ConfirmAgeResponse>;

/** Fields a user may edit on their own profile. `is_adult` is set only via the confirm_age RPC. */
export const ProfileUpdate = Profile.pick({
  display_name: true,
  gender_presentation: true,
  height_cm: true,
  city: true,
  default_budget_inr: true,
}).partial();
export type ProfileUpdate = z.infer<typeof ProfileUpdate>;
