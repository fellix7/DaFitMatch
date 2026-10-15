-- Date rooms: only the two members see the room; partner outfits/wardrobe are visible only while
-- shared; leaving removes access; votes and locks go through RPCs.
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

-- A = seat A, B = partner, C = outsider adult, M = minor
insert into auth.users (id, email, raw_user_meta_data) values
  ('a1111111-1111-4111-8111-111111111111', 'room-a@example.com', '{"display_name":"Ana"}'),
  ('b2222222-2222-4222-8222-222222222222', 'room-b@example.com', '{"display_name":"Ben"}'),
  ('c3333333-3333-4333-8333-333333333333', 'room-c@example.com', '{"display_name":"Cy"}'),
  ('d4444444-4444-4444-8444-444444444444', 'room-m@example.com', '{"display_name":"Min"}');
update public.profiles set is_adult = true, age_confirmed_at = now()
 where id in ('a1111111-1111-4111-8111-111111111111', 'b2222222-2222-4222-8222-222222222222', 'c3333333-3333-4333-8333-333333333333');
insert into public.products (id, source, external_id, brand, title, category, slot, gender, formality, price_inr, image_url, affiliate_url)
values ('e5555555-5555-4555-8555-555555555555', 'other', 'ROOM-1', 'T', 'T', 'tee', 'top', 'unisex', 2, 999, 'https://x.test/1.jpg', 'https://x.test/1');
insert into public.date_rooms (id, user_a, invite_code, occasion) values
  ('f6666666-6666-4666-8666-666666666666', 'a1111111-1111-4111-8111-111111111111', 'JOINME23', 'dinner');
insert into public.wardrobe_items (id, user_id, slot, category, image_path) values
  ('a7777777-7777-4777-8777-777777777777', 'a1111111-1111-4111-8111-111111111111', 'bottom', 'jeans', 'a1111111-1111-4111-8111-111111111111/jeans.jpg');
insert into public.outfits (id, owner_id, item_ids, wardrobe_item_ids) values
  ('a8888888-8888-4888-8888-888888888888', 'a1111111-1111-4111-8111-111111111111',
   array['e5555555-5555-4555-8555-555555555555']::uuid[], array['a7777777-7777-4777-8777-777777777777']::uuid[]),
  ('b9999999-9999-4999-8999-999999999999', 'b2222222-2222-4222-8222-222222222222',
   array['e5555555-5555-4555-8555-555555555555']::uuid[], '{}');

select plan(32);

-- ── Before joining ───────────────────────────────────────────────────────────
select pg_temp.as_user('b2222222-2222-4222-8222-222222222222');
select is_empty('select 1 from public.date_rooms', 'non-member cannot read the room');
select is_empty($$select * from public.room_members('f6666666-6666-4666-8666-666666666666')$$, 'non-member gets no room members');
select is_empty($$select 1 from public.outfits where id = 'a8888888-8888-4888-8888-888888888888'$$, 'non-member cannot read A outfit');
select throws_ok(
  $$insert into public.room_pairs (room_id) values ('f6666666-6666-4666-8666-666666666666')$$,
  '42501', null, 'non-member cannot add pairs');
select throws_ok(
  $$select public.leave_room('f6666666-6666-4666-8666-666666666666')$$,
  '42501', null, 'non-member cannot leave (or probe) a room');

-- ── Age gate on rooms ────────────────────────────────────────────────────────
select pg_temp.as_user('d4444444-4444-4444-8444-444444444444');
select throws_ok($$select public.join_room('JOINME23')$$, '42501', null, 'minor cannot join a room');
select throws_ok(
  $$insert into public.date_rooms (user_a, occasion) values ('d4444444-4444-4444-8444-444444444444', 'dinner')$$,
  '42501', null, 'minor cannot create a room');

-- ── Join ────────────────────────────────────────────────────────────────────
select pg_temp.as_user('b2222222-2222-4222-8222-222222222222');
select throws_ok($$select public.join_room('NOPE0000')$$, 'P0002', null, 'bad invite code is rejected');
select is(public.join_room('joinme23'), 'f6666666-6666-4666-8666-666666666666'::uuid, 'B joins with a case-insensitive code');
select results_eq('select status::text from public.date_rooms', $$values ('active')$$, 'room becomes active');
select results_eq(
  $$select seat, display_name from public.room_members('f6666666-6666-4666-8666-666666666666')$$,
  $$values ('a'::text, 'Ana'::text), ('b', 'Ben')$$,
  'members see each other''s display names');
