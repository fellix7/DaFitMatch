-- quiz_cards is a public-read catalog table (service-role write), and
-- archetype_slot_products returns in-stock products closest to an archetype centroid.
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

-- Fixtures (as postgres): an archetype with a centroid and five products.
insert into auth.users (id, email) values ('c1111111-0000-4000-8000-000000000001', 'cards@example.com');
insert into public.archetypes (id, slug, name, centroid) values
  ('d1111111-0000-4000-8000-000000000001', 'cards-test', 'Cards Test',
   array_fill(0.1::real, array[768])::extensions.halfvec);
insert into public.products (id, source, external_id, brand, title, category, slot, gender, formality, price_inr, image_url, affiliate_url, embedding)
values
  ('e1111111-0000-4000-8000-000000000001', 'other', 'QT-1', 'T', 'M top', 'tee', 'top', 'men', 2, 999, 'https://x.test/1.jpg', 'https://x.test/1', array_fill(0.1::real, array[768])::extensions.halfvec),
  ('e1111111-0000-4000-8000-000000000002', 'other', 'QT-2', 'T', 'M bottom', 'chino', 'bottom', 'men', 2, 999, 'https://x.test/2.jpg', 'https://x.test/2', array_fill(0.1::real, array[768])::extensions.halfvec),
  ('e1111111-0000-4000-8000-000000000003', 'other', 'QT-3', 'T', 'W top', 'top', 'top', 'women', 2, 999, 'https://x.test/3.jpg', 'https://x.test/3', array_fill(0.1::real, array[768])::extensions.halfvec),
  ('e1111111-0000-4000-8000-000000000004', 'other', 'QT-4', 'T', 'Uni top', 'shirt', 'top', 'unisex', 2, 999, 'https://x.test/4.jpg', 'https://x.test/4', array_fill(0.1::real, array[768])::extensions.halfvec),
  ('e1111111-0000-4000-8000-000000000005', 'other', 'QT-5', 'T', 'Out of stock top', 'tee', 'top', 'men', 2, 999, 'https://x.test/5.jpg', 'https://x.test/5', array_fill(0.1::real, array[768])::extensions.halfvec);
update public.products set in_stock = false where id = 'e1111111-0000-4000-8000-000000000005';

insert into public.quiz_cards (id, archetype_id, gender, item_ids, image_urls) values
  ('f1111111-0000-4000-8000-000000000001', 'd1111111-0000-4000-8000-000000000001', 'men',
   array['e1111111-0000-4000-8000-000000000001','e1111111-0000-4000-8000-000000000002']::uuid[],
   array['https://x.test/1.jpg','https://x.test/2.jpg']);

select plan(8);

-- ── Public read / service-role write ────────────────────────────────────────
select pg_temp.as_anon();
select isnt_empty('select 1 from public.quiz_cards', 'anon can read quiz cards');
select throws_ok(
  $$insert into public.quiz_cards (archetype_id, gender, item_ids, image_urls) values ('d1111111-0000-4000-8000-000000000001', 'men', array['e1111111-0000-4000-8000-000000000001']::uuid[], array['https://x.test/1.jpg'])$$,
  '42501', null, 'anon cannot insert quiz cards');

select pg_temp.as_user('c1111111-0000-4000-8000-000000000001');
select isnt_empty('select 1 from public.quiz_cards', 'authenticated can read quiz cards');
select throws_ok(
  $$update public.quiz_cards set active = false$$, '42501', null, 'authenticated cannot update quiz cards');
select throws_ok(
  $$delete from public.quiz_cards$$, '42501', null, 'authenticated cannot delete quiz cards');

select pg_temp.as_service();
select lives_ok(
  $$insert into public.quiz_cards (archetype_id, gender, item_ids, image_urls) values ('d1111111-0000-4000-8000-000000000001', 'women', array['e1111111-0000-4000-8000-000000000003']::uuid[], array['https://x.test/3.jpg'])$$,
  'service role can insert quiz cards');

-- ── archetype_slot_products ─────────────────────────────────────────────────
select is(
  (select array_agg(external_id order by external_id)
     from public.archetype_slot_products('d1111111-0000-4000-8000-000000000001', 'top', 'men', 10)),
  array['QT-1', 'QT-4'],
  'filters slot + gender (+unisex) and drops out-of-stock'
);
select is_empty(
  $$select 1 from public.archetype_slot_products('d1111111-0000-4000-8000-000000000001', 'footwear', 'men', 10)$$,
  'no rows for a slot with no matching products');

select pg_temp.as_admin();
select * from finish();
rollback;
