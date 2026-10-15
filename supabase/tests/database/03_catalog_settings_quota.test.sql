-- Catalog is public-read / service-role-write; app_settings is service-role only;
-- try-on quota RPC enforces kill switch, age gate, daily cap and spend limits.
begin;
create extension if not exists pgtap with schema extensions;

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
create function pg_temp.as_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  set local role service_role;
end $$;
create function pg_temp.as_admin() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', true);
end $$;

insert into auth.users (id, email) values
  ('a1111111-0000-4000-8000-000000000001', 'quota-adult@example.com'),
  ('a1111111-0000-4000-8000-000000000002', 'quota-minor@example.com');
insert into public.products (id, source, external_id, brand, title, category, slot, gender, formality, price_inr, image_url, affiliate_url, embedding)
values
  ('b1111111-0000-4000-8000-000000000001', 'other', 'Q-1', 'T', 'Near', 'tee', 'top', 'unisex', 2, 999, 'https://x.test/1.jpg', 'https://x.test/1',
   array_fill(0.1::real, array[768])::extensions.halfvec),
  ('b1111111-0000-4000-8000-000000000002', 'other', 'Q-2', 'T', 'Pricey', 'tee', 'top', 'men', 2, 9999, 'https://x.test/2.jpg', 'https://x.test/2',
   array_fill(0.1::real, array[768])::extensions.halfvec),
  ('b1111111-0000-4000-8000-000000000003', 'other', 'Q-3', 'T', 'Gone', 'tee', 'top', 'unisex', 2, 999, 'https://x.test/3.jpg', 'https://x.test/3',
   array_fill(0.1::real, array[768])::extensions.halfvec),
  ('b1111111-0000-4000-8000-000000000004', 'other', 'Q-4', 'T', 'Womens', 'top', 'top', 'women', 2, 999, 'https://x.test/4.jpg', 'https://x.test/4',
   array_fill(0.1::real, array[768])::extensions.halfvec);
update public.products set in_stock = false where id = 'b1111111-0000-4000-8000-000000000003';

select plan(18);

-- ── Catalog ─────────────────────────────────────────────────────────────────
select pg_temp.as_anon();
select isnt_empty('select 1 from public.products', 'anon can read products');
select throws_ok($$insert into public.archetypes (slug, name) values ('x', 'x')$$, '42501', null, 'anon cannot write archetypes');
select throws_ok('select 1 from public.app_settings', '42501', null, 'anon cannot read app_settings');

select pg_temp.as_user('a1111111-0000-4000-8000-000000000001');
select throws_ok($$update public.products set price_inr = 1$$, '42501', null, 'user cannot update products');
select throws_ok($$insert into public.venues (city, name, place_id, lat, lng, category) values ('x', 'x', 'x', 0, 0, 'x')$$, '42501', null, 'user cannot write venues');
select throws_ok('select 1 from public.app_settings', '42501', null, 'user cannot read app_settings');
select results_eq(
  $$select title from public.match_products(array_fill(0.1::real, array[768])::extensions.halfvec, 'top', 'men', 5000, 10)$$,
  $$values ('Near'::text)$$,
  'match_products filters slot, gender (+unisex), max price and stock');

select pg_temp.as_service();
select lives_ok($$update public.products set price_inr = 1099 where external_id = 'Q-1'$$, 'service role can write products');
select lives_ok($$update public.app_settings set value = 'true' where key = 'tryon_enabled'$$, 'service role can flip the kill switch');

-- ── Try-on quota ────────────────────────────────────────────────────────────
select pg_temp.as_user('a1111111-0000-4000-8000-000000000002');
select is(public.confirm_age(current_date - 365 * 15), false, 'under-18 birth date yields is_adult = false');
select throws_ok('select public.consume_tryon_quota()', '42501', null, 'minor cannot use try-on');

select pg_temp.as_user('a1111111-0000-4000-8000-000000000001');
select is(public.confirm_age('1995-06-01'), true, 'adult passes the age gate');
select throws_ok($$select public.confirm_age('2015-01-01')$$, 'P0001', null, 'age gate is one-shot');
select is(public.consume_tryon_quota(), 2, '1st try-on: 2 left');
select is(public.consume_tryon_quota(), 1, '2nd try-on: 1 left');
select is(public.consume_tryon_quota(), 0, '3rd try-on: 0 left');
select throws_ok('select public.consume_tryon_quota()', 'P0001', 'daily try-on limit reached', 'DAILY_TRYON_CAP enforced');

select pg_temp.as_service();
update public.app_settings set value = 'false' where key = 'tryon_enabled';
select pg_temp.as_user('a1111111-0000-4000-8000-000000000001');
select throws_ok('select public.consume_tryon_quota()', 'P0001', 'try-on is disabled', 'kill switch blocks try-on');

select pg_temp.as_admin();
select * from finish();
rollback;
