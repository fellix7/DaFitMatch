import { describe, expect, it } from 'vitest';
import { HealthResponse } from '@dafitmatch/shared';
import { makeApp } from './helpers';

describe('GET /health', () => {
  it('is public and reports api + db ok', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = HealthResponse.parse(res.json());
    expect(body).toMatchObject({ status: 'ok', api: 'ok', db: 'ok' });
    await app.close();
  });

  it('returns 503 degraded when the database is unreachable', async () => {
    const app = await makeApp({
      checkDb: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ status: 'degraded', db: 'down' });
    await app.close();
  });

  it('sets security headers', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    await app.close();
  });
});

describe('CORS', () => {
  it('allows only the configured web origin', async () => {
    const app = await makeApp();
    const ok = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'http://localhost:5173' },
    });
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');

    const evil = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://evil.example' },
    });
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
    await app.close();
  });
});

describe('unknown routes', () => {
  it('return the shared ApiError shape', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: 'not_found' } });
    await app.close();
  });
});
