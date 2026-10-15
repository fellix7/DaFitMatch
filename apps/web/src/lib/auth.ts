import { supabase } from './supabase';

/** Only same-app paths are allowed as post-sign-in destinations (no open redirects). */
export function safeNext(next: string | null | undefined, fallback = '/app/feed'): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : fallback;
}

/**
 * Google sign-in (Supabase OAuth, PKCE). This leaves the page; Google sends the user back to
 * /auth/callback, which finishes sign-in, saves any pending style answers and continues to `next`.
 */
export async function signInWithGoogle(next = '/app/feed'): Promise<void> {
  const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext(next))}`;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, queryParams: { prompt: 'select_account' } },
  });
  if (error) throw error;
}

/**
 * DEV/TESTING ONLY: email + password sign-in for the shared developer account. The form is shown
 * only when VITE_DEV_PASSWORD_LOGIN=true; real users sign in with Google.
 */
export async function signInWithDevPassword(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}
