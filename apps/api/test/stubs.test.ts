import { describe, expect, it } from 'vitest';
import { endpoints, type EndpointName } from '@dafitmatch/shared';
import { makeApp, signToken, USER_ID } from './helpers';

const ID = '22222222-2222-4222-8222-222222222222';

// A valid request for every not-yet-implemented endpoint.
const valid: Partial<Record<EndpointName, { url: string; payload?: object }>> = {
  composeOutfits: {
    url: '/outfits/compose',
    payload: { occasion: 'dinner', budget_inr: 5000, gender: 'women' },
  },
  getOutfit: { url: `/outfits/${ID}` },
  listWardrobe: { url: '/wardrobe' },
  addWardrobeItem: { url: '/wardrobe', payload: { slot: 'top', category: 'shirt' } },
  updateWardrobeItem: { url: `/wardrobe/${ID}`, payload: { title: 'Linen shirt' } },
  deleteWardrobeItem: { url: `/wardrobe/${ID}` },
  createRoom: { url: '/rooms', payload: { coordination_mode: 'matching', occasion: 'brunch' } },
  joinRoom: { url: '/rooms/join', payload: { invite_code: 'AB12CD34' } },
  getRoom: { url: `/rooms/${ID}` },
  leaveRoom: { url: `/rooms/${ID}/leave` },
  votePair: { url: `/rooms/${ID}/pairs/${ID}/vote`, payload: { vote: 'up' } },
  lockPair: { url: `/rooms/${ID}/pairs/${ID}/lock` },
  requestTryOn: { url: '/tryon', payload: { product_id: ID, photo_path: `${USER_ID}/me.jpg` } },
  getTryOn: { url: `/tryon/${ID}` },
  listVenues: { url: '/venues?limit=3' },
  shopOutfit: { url: `/shop/outfits/${ID}` },
};

const stubbed = (Object.keys(endpoints) as EndpointName[]).filter(
  (n) => !['health', 'me', 'confirmAge'].includes(n),
);

describe('stub routes', () => {
  it('every contract endpoint has a test case', () => {
    expect(Object.keys(valid).sort()).toEqual([...stubbed].sort());
  });

  for (const name of stubbed) {
    const def = endpoints[name];
    const req = valid[name]!;

    it(`${def.method} ${def.path}: 401 without a token, 501 with one`, async () => {
      const app = await makeApp();
      const anon = await app.inject({ method: def.method, url: req.url, payload: req.payload });
      expect(anon.statusCode).toBe(401);

      const authed = await app.inject({
        method: def.method,
        url: req.url,
        payload: req.payload,
        headers: { authorization: `Bearer ${await signToken()}` },
      });
      expect(authed.statusCode).toBe(501);
      expect(authed.json()).toMatchObject({ error: { code: 'not_implemented' } });
      await app.close();
    });
  }

  it('validates input against the shared contract before the handler (400)', async () => {
    const app = await makeApp();
    const headers = { authorization: `Bearer ${await signToken()}` };
    const badBody = await app.inject({
      method: 'POST',
      url: '/outfits/compose',
      payload: { occasion: 'wedding', budget_inr: -1 },
      headers,
    });
    expect(badBody.statusCode).toBe(400);
    expect(badBody.json()).toMatchObject({ error: { code: 'bad_request' } });

    const badParam = await app.inject({ method: 'GET', url: '/rooms/not-a-uuid', headers });
    expect(badParam.statusCode).toBe(400);

    const traversal = await app.inject({
      method: 'POST',
      url: '/tryon',
      payload: { product_id: ID, photo_path: '../../etc/passwd' },
      headers,
    });
    expect(traversal.statusCode).toBe(400);
    await app.close();
  });
});
