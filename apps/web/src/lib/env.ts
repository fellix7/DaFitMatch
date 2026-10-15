import { z } from 'zod';

// Only VITE_-prefixed vars reach the browser. Never add secret or service-role keys here.
const WebEnv = z.object({
  VITE_SUPABASE_URL: z.url(),
  VITE_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  VITE_API_URL: z.url(),
  VITE_SENTRY_DSN: z.string().optional(),
  VITE_POSTHOG_KEY: z.string().optional(),
  VITE_POSTHOG_HOST: z.string().optional(),
  /** Dev/testing only: show an email + password form for the shared developer account. */
  VITE_DEV_PASSWORD_LOGIN: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

const parsed = WebEnv.safeParse(import.meta.env);
if (!parsed.success) {
  throw new Error(
    `Invalid web env (copy .env.example to .env at the repo root):\n${parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n')}`,
  );
}

export const env = parsed.data;
