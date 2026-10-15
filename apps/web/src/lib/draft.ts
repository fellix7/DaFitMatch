import { StyleQuizAnswers } from '@dafitmatch/shared';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type DraftAnswers = Partial<StyleQuizAnswers>;

const DEFAULTS: DraftAnswers = {
  archetypes: [],
  colors_like: [],
  colors_avoid: [],
  never_wear: [],
  comfort_vs_statement: 3,
  fit_prefs: {},
  wardrobe_mode: 'mix',
};

interface DraftState {
  answers: DraftAnswers;
  /** Set when the guest pressed "Generate fit": save to their profile once signed in. */
  pendingSave: boolean;
  set: (patch: DraftAnswers) => void;
  markPendingSave: () => void;
  /** Called only after the server confirmed the save. */
  clear: () => void;
}

/**
 * The guest's style-builder answers. Persisted in localStorage so they survive the full-page
 * Google sign-in redirect (and accidental refreshes) until PUT /me/taste succeeds.
 * Contains style preferences only: no birth date or other sensitive data.
 */
export const useDraft = create<DraftState>()(
  persist(
    (set) => ({
      answers: DEFAULTS,
      pendingSave: false,
      set: (patch) => set((s) => ({ answers: { ...s.answers, ...patch } })),
      markPendingSave: () => set({ pendingSave: true }),
      clear: () => set({ answers: DEFAULTS, pendingSave: false }),
    }),
    {
      name: 'dafitmatch.style-draft.v1',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ answers: s.answers, pendingSave: s.pendingSave }),
    },
  ),
);

/** Validate the draft against the shared contract. */
export function validateDraft(answers: DraftAnswers) {
  return StyleQuizAnswers.safeParse(answers);
}
