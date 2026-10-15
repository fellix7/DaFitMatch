import { z } from 'zod';

/** Any 8-4-4-4-12 hex id. Loose on purpose: seed/test ids are not RFC 4122 versioned. */
export const Id = z.guid();
export const Timestamp = z.iso.datetime({ offset: true });
export const IsoDate = z.iso.date();
export const Inr = z.number().int().nonnegative();
/** Lowercase colour names, e.g. "navy", "ivory". */
export const ColorName = z.string().trim().toLowerCase().min(1).max(40);
export const HttpUrl = z.url({ protocol: /^https?$/ });

export const ApiError = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiError>;
