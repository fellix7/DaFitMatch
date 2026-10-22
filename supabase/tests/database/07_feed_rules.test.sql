-- Feed rules: the user's "never wear" list and "colours to avoid" filter the taste-ranked feed.
begin;
create extension if not exists pgtap with schema extensions;

create function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
end $$;
create function pg_temp.as_admin() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', true);
end $$;

create temp table tv (name text primary key, v extensions.halfvec(768));
insert into tv values
  ('e1', ('[' || '1' || repeat(',0', 767) || ']')::extensions.halfvec),
  ('e2', ('[0,1' || repeat(',0', 766) || ']')::extensions.halfvec);

insert into auth.users (id, email) values
  ('f0000000-0000-4000-8000-000000000001', 'rules-a@example.com');

insert into public.products (id, source, external_id, brand, title, category, slot, gender, colors, formality, price_inr, image_url, affiliate_url, embedding) values
  ('e1000000-0000-4000-8000-000000000001', 'other', 'HEEL',  'T', 'Black Stiletto Heels',   'heels',  'footwear', 'men',   array['black'], 4, 4999, 'https://x.test/1.jpg', 'https://x.test/1', (select v from tv where name = 'e1')),
  ('e1000000-0000-4000-8000-000000000002', 'other', 'RED',   'T', 'Red Party Dress',        'dress',  'full',     'women', array['red'],   5, 6999, 'https://x.test/2.jpg', 'https://x.test/2', (select v from tv where name = 'e1')),
  ('e1000000-0000-4000-8000-000000000003', 'other', 'PLAIN', 'T', 'Plain Navy Shirt',       'shirts', 'top',      'men',   array['navy'],  2, 1299, 'https://x.test/3.jpg', 'https://x.test/3', (select v from tv where name = 'e2')),
  ('e1000000-0000-4000-8000-000000000004', 'other', 'SLEEVE','T', 'Short Sleeve Shirt',     'shirts', 'top',      'men',   array['white'], 2, 999,  'https://x.test/4.jpg', 'https://x.test/4', (select v from tv where name = 'e2'));

insert into public.taste_profiles (user_id, taste_vector, colors_avoid, never_wear) values
  ('f0000000-0000-4000-8000-000000000001', (select v from tv where name = 'e1'), array['red'], array['heels']);

select plan(12);

-- ── the keyword rules ────────────────────────────────────────────────────────
select is(
  private.never_wear_rule('shorts'),
  array['shorts', 'short'],
  'the shorts option maps to its keywords');
select is(
  private.never_wear_rule('unknown option'),
  '{}'::text[],
  'an unknown option has no keywords');
select ok(
  private.never_wear_hit('Denim Shorts for Men', 'shorts'),
  'a keyword hit is found');
select ok(
  not private.never_wear_hit('Short Sleeve Shirt', 'short'),
  '"short sleeve" is not a pair of shorts');
select ok(
  private.never_wear_matches('Black Stiletto Heels', 'heels', array['heels']),
  'a never-wear option matches the product');
select ok(
  not private.never_wear_matches('Plain Navy Shirt', 'shirts', array['heels']),
  'an unrelated product does not match');
select ok(
  not private.never_wear_matches('Plain Navy Shirt', 'shirts', '{}'::text[]),
  'no options means no match');

-- ── the feed honours the rules ──────────────────────────────────────────────
select pg_temp.as_user('f0000000-0000-4000-8000-000000000001');

select is(
  (select count(*)::int from public.rank_products(null::public.slot, null::public.product_gender, null, null::real, null::uuid, 10) where external_id = 'HEEL'),
  0, 'never-wear products are filtered out');
select is(
  (select count(*)::int from public.rank_products(null::public.slot, null::public.product_gender, null, null::real, null::uuid, 10) where external_id = 'RED'),
  0, 'products in an avoided colour are filtered out');
select is(
  (select count(*)::int from public.rank_products(null::public.slot, null::public.product_gender, null, null::real, null::uuid, 10) where external_id = 'PLAIN'),
  1, 'the allowed product is still shown');
select is(
  (select count(*)::int from public.rank_products(null::public.slot, null::public.product_gender, null, null::real, null::uuid, 10) where external_id = 'SLEEVE'),
  1, '"short sleeve" shirts are not treated as shorts');

-- the same rules apply to the no-taste fallback
update public.taste_profiles set taste_vector = null where user_id = 'f0000000-0000-4000-8000-000000000001';
select is(
  (select count(*)::int from public.rank_products(null::public.slot, null::public.product_gender, null, null::real, null::uuid, 10) where external_id = 'HEEL'),
  0, 'never-wear products are filtered out without a taste vector too');

select pg_temp.as_admin();
select * from finish();
rollback;
