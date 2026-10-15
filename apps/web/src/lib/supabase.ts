import { createClient } from '@supabase/supabase-js';
import type { Database } from '@dafitmatch/shared/db';
import { env } from './env';

/**
 * Browser Supabase client: auth (magic link) and, later, direct uploads to the user's own folder
 * in private storage buckets. App data goes through `api` (src/lib/api.ts), not this client.
 */
export const supabase = createClient<Database>(
  env.VITE_SUPABASE_URL,
  env.VITE_SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
