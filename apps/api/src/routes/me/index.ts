import { MeResponse } from '@dafitmatch/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { HttpError, notFound } from '../../lib/errors';
import { requireAuth } from '../../plugins/auth';
import { schemaFor } from '../register';

const PROFILE_COLUMNS =
  'id, display_name, gender_presentation, height_cm, city, default_budget_inr, is_adult, created_at, updated_at';
// taste_vector deliberately not selected: vectors never leave the database.
const TASTE_COLUMNS =
  'user_id, archetype_weights, colors_like, colors_avoid, never_wear, comfort_vs_statement, fit_prefs, interaction_count, version, updated_at';

/** GET /me: the caller's profile via the user-scoped client, proving auth + RLS end to end. */
export const meRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/me', { schema: schemaFor('me') }, async (request) => {
    const { user, supabase } = requireAuth(request);

    const [profile, taste] = await Promise.all([
      supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', user.id).maybeSingle(),
      supabase.from('taste_profiles').select(TASTE_COLUMNS).eq('user_id', user.id).maybeSingle(),
    ]);
    const dbError = profile.error ?? taste.error;
    if (dbError) {
      request.log.error({ err: dbError }, 'GET /me query failed');
      throw new HttpError(500, 'internal', 'Could not load profile');
    }
    if (!profile.data) throw notFound('Profile not found');

    return MeResponse.parse({ profile: profile.data, taste_profile: taste.data });
  });
};
