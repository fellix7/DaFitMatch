import { describe, expect, it } from 'vitest';
import { allowedOrigins, parseEnv } from '../src/env';
import { testEnv } from './helpers';

describe('env', () => {
  it('refuses to boot when required vars are missing, listing each one', () => {
    expect(() => parseEnv({})).toThrowError(
      /SUPABASE_URL[\s\S]*SUPABASE_PUBLISHABLE_KEY[\s\S]*SUPABASE_SECRET_KEY[\s\S]*DATABASE_URL/,
    );
  });

  it('rejects a non-postgres DATABASE_URL', () => {
    expect(() => parseEnv({ ...testEnv, API_PORT: '8787', DATABASE_URL: 'mysql://x' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('applies defaults and treats empty optional keys as unset', () => {
    const env = parseEnv({
      WEB_ORIGIN: 'http://localhost:5173',
      SUPABASE_URL: 'http://127.0.0.1:54321',
      SUPABASE_PUBLISHABLE_KEY: 'p',
      SUPABASE_SECRET_KEY: 's',
      DATABASE_URL: 'postgresql://x',
      FAL_KEY: '',
    });
    expect(env.API_PORT).toBe(8787);
    expect(env.NODE_ENV).toBe('development');
    expect(env.FAL_KEY).toBeUndefined();
  });

  it('supports several comma-separated web origins', () => {
    expect(allowedOrigins({ ...testEnv, WEB_ORIGIN: 'http://a.test, https://b.test' })).toEqual([
      'http://a.test',
      'https://b.test',
    ]);
  });
});
