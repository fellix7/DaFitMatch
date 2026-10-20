-- ════════════════════════════════════════════════════════════════════════════
-- Phase 2 — taste profile maths and the taste-ranked feed
-- Human review required (SECURITY DEFINER functions, RLS interaction, taste maths).
-- Never edit this file after it has been applied anywhere: add a new migration.
--
-- Notes:
--   * pgvector has no scalar×vector operator, so weights are applied by multiplying with a
--     constant-filled vector of the same dimension (`extensions.vector_dims`).
--   * All heavy maths happens offline or in SQL over pre-computed embeddings; no model runs here.
--   * Figures for BUDGET_BANDS mirror packages/shared/src/constants.ts.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Pure helpers ───────────────────────────────────────────────────────────

-- Multiply a vector by a scalar (element-wise, via a constant vector).
create function private.scale_vec(p_vec extensions.vector, p_w double precision)
returns extensions.vector
language sql
immutable
set search_path = ''
as $$
  select case
    when p_vec is null then null
    else p_vec operator(extensions.*)
           array_fill(p_w::real, array[extensions.vector_dims(p_vec)])::extensions.vector
  end;
$$;

-- Representative budget (INR) for a quiz band; mirrors BUDGET_BANDS[].default_inr.
create function private.budget_from_band(p_band text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_band
    when 'under-2000' then 2000
    when '2000-5000' then 5000
    when '5000-10000' then 8000
    when '10000-20000' then 15000
    when 'above-20000' then 30000
    else null
  end;
$$;

-- Map the quiz's 0–100 comfort↔statement slider onto taste_profiles' 1–5 column.
create function private.comfort_from_slider(p_slider integer)
returns smallint
language sql
immutable
set search_path = ''
as $$
  select least(5, greatest(1, 1 + round(p_slider / 25.0)))::smallint;
$$;

-- Archetype weights (slug -> share in [0,1]) from swipes: love counts 2×, like 1×, skip 0×.
create function private.archetype_weights_from_swipes(p_swipes jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with scored as (
    select a.slug,
           sum(case s.action when 'love' then 2.0 when 'like' then 1.0 else 0.0 end) as w
    from jsonb_to_recordset(p_swipes) as s(card_id uuid, action text)
    join public.quiz_cards qc on qc.id = s.card_id
    join public.archetypes a on a.id = qc.archetype_id
    group by a.slug
  ),
  positive as (select slug, w from scored where w > 0),
  total as (select sum(w) as t from positive)
  select coalesce(
    jsonb_object_agg(p.slug, round((p.w / (select t from total))::numeric, 3)),
    '{}'::jsonb
  )
  from positive p
  where (select t from total) > 0;
$$;

-- Taste vector from swipes: weight each card's mean item embedding (love=2, like=1, skip=-0.3),
-- sum, then L2-normalise. Returns NULL when no swiped card has embedded items yet.
create function private.taste_vector_from_swipes(p_swipes jsonb)
returns extensions.halfvec(768)
language sql
stable
set search_path = ''
as $$
  with swipe_items as (
    select
      case s.action
        when 'love' then 2.0::float8
        when 'like' then 1.0::float8
        when 'skip' then -0.3::float8
        else 0.0::float8
      end as w,
      qc.item_ids
    from jsonb_to_recordset(p_swipes) as s(card_id uuid, action text)
    join public.quiz_cards qc on qc.id = s.card_id
  ),
  card_vecs as (
    select si.w,
           (select extensions.avg(p.embedding::extensions.vector)
              from public.products p
             where p.id = any (si.item_ids) and p.embedding is not null) as v
    from swipe_items si
  ),
  scaled as (
    select private.scale_vec(v, w) as sv from card_vecs where v is not null and w <> 0
  )
  select case
    when extensions.sum(sv) is null then null
    else extensions.l2_normalize(extensions.sum(sv))::extensions.halfvec
  end
  from scaled;
$$;

-- ─── Embedding lookup for an interaction target ─────────────────────────────
create function private.embedding_for(
  p_target_type public.interaction_target,
  p_target_id uuid
)
returns extensions.halfvec(768)
language sql
stable
set search_path = ''
as $$
  select case p_target_type
    when 'product' then (select p.embedding from public.products p where p.id = p_target_id)
    when 'archetype' then (select a.centroid from public.archetypes a where a.id = p_target_id)
    when 'venue' then (select v.vibe_embedding from public.venues v where v.id = p_target_id)
    when 'wardrobe_item' then (
      select w.embedding from public.wardrobe_items w
      where w.id = p_target_id and w.user_id = (select auth.uid())
    )
    when 'outfit' then (
      select extensions.l2_normalize(extensions.avg(p.embedding::extensions.vector))::extensions.halfvec
      from public.outfits o
      join public.products p on p.id = any (o.item_ids)
      where o.id = p_target_id and p.embedding is not null
    )
    else null
  end;
$$;

-- Full rebuild: weighted aggregate of every logged interaction's embedding.
create function private.rebuild_taste_vector(p_user uuid)
returns extensions.halfvec(768)
language sql
stable
set search_path = ''
as $$
  with events as (
    select
      case i.action
        when 'love' then 2.0::float8
        when 'like' then 1.0::float8
        when 'save' then 1.5::float8
        when 'tryon' then 1.5::float8
        when 'click' then 0.5::float8
        when 'skip' then -0.3::float8
        when 'swap' then -1.0::float8
        else 0.0::float8
      end as w,
      private.embedding_for(i.target_type, i.target_id)::extensions.vector as v
    from public.interactions i
    where i.user_id = p_user
  ),
  scaled as (
    select private.scale_vec(v, w) as sv from events where v is not null and w <> 0
  )
  select case
    when extensions.sum(sv) is null then null
    else extensions.l2_normalize(extensions.sum(sv))::extensions.halfvec
  end
  from scaled;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- Public RPCs (called through the API's user-scoped client)
-- ════════════════════════════════════════════════════════════════════════════

-- Save a completed onboarding quiz: explicit fields, archetype weights and an initial taste
-- vector built from the swipes. Returns the saved taste_profiles row.
create function public.submit_quiz(p_submission jsonb)
returns public.taste_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  basics jsonb := coalesce(p_submission -> 'basics', '{}'::jsonb);
  swipes jsonb := coalesce(p_submission -> 'swipes', '[]'::jsonb);
  rules jsonb := coalesce(p_submission -> 'hard_rules', '{}'::jsonb);
  vec extensions.halfvec(768);
  weights jsonb;
  budget integer;
  prof public.taste_profiles;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Every swiped card must exist; blocks fabricated ids from skewing the taste vector.
  if exists (
    select 1 from jsonb_to_recordset(swipes) as s(card_id uuid)
    where not exists (select 1 from public.quiz_cards qc where qc.id = s.card_id)
  ) then
    raise exception 'unknown quiz card' using errcode = '22023';
  end if;

  vec := private.taste_vector_from_swipes(swipes);
  weights := private.archetype_weights_from_swipes(swipes);
  budget := private.budget_from_band(basics ->> 'budget_band');

  update public.profiles
     set city = coalesce(basics ->> 'city', city),
         height_cm = coalesce((basics ->> 'height_cm')::smallint, height_cm),
         default_budget_inr = coalesce(budget, default_budget_inr)
   where id = uid;

  insert into public.taste_profiles as tp (
    user_id, archetype_weights, colors_like, colors_avoid, never_wear,
    comfort_vs_statement, fit_prefs, taste_vector, interaction_count, version
  ) values (
    uid,
    weights,
    array(select jsonb_array_elements_text(rules -> 'colors_like')),
    array(select jsonb_array_elements_text(rules -> 'colors_avoid')),
    array(select jsonb_array_elements_text(rules -> 'never_wear')),
    private.comfort_from_slider((rules ->> 'comfort_vs_statement')::int),
    case
      when basics ? 'fit_pref' then jsonb_build_object('preference', basics ->> 'fit_pref')
      else '{}'::jsonb
    end,
    vec,
    jsonb_array_length(swipes),
    1
  )
  on conflict (user_id) do update
    set archetype_weights = excluded.archetype_weights,
        colors_like = excluded.colors_like,
        colors_avoid = excluded.colors_avoid,
        never_wear = excluded.never_wear,
        comfort_vs_statement = excluded.comfort_vs_statement,
        fit_prefs = excluded.fit_prefs,
        taste_vector = coalesce(excluded.taste_vector, tp.taste_vector),
        interaction_count = tp.interaction_count + excluded.interaction_count,
        version = tp.version + 1
  returning * into prof;

  return prof;
end;
$$;

-- Append an interaction and move the taste vector: an exponential moving average with a full
-- rebuild every TASTE_REBUILD_EVERY (10) interactions. Returns the created interaction + counters.
create function public.record_interaction(
  p_target_type public.interaction_target,
  p_target_id uuid,
  p_action public.interaction_action
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  alpha constant double precision := 0.1; -- TASTE_EMA_ALPHA
  rebuild_every constant integer := 10; -- TASTE_REBUILD_EVERY
  ins public.interactions;
  prof public.taste_profiles;
  vec extensions.halfvec(768);
  w double precision;
  new_vec extensions.halfvec(768);
  new_count integer;
  new_version integer;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  insert into public.interactions (user_id, target_type, target_id, action)
  values (uid, p_target_type, p_target_id, p_action)
  returning * into ins;

  insert into public.taste_profiles (user_id) values (uid)
  on conflict (user_id) do nothing;
  select * into prof from public.taste_profiles where user_id = uid for update;

  w := case p_action
         when 'like' then 1.0 when 'love' then 2.0 when 'save' then 1.5
         when 'tryon' then 1.5 when 'click' then 0.5 when 'skip' then -0.3
         when 'swap' then -1.0 else 0.0
       end;

  vec := private.embedding_for(p_target_type, p_target_id);
  new_count := prof.interaction_count + 1;
  new_version := prof.version;

  if vec is not null and w <> 0 then
    if prof.taste_vector is null then
      new_vec := vec;
    else
      new_vec := extensions.l2_normalize(
        private.scale_vec(prof.taste_vector::extensions.vector, 1 - alpha)
        operator(extensions.+)
        private.scale_vec(vec::extensions.vector, alpha * w)
      )::extensions.halfvec;
    end if;
  else
    new_vec := prof.taste_vector;
  end if;

  if new_count % rebuild_every = 0 then
    new_vec := private.rebuild_taste_vector(uid);
    new_version := prof.version + 1;
  end if;

  update public.taste_profiles
     set taste_vector = new_vec,
         interaction_count = new_count,
         version = new_version
   where user_id = uid
  returning * into prof;

  return jsonb_build_object(
    'interaction', to_jsonb(ins),
    'taste', jsonb_build_object(
      'interaction_count', prof.interaction_count,
      'version', prof.version
    )
  );
end;
$$;

-- Taste-ranked feed. Query vector = 0.7·taste_vector + 0.3·top archetype centroid (either alone
-- when the other is missing). SECURITY INVOKER: products are public-read and taste_profiles is own.
-- The cursor is keyset pagination on the returned `real` similarity (`<score>|<uuid>`): comparing
-- the same value we hand back guarantees no duplicates and no skipped rows.
create function public.rank_products(
  p_slot public.slot default null,
  p_gender public.product_gender default null,
  p_max_price integer default null,
  p_cursor_similarity real default null,
  p_cursor_id uuid default null,
  k integer default 20
)
returns table (
  id uuid,
  source public.product_source,
  external_id text,
  brand text,
  title text,
  category text,
  slot public.slot,
  gender public.product_gender,
  colors text[],
  formality smallint,
  occasions text[],
  price_inr integer,
  image_url text,
  affiliate_url text,
  in_stock boolean,
  last_seen_at timestamptz,
  similarity real
)
language plpgsql
stable
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  qv extensions.halfvec(768);
  lim integer := least(greatest(k, 1), 48);
begin
  if uid is not null then
    with t as (
      select tp.taste_vector, tp.archetype_weights
      from public.taste_profiles tp
      where tp.user_id = uid
    ),
    top_arch as (
      select a.centroid
      from t
      join lateral (
        select (kv.key) as slug
        from jsonb_each_text(t.archetype_weights) kv
        order by kv.value::numeric desc
        limit 1
      ) top on true
      join public.archetypes a on a.slug = top.slug
    )
    select case
      when t.taste_vector is not null and (select centroid from top_arch) is not null then
        extensions.l2_normalize(
          (t.taste_vector::extensions.vector operator(extensions.*)
             array_fill(0.7::real, array[extensions.vector_dims(t.taste_vector::extensions.vector)])::extensions.vector)
          operator(extensions.+)
          ((select centroid from top_arch)::extensions.vector operator(extensions.*)
             array_fill(0.3::real, array[extensions.vector_dims((select centroid from top_arch)::extensions.vector)])::extensions.vector)
        )::extensions.halfvec
      when t.taste_vector is not null then t.taste_vector
      when (select centroid from top_arch) is not null then (select centroid from top_arch)
      else null
    end
    into qv
    from t;
  end if;

  if qv is null then
    -- No taste yet: a stable browse of in-stock, embedded items. Ordered by id so the keyset
    -- cursor (`0|<id>`) pages exactly, even though the scores are all 0.
    return query
      select p.id, p.source, p.external_id, p.brand, p.title, p.category, p.slot, p.gender,
             p.colors, p.formality, p.occasions, p.price_inr, p.image_url, p.affiliate_url,
             p.in_stock, p.last_seen_at, 0::real as similarity
      from public.products p
      where p.in_stock
        and p.embedding is not null
        and (p_slot is null or p.slot = p_slot)
        and (p_gender is null or p.gender in (p_gender, 'unisex'))
        and (p_max_price is null or p.price_inr <= p_max_price)
        and (p_cursor_id is null or p.id < p_cursor_id)
      order by p.id desc
      limit lim;
    return;
  end if;

  return query
    select m.id, m.source, m.external_id, m.brand, m.title, m.category, m.slot, m.gender,
           m.colors, m.formality, m.occasions, m.price_inr, m.image_url, m.affiliate_url,
           m.in_stock, m.last_seen_at, m.similarity
    from (
      select p.id, p.source, p.external_id, p.brand, p.title, p.category, p.slot, p.gender,
             p.colors, p.formality, p.occasions, p.price_inr, p.image_url, p.affiliate_url,
             p.in_stock, p.last_seen_at,
             (1 - (p.embedding operator(extensions.<=>) qv))::real as similarity
      from public.products p
      where p.in_stock
        and p.embedding is not null
        and (p_slot is null or p.slot = p_slot)
        and (p_gender is null or p.gender in (p_gender, 'unisex'))
        and (p_max_price is null or p.price_inr <= p_max_price)
        and (
          p_cursor_similarity is null
          or (1 - (p.embedding operator(extensions.<=>) qv))::real < p_cursor_similarity
          or (
            (1 - (p.embedding operator(extensions.<=>) qv))::real = p_cursor_similarity
            and (p_cursor_id is null or p.id > p_cursor_id)
          )
        )
      order by similarity desc, p.id asc
      limit lim
    ) m
    order by m.similarity desc, m.id asc;
end;
$$;

-- ─── Privileges ─────────────────────────────────────────────────────────────

-- private helpers: never callable by anon/authenticated (only by the DEFINER RPCs / service role).
revoke all on function
  private.scale_vec(extensions.vector, double precision),
  private.budget_from_band(text),
  private.comfort_from_slider(integer),
  private.archetype_weights_from_swipes(jsonb),
  private.taste_vector_from_swipes(jsonb),
  private.embedding_for(public.interaction_target, uuid),
  private.rebuild_taste_vector(uuid)
from public, anon, authenticated;
grant execute on function
  private.scale_vec(extensions.vector, double precision),
  private.budget_from_band(text),
  private.comfort_from_slider(integer),
  private.archetype_weights_from_swipes(jsonb),
  private.taste_vector_from_swipes(jsonb),
  private.embedding_for(public.interaction_target, uuid),
  private.rebuild_taste_vector(uuid)
to service_role;

revoke all on function
  public.submit_quiz(jsonb),
  public.record_interaction(public.interaction_target, uuid, public.interaction_action),
  public.rank_products(public.slot, public.product_gender, integer, real, uuid, integer)
from public, anon;
grant execute on function
  public.submit_quiz(jsonb),
  public.record_interaction(public.interaction_target, uuid, public.interaction_action),
  public.rank_products(public.slot, public.product_gender, integer, real, uuid, integer)
to authenticated, service_role;
