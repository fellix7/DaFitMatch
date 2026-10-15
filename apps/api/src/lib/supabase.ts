import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@dafitmatch/shared/db';
import type { Env } from '../env';

export type UserSupabaseClient = SupabaseClient<Database>;

/**
 * A client that acts AS the calling user: publishable key + the user's access token, so every
 * query goes through RLS exactly as it would from the browser. Use this in all request handlers.
 */
export function createUserClient(env: Env, accessToken: string): UserSupabaseClient {
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export type UserClientFactory = (accessToken: string) => UserSupabaseClient;