select throws_ok(
  $$insert into public.room_pairs (room_id, outfit_a_id, outfit_b_id) values ('f6666666-6666-4666-8666-666666666666', 'b9999999-9999-4999-8999-999999999999', null)$$,
  '42501', null, 'seat A outfit must belong to user_a');
select lives_ok(
  $$insert into public.room_pairs (id, room_id, outfit_a_id, outfit_b_id) values ('aa000000-0000-4000-8000-000000000001', 'f6666666-6666-4666-8666-666666666666', 'a8888888-8888-4888-8888-888888888888', 'b9999999-9999-4999-8999-999999999999')$$,
  'member pairs both members'' outfits');
select isnt_empty($$select 1 from public.outfits where id = 'a8888888-8888-4888-8888-888888888888'$$, 'partner sees A outfit in the shared room');
select isnt_empty($$select 1 from public.wardrobe_items where id = 'a7777777-7777-4777-8777-777777777777'$$, 'partner sees A wardrobe piece used in the shared outfit');

-- ── Outsider ─────────────────────────────────────────────────────────────────
select pg_temp.as_user('c3333333-3333-4333-8333-333333333333');
select is_empty('select 1 from public.date_rooms', 'outsider cannot read the room');
select is_empty('select 1 from public.room_pairs', 'outsider cannot read room pairs');
select is_empty($$select 1 from public.outfits where id in ('a8888888-8888-4888-8888-888888888888', 'b9999999-9999-4999-8999-999999999999')$$, 'outsider cannot read members'' outfits');
select is_empty('select 1 from public.wardrobe_items', 'outsider cannot read wardrobe');
select throws_ok($$select public.join_room('JOINME23')$$, 'P0001', null, 'full room cannot be joined');
select throws_ok($$select public.vote_room_pair('aa000000-0000-4000-8000-000000000001', 'up')$$, '42501', null, 'outsider cannot vote');

-- ── Votes & lock ─────────────────────────────────────────────────────────────
select pg_temp.as_user('b2222222-2222-4222-8222-222222222222');
select throws_ok($$update public.room_pairs set vote_a = 'up'$$, '42501', null, 'members cannot write votes directly');
select throws_ok($$select public.lock_room_pair('aa000000-0000-4000-8000-000000000001')$$, 'P0001', null, 'cannot lock before both vote up');
select is((public.vote_room_pair('aa000000-0000-4000-8000-000000000001', 'up')).vote_b, 'up'::public.vote, 'B vote lands in seat B column only');
select pg_temp.as_user('a1111111-1111-4111-8111-111111111111');
select is((public.vote_room_pair('aa000000-0000-4000-8000-000000000001', 'up')).vote_a, 'up'::public.vote, 'A vote lands in seat A column');
select ok((public.lock_room_pair('aa000000-0000-4000-8000-000000000001')).is_locked, 'pair locks after both vote up');

-- ── Leave: A's outfits disappear from the room ───────────────────────────────
select lives_ok($$select public.leave_room('f6666666-6666-4666-8666-666666666666')$$, 'A leaves');
select is_empty('select 1 from public.date_rooms', 'A can no longer read the room');

select pg_temp.as_user('b2222222-2222-4222-8222-222222222222');
select results_eq(
  'select outfit_a_id, vote_a::text, is_locked from public.room_pairs',
  $$values (null::uuid, null::text, false)$$,
  'A outfit, vote and lock are removed from the pair');
select is_empty(
  $$select 1 from public.outfits where id = 'a8888888-8888-4888-8888-888888888888'
    union all select 1 from public.wardrobe_items where id = 'a7777777-7777-4777-8777-777777777777'$$,
  'B can no longer see A outfit or wardrobe piece');

-- Regression: membership checks must not be fooled by an empty seat (NULL in `uid in (...)`).
select pg_temp.as_user('c3333333-3333-4333-8333-333333333333');
select throws_ok($$select public.leave_room('f6666666-6666-4666-8666-666666666666')$$, '42501', null,
  'outsider cannot leave a half-empty room (would evict the remaining member)');
select pg_temp.as_admin();
select results_eq(
  $$select user_b from public.date_rooms where id = 'f6666666-6666-4666-8666-666666666666'$$,
  $$values ('b2222222-2222-4222-8222-222222222222'::uuid)$$,
  'remaining member keeps their seat');

select pg_temp.as_admin();
select * from finish();
rollback;
