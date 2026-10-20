-- Schema invariants: RLS everywhere, vector indexes, private buckets, kill switch default.
begin;
create extension if not exists pgtap with schema extensions;

select plan(23);

select has_extension('vector', 'pgvector is installed');

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0,
  'every public table has RLS enabled'
);

select tables_are('public', array[
  'profiles', 'taste_profiles', 'archetypes', 'reference_looks', 'products', 'wardrobe_items',
  'outfits', 'date_rooms', 'room_pairs', 'interactions', 'tryons', 'venues', 'usage_limits',
  'app_settings', 'quiz_cards'
], 'public tables are exactly the expected set');

-- Phase 2 columns & table
select has_column('public', 'products', 'tags_version', 'products.tags_version exists');
select has_column('public', 'products', 'embedded_at', 'products.embedded_at exists');
select has_column('public', 'quiz_cards', 'item_ids', 'quiz_cards.item_ids exists');

-- halfvec(768) embedding columns
select col_type_is('public', 'products', 'embedding', 'extensions', 'halfvec(768)', 'products.embedding is halfvec(768)');
select col_type_is('public', 'reference_looks', 'embedding', 'extensions', 'halfvec(768)', 'reference_looks.embedding is halfvec(768)');
select col_type_is('public', 'archetypes', 'centroid', 'extensions', 'halfvec(768)', 'archetypes.centroid is halfvec(768)');
select col_type_is('public', 'venues', 'vibe_embedding', 'extensions', 'halfvec(768)', 'venues.vibe_embedding is halfvec(768)');
select col_type_is('public', 'taste_profiles', 'taste_vector', 'extensions', 'halfvec(768)', 'taste_profiles.taste_vector is halfvec(768)');
select col_type_is('public', 'wardrobe_items', 'embedding', 'extensions', 'halfvec(768)', 'wardrobe_items.embedding is halfvec(768)');

-- HNSW cosine indexes
select ok(
  exists (select 1 from pg_indexes where indexname = 'products_embedding_hnsw'
           and indexdef ilike '%using hnsw%halfvec_cosine_ops%'),
  'HNSW cosine index on products.embedding');
select ok(
  exists (select 1 from pg_indexes where indexname = 'reference_looks_embedding_hnsw'
           and indexdef ilike '%using hnsw%halfvec_cosine_ops%'),
  'HNSW cosine index on reference_looks.embedding');
select ok(
  exists (select 1 from pg_indexes where indexname = 'archetypes_centroid_hnsw'
           and indexdef ilike '%using hnsw%halfvec_cosine_ops%'),
  'HNSW cosine index on archetypes.centroid');
select ok(
  exists (select 1 from pg_indexes where indexname = 'venues_vibe_embedding_hnsw'
           and indexdef ilike '%using hnsw%halfvec_cosine_ops%'),
  'HNSW cosine index on venues.vibe_embedding');

-- Storage buckets exist and are private
select is(
  (select array_agg(id order by id) from storage.buckets where id in ('user-photos', 'tryon-results', 'wardrobe-photos')),
  array['tryon-results', 'user-photos', 'wardrobe-photos'],
  'all three buckets exist');
select is(
  (select count(*)::int from storage.buckets where id in ('user-photos', 'tryon-results', 'wardrobe-photos') and public),
  0,
  'no user bucket is public');

-- Cost controls default safe
select is((select value from public.app_settings where key = 'tryon_enabled'), 'false'::jsonb, 'try-on ships disabled');
select is((select value from public.app_settings where key = 'tryon_daily_cap'), '3'::jsonb, 'daily cap defaults to 3 (DAILY_TRYON_CAP)');

-- Signup trigger
select has_trigger('auth', 'users', 'on_auth_user_created', 'profile-on-signup trigger exists');

select function_returns('public', 'match_products',
  array['extensions.halfvec', 'slot', 'product_gender', 'integer', 'integer'], 'setof record',
  'match_products(query_vec, slot, gender, max_price, k) exists');

select ok(
  not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prosecdef
      and not coalesce(array_to_string(p.proconfig, ',') like '%search_path=""%', false)
  ),
  'every SECURITY DEFINER function pins search_path to empty');

select * from finish();
rollback;
