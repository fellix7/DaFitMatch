import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';
import { supabase } from './supabase';

interface SessionState {
  /** False until the persisted session has been read on startup. */
  ready: boolean;
  session: Session | null;
}

export const useSession = create<SessionState>(() => ({ ready: false, session: null }));

/** Wire supabase auth events into the store. Call once at startup. */
export function initSession(): () => void {
  void supabase.auth.getSession().then(({ data }) => {
    useSession.setState({ ready: true, session: data.session });
  });
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    useSession.setState({ ready: true, session });
  });
  return () => data.subscription.unsubscribe();
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
