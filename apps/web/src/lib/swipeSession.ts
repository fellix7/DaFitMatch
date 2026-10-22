import type { QuizSwipe } from '@dafitmatch/shared';

/**
 * Keeps a quiz run alive across reloads.
 *
 * The swipe deck is the longest step of onboarding, and losing 20 swipes to a refresh is the
 * fastest way to lose a user. State lives in sessionStorage (per tab, cleared with it) and is
 * keyed by catalog section, so switching sections starts a fresh run.
 */
export interface SwipeSession {
  /** Card ids already answered, in order. */
  swipes: QuizSwipe[];
  /** Index of the card on screen. */
  index: number;
  /** Epoch ms of the last write; used to drop stale runs. */
  updatedAt: number;
}

/** Sessions older than this are ignored (a run is not worth resuming a week later). */
export const SESSION_TTL_MS = 1000 * 60 * 60 * 6;

export function sessionKey(gender: string): string {
  return `dafitmatch:quiz-swipes:${gender}`;
}

export function emptySession(): SwipeSession {
  return { swipes: [], index: 0, updatedAt: Date.now() };
}

function isSession(value: unknown): value is SwipeSession {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<SwipeSession>;
  return (
    Array.isArray(candidate.swipes) &&
    typeof candidate.index === 'number' &&
    typeof candidate.updatedAt === 'number'
  );
}

/** Reads a saved run, ignoring anything malformed or expired. */
export function readSession(storage: Storage, key: string, now = Date.now()): SwipeSession | null {
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isSession(parsed)) return null;
    if (now - parsed.updatedAt > SESSION_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Saves a run. Storage failures (private mode, quota) must never break the quiz. */
export function writeSession(storage: Storage, key: string, session: SwipeSession): void {
  try {
    storage.setItem(key, JSON.stringify(session));
  } catch {
    // Ignore: the quiz still works, it just will not resume.
  }
}

export function clearSession(storage: Storage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // Ignore.
  }
}
