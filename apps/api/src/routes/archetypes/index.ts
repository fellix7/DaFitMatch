import { ListArchetypesResponse } from '@dafitmatch/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { HttpError } from '../../lib/errors';
import type { UserSupabaseClient } from '../../lib/supabase';
import { schemaFor } from '../register';

/** Public: style archetypes for the guest "Try now" builder (centroids never selected). */
export const archetypeRoutes: FastifyPluginAsyncZod<{
  anonClient: () => UserSupabaseClient;
}> = async (app, { anonClient }) => {
  app.get('/archetypes', { schema: schemaFor('listArchetypes') }, async (request, reply) => {
    const { data, error } = await anonClient()
      .from('archetypes')
      .select('id, slug, name, benchmark_brands, description')
      .order('name');
    if (error) {
      request.log.error({ err: error }, 'GET /archetypes failed');
      throw new HttpError(500, 'internal', 'Could not load styles');
    }
    reply.header('cache-control', 'public, max-age=300');
    return ListArchetypesResponse.parse({ archetypes: data });
  });
};
