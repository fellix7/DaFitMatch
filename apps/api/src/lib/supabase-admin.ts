import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@dafitmatch/shared/db';
import type { Env } from '../env';

/**
 * ⚠ SERVICE-ROLE client: bypasses RLS. Allowed ONLY in `src/jobs/**` and admin routes
 * (catalog/venue writes, try-on worker, cleanup). ESLint blocks importing it from user routes.
 * Never return its query results to a user without re-checking ownership.
 */
export function createServiceClient(env: Env): SupabaseClient<Database> {
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
