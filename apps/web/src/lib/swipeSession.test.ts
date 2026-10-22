import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearSession,
  emptySession,
  readSession,
  SESSION_TTL_MS,
  sessionKey,
  writeSession,
} from './swipeSession';

const key = sessionKey('all');

beforeEach(() => window.sessionStorage.clear());

describe('quiz swipe session', () => {
  it('keeps runs apart per catalog section', () => {
    expect(sessionKey('men')).not.toBe(sessionKey('all'));
  });

  it('round-trips a run', () => {
    const session = {
      swipes: [{ card_id: 'c1', action: 'like' as const }],
      index: 1,
      updatedAt: Date.now(),
    };
    writeSession(window.sessionStorage, key, session);
    expect(readSession(window.sessionStorage, key)).toEqual(session);
  });

  it('ignores a missing, malformed or expired run', () => {
    expect(readSession(window.sessionStorage, key)).toBeNull();
    window.sessionStorage.setItem(key, 'not json');
    expect(readSession(window.sessionStorage, key)).toBeNull();
    window.sessionStorage.setItem(key, JSON.stringify({ swipes: 'nope' }));
    expect(readSession(window.sessionStorage, key)).toBeNull();
    const stale = { ...emptySession(), updatedAt: Date.now() - SESSION_TTL_MS - 1000 };
    window.sessionStorage.setItem(key, JSON.stringify(stale));
    expect(
      readSession(window.sessionStorage, key, stale.updatedAt + SESSION_TTL_MS + 1),
    ).toBeNull();
  });

  it('clears a finished run', () => {
    writeSession(window.sessionStorage, key, emptySession());
    clearSession(window.sessionStorage, key);
    expect(readSession(window.sessionStorage, key)).toBeNull();
  });

  it('never throws when storage is unavailable', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    } as unknown as Storage;
    expect(() => writeSession(broken, key, emptySession())).not.toThrow();
    expect(() => clearSession(broken, key)).not.toThrow();
  });
});
