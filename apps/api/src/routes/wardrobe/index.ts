import {
  ListWardrobeResponse,
  OkResponse,
  STORAGE_BUCKETS,
  WardrobeItem,
  WardrobeItemResponse,
  type CreateWardrobeItemRequest,
  type UpdateWardrobeItemRequest,
} from '@dafitmatch/shared';
import type { FastifyBaseLogger } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { HttpError, notFound } from '../../lib/errors';
import type { UserSupabaseClient } from '../../lib/supabase';
import { requireAuth } from '../../plugins/auth';
import { schemaFor } from '../register';

/** Signed photo URLs are short-lived (ADR 0004); the client re-fetches the list when they expire. */
export const WARDROBE_URL_TTL_SECONDS = 600;

// embedding deliberately not selected: vectors never leave the database (and are large).
const COLUMNS =
  'id, user_id, slot, category, title, colors, formality, occasions, tags, image_path, is_archived, created_at, updated_at';

type Row = { id: string; user_id: string; image_path: string | null; [key: string]: unknown };

const dbFailure = (log: FastifyBaseLogger, err: unknown, what: string) => {
  log.error({ err }, `${what} failed`);
  return new HttpError(500, 'internal', `Could not ${what}`);
};

/** The photo must live in the caller's own folder (also enforced by a DB check constraint). */
function assertOwnPath(userId: string, path: string | undefined) {
  if (path !== undefined && path.split('/')[0] !== userId) {
    throw new HttpError(400, 'bad_request', 'image_path must start with your user id');
  }
}

/** Maps DB rows to the public shape: signed URL instead of path, boolean instead of vector. */
async function toItems(supabase: UserSupabaseClient, rows: Row[], log: FastifyBaseLogger) {
  // Which of these rows the batch embedder has processed, without transferring the vectors.
  const embedded = new Set<string>();
  if (rows.length) {
    const { data, error } = await supabase
      .from('wardrobe_items')
      .select('id')
      .in(
        'id',
        rows.map((r) => r.id),
      )
      .not('embedding', 'is', null);
    if (error) throw dbFailure(log, error, 'load wardrobe');
    for (const r of data ?? []) embedded.add(r.id);
  }

  const paths = rows.map((r) => r.image_path).filter((p): p is string => !!p);
  const urls = new Map<string, string>();
  if (paths.length) {
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKETS.wardrobePhotos)
      .createSignedUrls(paths, WARDROBE_URL_TTL_SECONDS);
    // A missing photo should not hide the item: log and fall back to no image.
    if (error) log.warn({ code: error.name }, 'wardrobe photo signing failed');
    for (const s of data ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  }
  return rows.map(({ image_path, ...rest }) =>
    WardrobeItem.parse({
      ...rest,
      image_url: image_path ? (urls.get(image_path) ?? null) : null,
      is_embedded: embedded.has(rest.id),
    }),
  );
}

export const wardrobeRoutes: FastifyPluginAsyncZod = async (app) => {
  /** GET /wardrobe: the caller's own items (partners' shared items are not listed here). */
  app.get('/wardrobe', { schema: schemaFor('listWardrobe') }, async (request) => {
    const { user, supabase } = requireAuth(request);
    const { data, error } = await supabase
      .from('wardrobe_items')
      .select(COLUMNS)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) throw dbFailure(request.log, error, 'load wardrobe');
    const items = await toItems(supabase, (data ?? []) as Row[], request.log);
    return ListWardrobeResponse.parse({ items });
  });

  app.post('/wardrobe', { schema: schemaFor('addWardrobeItem') }, async (request) => {
    const { user, supabase } = requireAuth(request);
    const body = request.body as CreateWardrobeItemRequest;
    assertOwnPath(user.id, body.image_path);

    const { data, error } = await supabase
      .from('wardrobe_items')
      .insert({ ...body, user_id: user.id })
      .select(COLUMNS)
      .single();
    if (error) {
      if (error.message.includes('wardrobe limit reached')) {
        throw new HttpError(409, 'wardrobe_full', 'Your wardrobe is full (300 items)');
      }
      throw dbFailure(request.log, error, 'add wardrobe item');
    }
    const [item] = await toItems(supabase, [data as Row], request.log);
    return WardrobeItemResponse.parse({ item });
  });

  app.patch('/wardrobe/:id', { schema: schemaFor('updateWardrobeItem') }, async (request) => {
    const { user, supabase } = requireAuth(request);
    const { id } = request.params as { id: string };
    const body = request.body as UpdateWardrobeItemRequest;
    assertOwnPath(user.id, body.image_path);
    if (Object.keys(body).length === 0) {
      throw new HttpError(400, 'bad_request', 'Nothing to update');
    }

    const { data, error } = await supabase
      .from('wardrobe_items')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id)
      .select(COLUMNS)
      .maybeSingle();
    if (error) throw dbFailure(request.log, error, 'update wardrobe item');
    if (!data) throw notFound('Wardrobe item not found');
    const [item] = await toItems(supabase, [data as Row], request.log);
    return WardrobeItemResponse.parse({ item });
  });

  /** DELETE /wardrobe/:id: removes the item and its photo (ADR 0004: photos live until deleted). */
  app.delete('/wardrobe/:id', { schema: schemaFor('deleteWardrobeItem') }, async (request) => {
    const { user, supabase } = requireAuth(request);
    const { id } = request.params as { id: string };

    const { data, error } = await supabase
      .from('wardrobe_items')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)
      .select('image_path')
      .maybeSingle();
    if (error) throw dbFailure(request.log, error, 'delete wardrobe item');
    if (!data) throw notFound('Wardrobe item not found');

    if (data.image_path) {
      const removed = await supabase.storage
        .from(STORAGE_BUCKETS.wardrobePhotos)
        .remove([data.image_path]);
      // The row is gone either way; an orphaned file is logged for cleanup, not surfaced.
      if (removed.error) request.log.warn({ id }, 'wardrobe photo delete failed');
    }
    return OkResponse.parse({ ok: true });
  });
};
