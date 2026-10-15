-- User A can never read or write user B's private rows. Anonymous callers see no user data.
begin;
create extension if not exists pgtap with schema extensions;

-- Helpers (session-local). Switch the effective role + JWT claims like PostgREST does.
create function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
end $$;
create function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
end $$;
create function pg_temp.as_admin() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', true);
end $$;

-- Fixtures (as postgres)
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-4111-8111-111111111111', 'rls-a@example.com', '{"display_name":"A"}'),
  ('22222222-2222-4222-8222-222222222222', 'rls-b@example.com', '{"display_name":"B"}');
update public.profiles set is_adult = true, age_confirmed_at = now()
 where id in ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222');
insert into public.products (id, source, external_id, brand, title, category, slot, gender, formality, price_inr, image_url, affiliate_url)
values ('33333333-3333-4333-8333-333333333333', 'other', 'RLS-1', 'T', 'T', 'tee', 'top', 'unisex', 2, 999, 'https://x.test/1.jpg', 'https://x.test/1');
insert into public.taste_profiles (user_id) values ('22222222-2222-4222-8222-222222222222');
insert into public.wardrobe_items (id, user_id, slot, category) values
  ('44444444-4444-4444-8444-444444444444', '22222222-2222-4222-8222-222222222222', 'top', 'shirt');
insert into public.outfits (id, owner_id, item_ids) values
  ('55555555-5555-4555-8555-555555555555', '22222222-2222-4222-8222-222222222222', array['33333333-3333-4333-8333-333333333333']::uuid[]);
insert into public.interactions (user_id, target_type, target_id, action) values
  ('22222222-2222-4222-8222-222222222222', 'product', '33333333-3333-4333-8333-333333333333', 'like');
insert into public.tryons (user_id, product_id, input_photo_path, input_hash, provider) values
  ('22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', '22222222-2222-4222-8222-222222222222/me.jpg', 'h', 'fal');
insert into public.usage_limits (user_id, day, tryon_count) values ('22222222-2222-4222-8222-222222222222', current_date, 1);

select plan(24);

-- ── A reads: sees only own rows ──────────────────────────────────────────────
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');

select results_eq('select id from public.profiles', $$values ('11111111-1111-4111-8111-111111111111'::uuid)$$,
  'A sees only their own profile');
select is_empty($$select 1 from public.profiles where id = '22222222-2222-4222-8222-222222222222'$$, 'A cannot read B profile');
select is_empty('select 1 from public.taste_profiles', 'A cannot read B taste profile');
select is_empty('select 1 from public.wardrobe_items', 'A cannot read B wardrobe');
select is_empty('select 1 from public.outfits', 'A cannot read B outfits');
select is_empty('select 1 from public.interactions', 'A cannot read B interactions');
select is_empty('select 1 from public.tryons', 'A cannot read B try-ons');
select is_empty('select 1 from public.usage_limits', 'A cannot read B usage');

-- ── A writes: cannot write as B or touch B's rows ────────────────────────────
select throws_ok(
  $$insert into public.outfits (owner_id, item_ids) values ('22222222-2222-4222-8222-222222222222', array['33333333-3333-4333-8333-333333333333']::uuid[])$$,
  '42501', null, 'A cannot create an outfit owned by B');
select throws_ok(
  $$insert into public.interactions (user_id, target_type, target_id, action) values ('22222222-2222-4222-8222-222222222222', 'product', '33333333-3333-4333-8333-333333333333', 'love')$$,
  '42501', null, 'A cannot log interactions as B');
select throws_ok(
  $$insert into public.wardrobe_items (user_id, slot, category) values ('22222222-2222-4222-8222-222222222222', 'top', 'x')$$,
  '42501', null, 'A cannot add to B wardrobe');
select throws_ok(
  $$insert into public.taste_profiles (user_id) values ('22222222-2222-4222-8222-222222222222')$$,
  '42501', null, 'A cannot create B taste profile');
select is_empty(
  $$update public.profiles set display_name = 'hacked' where id = '22222222-2222-4222-8222-222222222222' returning 1$$,
  'A update of B profile affects no rows');
select is_empty(
  $$delete from public.outfits where id = '55555555-5555-4555-8555-555555555555' returning 1$$,
  'A delete of B outfit affects no rows');
select throws_ok(
  $$update public.profiles set is_adult = true where id = '11111111-1111-4111-8111-111111111111'$$,
  '42501', null, 'is_adult is not client-writable (age gate RPC only)');
select throws_ok(
  $$insert into public.usage_limits (user_id, day) values ('11111111-1111-4111-8111-111111111111', current_date + 1)$$,
  '42501', null, 'usage_limits is not client-writable');
select throws_ok(
  $$insert into public.tryons (user_id, product_id, input_photo_path, input_hash, provider) values ('11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333', 'x', 'y', 'fal')$$,
  '42501', null, 'tryons are written only by the worker (service role)');
select throws_ok(
  $$update public.interactions set action = 'skip'$$,
  '42501', null, 'interactions are append-only');

-- ── A's own writes work ──────────────────────────────────────────────────────
select lives_ok(
  $$insert into public.outfits (owner_id, item_ids) values ('11111111-1111-4111-8111-111111111111', array['33333333-3333-4333-8333-333333333333']::uuid[])$$,
  'A can create own outfit');
select throws_ok(
  $$insert into public.outfits (owner_id, wardrobe_item_ids) values ('11111111-1111-4111-8111-111111111111', array['44444444-4444-4444-8444-444444444444']::uuid[])$$,
  '42501', null, 'A cannot reference B wardrobe item in own outfit');

-- ── B still has their data (sanity) ──────────────────────────────────────────
select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
select results_eq(
  $$select display_name from public.profiles$$, $$values ('B'::text)$$,
  'B profile unchanged and visible to B');
select isnt_empty('select 1 from public.outfits', 'B still sees own outfit');

-- ── Anonymous ────────────────────────────────────────────────────────────────
select pg_temp.as_anon();
select throws_ok('select 1 from public.profiles', '42501', null, 'anon cannot read profiles');
select throws_ok('select 1 from public.outfits', '42501', null, 'anon cannot read outfits');

select pg_temp.as_admin();
select * from finish();
rollback;
