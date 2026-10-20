-- Taste maths: submit_quiz builds weights/fields/vector from swipes; record_interaction moves the
-- vector; rank_products filters and orders; the fallback works for a user with no taste yet.
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
create function pg_temp.as_admin() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', true);
end $$;

-- Basis vectors: e1, e2, e3 are orthogonal unit vectors in 768-D.
create temp table tv (name text primary key, v extensions.halfvec(768));
insert into tv values
  ('e1', ('[' || '1' || repeat(',0', 767) || ']')::extensions.halfvec),
  ('e2', ('[0,1' || repeat(',0', 766) || ']')::extensions.halfvec),
  ('e3', ('[0,0,1' || repeat(',0', 765) || ']')::extensions.halfvec);

insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-000000000001', 'taste-a@example.com'),
  ('a0000000-0000-4000-8000-000000000002', 'taste-b@example.com');

insert into public.archetypes (id, slug, name) values
  ('b0000000-0000-4000-8000-0000000000a1', 'arch-a', 'Arch A'),
  ('b0000000-0000-4000-8000-0000000000b1', 'arch-b', 'Arch B');

insert into public.products (id, source, external_id, brand, title, category, slot, gender, formality, price_inr, image_url, affiliate_url, embedding) values
  ('c0000000-0000-4000-8000-000000000001', 'other', 'UP',      'T', 'Up',      'tee',   'top',    'men',   2,  999, 'https://x.test/1.jpg', 'https://x.test/1', (select v from tv where name = 'e1')),
  ('c0000000-0000-4000-8000-000000000002', 'other', 'SIDE',    'T', 'Side',    'tee',   'top',    'men',   2,  999, 'https://x.test/2.jpg', 'https://x.test/2', (select v from tv where name = 'e2')),
  ('c0000000-0000-4000-8000-000000000003', 'other', 'BOTTOM',  'T', 'Bottom',  'chino', 'bottom', 'men',   2,  999, 'https://x.test/3.jpg', 'https://x.test/3', (select v from tv where name = 'e3')),
  ('c0000000-0000-4000-8000-000000000004', 'other', 'WOMEN',   'T', 'Women',   'tee',   'top',    'women', 2,  999, 'https://x.test/4.jpg', 'https://x.test/4', (select v from tv where name = 'e1')),
  ('c0000000-0000-4000-8000-000000000005', 'other', 'PRICEY',  'T', 'Pricey',  'tee',   'top',    'men',   2, 9999, 'https://x.test/5.jpg', 'https://x.test/5', (select v from tv where name = 'e1'));

insert into public.quiz_cards (id, archetype_id, gender, item_ids, image_urls) values
  ('d0000000-0000-4000-8000-00000000000a', 'b0000000-0000-4000-8000-0000000000a1', 'men', array['c0000000-0000-4000-8000-000000000001']::uuid[], array['https://x.test/1.jpg']),
  ('d0000000-0000-4000-8000-00000000000b', 'b0000000-0000-4000-8000-0000000000b1', 'men', array['c0000000-0000-4000-8000-000000000002']::uuid[], array['https://x.test/2.jpg']),
  ('d0000000-0000-4000-8000-00000000000c', 'b0000000-0000-4000-8000-0000000000b1', 'men', array['c0000000-0000-4000-8000-000000000003']::uuid[], array['https://x.test/3.jpg']);

select plan(17);

-- ── submit_quiz ─────────────────────────────────────────────────────────────
select pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
select lives_ok(
  $$select public.submit_quiz(jsonb_build_object(
      'basics', jsonb_build_object('catalog','both','budget_band','2000-5000','city','Delhi NCR','height_cm',170,'fit_pref','regular'),
      'swipes', jsonb_build_array(
        jsonb_build_object('card_id','d0000000-0000-4000-8000-00000000000a','action','love'),
        jsonb_build_object('card_id','d0000000-0000-4000-8000-00000000000b','action','like'),
        jsonb_build_object('card_id','d0000000-0000-4000-8000-00000000000c','action','skip')),
      'hard_rules', jsonb_build_object('colors_like', jsonb_build_array('navy'),'colors_avoid', jsonb_build_array('red'),'never_wear', jsonb_build_array('heels'),'comfort_vs_statement',50)
    ))$$,
  'submit_quiz saves a completed quiz');

