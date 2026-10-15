import {
  archetypeWeightsFromPicks,
  ConfirmAgeResponse,
  MeResponse,
  type StyleQuizAnswers,
} from '@dafitmatch/shared';
import type { FastifyBaseLogger } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { HttpError, notFound } from '../../lib/errors';
import type { UserSupabaseClient } from '../../lib/supabase';
import { requireAuth } from '../../plugins/auth';
import { schemaFor } from '../register';

const PROFILE_COLUMNS =
  'id, display_name, gender_presentation, height_cm, city, default_budget_inr, is_adult, age_confirmed_at, created_at, updated_at';
// taste_vector deliberately not selected: vectors never leave the database.
const TASTE_COLUMNS =
  'user_id, archetype_weights, colors_like, colors_avoid, never_wear, comfort_vs_statement, fit_prefs, interaction_count, version, updated_at';

const dbFailure = (log: FastifyBaseLogger, err: unknown, what: string) => {
  log.error({ err }, `${what} failed`);
  return new HttpError(500, 'internal', `Could not ${what}`);
};

async function loadMe(supabase: UserSupabaseClient, userId: string, log: FastifyBaseLogger) {
  const [profile, taste] = await Promise.all([
    supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', userId).maybeSingle(),
    supabase.from('taste_profiles').select(TASTE_COLUMNS).eq('user_id', userId).maybeSingle(),
  ]);
  const err = profile.error ?? taste.error;
  if (err) throw dbFailure(log, err, 'load profile');
  if (!profile.data) throw notFound('Profile not found');
  return MeResponse.parse({ profile: profile.data, taste_profile: taste.data });
}

export const meRoutes: FastifyPluginAsyncZod = async (app) => {
  /** GET /me: the caller's profile via the user-scoped client, proving auth + RLS end to end. */
  app.get('/me', { schema: schemaFor('me') }, async (request) => {
    const { user, supabase } = requireAuth(request);
    return loadMe(supabase, user.id, request.log);
  });

  /**
   * PUT /me/taste: saves the answers a guest gave in the style builder, right after sign-in.
   * Explicit answers replace the previous explicit fields; the learned taste vector and
   * interaction count are left untouched.
   */
  app.put('/me/taste', { schema: schemaFor('saveTaste') }, async (request) => {
    const { user, supabase } = requireAuth(request);
    const answers = request.body as StyleQuizAnswers;

    const known = await supabase.from('archetypes').select('slug').in('slug', answers.archetypes);
    if (known.error) throw dbFailure(request.log, known.error, 'check styles');
    const knownSlugs = new Set((known.data ?? []).map((a) => a.slug));
    const unknown = answers.archetypes.filter((s) => !knownSlugs.has(s));
    if (unknown.length) {
      throw new HttpError(400, 'bad_request', 'Unknown style archetype', { unknown });
    }

    const profileUpdate = await supabase
      .from('profiles')
      .update({
        gender_presentation: answers.gender_presentation,
        default_budget_inr: answers.budget_inr,
        ...(answers.height_cm !== undefined && { height_cm: answers.height_cm }),
      })
      .eq('id', user.id);
    if (profileUpdate.error) throw dbFailure(request.log, profileUpdate.error, 'save profile');

    const current = await supabase
      .from('taste_profiles')
      .select('version')
      .eq('user_id', user.id)
      .maybeSingle();
    if (current.error) throw dbFailure(request.log, current.error, 'read taste profile');

    const tasteUpsert = await supabase.from('taste_profiles').upsert(
      {
        user_id: user.id,
        archetype_weights: archetypeWeightsFromPicks(answers.archetypes),
        colors_like: answers.colors_like,
        colors_avoid: answers.colors_avoid,
        never_wear: answers.never_wear,
        comfort_vs_statement: answers.comfort_vs_statement,
        fit_prefs: answers.fit_prefs,
        version: (current.data?.version ?? 0) + 1,
      },
      { onConflict: 'user_id' },
    );
    if (tasteUpsert.error) throw dbFailure(request.log, tasteUpsert.error, 'save taste profile');

    return loadMe(supabase, user.id, request.log);
  });

  // Age gate. The birth date goes straight to the confirm_age RPC (which stores only the
  // boolean) and is never logged: Fastify does not log request bodies.
  app.post('/me/age', { schema: schemaFor('confirmAge') }, async (request) => {
    const { supabase } = requireAuth(request);
    const { birth_date } = request.body as { birth_date: string };
    const { data, error } = await supabase.rpc('confirm_age', { birth_date });
    if (error) {
      if (error.message.includes('age already confirmed')) {
        throw new HttpError(409, 'age_already_confirmed', 'Age has already been confirmed');
      }
      if (error.code === '22023') throw new HttpError(400, 'bad_request', 'Invalid birth date');
      request.log.error({ code: error.code }, 'confirm_age failed');
      throw new HttpError(500, 'internal', 'Could not confirm age');
    }
    return ConfirmAgeResponse.parse({ is_adult: data });
  });
};
