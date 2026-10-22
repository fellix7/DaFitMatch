-- ════════════════════════════════════════════════════════════════════════════
-- Phase 2 — feed rules: honour the user's "never wear" list and "colours to avoid"
-- Human review required (SECURITY DEFINER surface + taste maths).
-- Never edit an applied migration: this is a NEW file.
--
-- `rank_products` is replaced (same signature, same return type) so the feed never shows a
-- product the user explicitly ruled out.
--
-- The keyword list below mirrors NEVER_WEAR_KEYWORDS in
-- packages/shared/src/constants.ts - keep the two in sync.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── never-wear keywords per quiz option ───────────────────────────────────
create function private.never_wear_rule(p_option text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case lower(p_option)
    when 'crop tops' then array['crop top', 'cropped top', 'crop tee']
    when 'shorts' then array['shorts', 'short']
    when 'mini skirts' then array['mini skirt', 'mini dress']
    when 'sleeveless' then array['sleeveless', 'tank top', 'tanktop']
    when 'bodycon' then array['bodycon', 'body con', 'body-hugging', 'body hugging']
    when 'heels' then array['heel', 'heels', 'stiletto', 'pumps']
    when 'sneakers' then array['sneaker', 'sneakers']
    when 'graphic tees' then array['graphic tee', 'graphic t-shirt', 'printed tee', 'graphic tshirt']
    when 'ripped jeans' then array['ripped', 'distressed', 'torn jean']
    when 'sheer fabrics' then array['sheer', 'transparent']
    when 'loud prints' then array['loud print', 'statement print', 'all-over print', 'bold print']
    when 'florals' then array['floral', 'flower print', 'botanical print']
    else '{}'::text[]
  end;
$$;

-- ─── one keyword hit (whole word, case-insensitive) ─────────────────────────
-- "short" must not fire on "short sleeve shirt", hence the negative lookahead.
create function private.never_wear_hit(p_text text, p_keyword text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select lower(p_text) ~ (
    '(^|[^a-z0-9])' ||
    case lower(p_keyword)
      when 'short' then 'short(?![[:space:]]*sleeve)'
      else p_keyword
    end ||
    '($|[^a-z0-9])'
  );
$$;

-- Does the product title + category hit any of the user's "never wear" options?
create function private.never_wear_matches(
  p_title text,
  p_category text,
  p_options text[]
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select exists (
    select 1
    from unnest(coalesce(p_options, '{}'::text[])) as option
    cross join lateral unnest(private.never_wear_rule(option)) as keyword
    where private.never_wear_hit(
      coalesce(p_title, '') || ' ' || coalesce(p_category, ''),
      keyword
    )
  );
$$;

-- ─── the taste-ranked feed, now with the hard rules applied ─────────────────
create or replace function public.rank_products(
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
  -- The user's hard rules. Empty arrays = no filtering.
  avoid_colors text[] := '{}'::text[];
  never_wear text[] := '{}'::text[];
begin
  if uid is not null then
    with t as (
      select tp.taste_vector, tp.archetype_weights, tp.colors_avoid, tp.never_wear
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
    select
      case
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
      end,
      coalesce(t.colors_avoid, '{}'::text[]),
      coalesce(t.never_wear, '{}'::text[])
    into qv, avoid_colors, never_wear
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
        and not (p.colors && avoid_colors)
        and not private.never_wear_matches(p.title, p.category, never_wear)
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
        and not (p.colors && avoid_colors)
        and not private.never_wear_matches(p.title, p.category, never_wear)
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
-- The three helpers are pure text functions: they read no table and take no user data.
-- `rank_products` is SECURITY INVOKER, so it calls them as the caller (authenticated) and
-- needs EXECUTE. The `private` schema is not exposed through the API, so this does not make
-- them callable from the client.
revoke all on function
  private.never_wear_rule(text),
  private.never_wear_hit(text, text),
  private.never_wear_matches(text, text, text[])
from public, anon;
grant execute on function
  private.never_wear_rule(text),
  private.never_wear_hit(text, text),
  private.never_wear_matches(text, text, text[])
to authenticated, service_role;

revoke all on function
  public.rank_products(public.slot, public.product_gender, integer, real, uuid, integer)
from public, anon;
grant execute on function
  public.rank_products(public.slot, public.product_gender, integer, real, uuid, integer)
to authenticated, service_role;