select is(
  (select archetype_weights from public.taste_profiles where user_id = 'a0000000-0000-4000-8000-000000000001'),
  '{"arch-a": 0.667, "arch-b": 0.333}'::jsonb,
  'archetype weights: love counts 2x, like 1x, skip 0x, normalised');
select is((select comfort_vs_statement from public.taste_profiles where user_id = 'a0000000-0000-4000-8000-000000000001'), 3::smallint, 'comfort slider 50 maps to 3');
select is((select colors_like from public.taste_profiles where user_id = 'a0000000-0000-4000-8000-000000000001'), array['navy'], 'colors_like stored');
select is((select never_wear from public.taste_profiles where user_id = 'a0000000-0000-4000-8000-000000000001'), array['heels'], 'never_wear stored');
select is((select interaction_count from public.taste_profiles where user_id = 'a0000000-0000-4000-8000-000000000001'), 3, 'interaction_count = number of swipes');
select is((select version from public.taste_profiles where user_id = 'a0000000-0000-4000-8000-000000000001'), 1, 'first save is version 1');
select is((select default_budget_inr from public.profiles where id = 'a0000000-0000-4000-8000-000000000001'), 5000, 'profile budget set from the band');

select ok(
  (1 - ((select taste_vector from public.taste_profiles where user_id = 'a0000000-0000-4000-8000-000000000001') operator(extensions.<=>) (select v from tv where name = 'e1')))
  > (1 - ((select taste_vector from public.taste_profiles where user_id = 'a0000000-0000-4000-8000-000000000001') operator(extensions.<=>) (select v from tv where name = 'e2'))),
  'taste is closer to the loved card than the liked card');
select ok(
  (1 - ((select taste_vector from public.taste_profiles where user_id = 'a0000000-0000-4000-8000-000000000001') operator(extensions.<=>) (select v from tv where name = 'e2')))
  > (1 - ((select taste_vector from public.taste_profiles where user_id = 'a0000000-0000-4000-8000-000000000001') operator(extensions.<=>) (select v from tv where name = 'e3'))),
  'skipped direction is pushed away');

select throws_ok(
  $$select public.submit_quiz(jsonb_build_object('basics','{}'::jsonb,'swipes',jsonb_build_array(jsonb_build_object('card_id','ffffffff-ffff-4fff-8fff-ffffffffffff','action','like')),'hard_rules','{}'::jsonb))$$,
  '22023', null, 'submit_quiz rejects unknown card ids');

-- ── record_interaction ──────────────────────────────────────────────────────
create temp table snap as select taste_vector as v from public.taste_profiles where user_id = 'a0000000-0000-4000-8000-000000000001';
select lives_ok(
  $$select public.record_interaction('product'::public.interaction_target, 'c0000000-0000-4000-8000-000000000002', 'love'::public.interaction_action)$$,
  'record_interaction logs and updates');
select is((select interaction_count from public.taste_profiles where user_id = 'a0000000-0000-4000-8000-000000000001'), 4, 'interaction_count incremented');
select ok(
  (1 - ((select taste_vector from public.taste_profiles where user_id = 'a0000000-0000-4000-8000-000000000001') operator(extensions.<=>) (select v from tv where name = 'e2')))
  > (1 - ((select v from snap) operator(extensions.<=>) (select v from tv where name = 'e2'))),
  'loving a product moves the taste vector toward it');

-- ── rank_products ───────────────────────────────────────────────────────────
select is(
  (select external_id from public.rank_products('top'::public.slot, 'men'::public.product_gender, 5000, null::real, null::uuid, 10) limit 1),
  'UP', 'closest product ranked first');
select is(
  (select count(*)::int from public.rank_products('top'::public.slot, 'men'::public.product_gender, 5000, null::real, null::uuid, 10)),
  2, 'rank_products filters slot/gender/price (UP + SIDE)');

-- ── fallback for a user with no taste yet ───────────────────────────────────
select pg_temp.as_user('a0000000-0000-4000-8000-000000000002');
select is(
  (select similarity from public.rank_products(null::public.slot, null::public.product_gender, null, null::real, null::uuid, 10) limit 1),
  0::real, 'no taste yet: falls back with similarity 0');

-- ── anon ────────────────────────────────────────────────────────────────────
select pg_temp.as_anon();
select throws_ok($$select public.submit_quiz('{}'::jsonb)$$, '42501', null, 'anon cannot submit a quiz');

select pg_temp.as_admin();
select * from finish();
rollback;
