-- Storage: owner-folder policies on the private buckets; partner can read a wardrobe photo only
-- while it is shown in a shared room.
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

insert into auth.users (id, email) values
  ('5a000000-0000-4000-8000-00000000000a', 'st-a@example.com'),
  ('5b000000-0000-4000-8000-00000000000b', 'st-b@example.com'),
  ('5c000000-0000-4000-8000-00000000000c', 'st-minor@example.com');
update public.profiles set is_adult = true, age_confirmed_at = now()
 where id in ('5a000000-0000-4000-8000-00000000000a', '5b000000-0000-4000-8000-00000000000b');

insert into storage.objects (bucket_id, name, owner) values
  ('user-photos', '5b000000-0000-4000-8000-00000000000b/selfie.jpg', '5b000000-0000-4000-8000-00000000000b'),
  ('tryon-results', '5b000000-0000-4000-8000-00000000000b/result.png', null),
  ('wardrobe-photos', '5a000000-0000-4000-8000-00000000000a/jeans.jpg', '5a000000-0000-4000-8000-00000000000a');

insert into public.wardrobe_items (id, user_id, slot, category, image_path) values
  ('5d000000-0000-4000-8000-00000000000d', '5a000000-0000-4000-8000-00000000000a', 'bottom', 'jeans',
   '5a000000-0000-4000-8000-00000000000a/jeans.jpg');

select plan(10);

select pg_temp.as_user('5a000000-0000-4000-8000-00000000000a');
select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner) values ('user-photos', '5a000000-0000-4000-8000-00000000000a/me.jpg', '5a000000-0000-4000-8000-00000000000a')$$,
  'adult uploads into own user-photos folder');
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner) values ('user-photos', '5b000000-0000-4000-8000-00000000000b/x.jpg', '5a000000-0000-4000-8000-00000000000a')$$,
  '42501', null, 'cannot upload into another user''s folder');
select is_empty($$select 1 from storage.objects where bucket_id = 'user-photos' and name like '5b000000%'$$, 'cannot read another user''s photos');
select is_empty($$select 1 from storage.objects where bucket_id = 'tryon-results'$$, 'cannot read another user''s try-on results');
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('tryon-results', '5a000000-0000-4000-8000-00000000000a/fake.png')$$,
  '42501', null, 'users cannot write try-on results (worker only)');

select pg_temp.as_user('5c000000-0000-4000-8000-00000000000c');
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('user-photos', '5c000000-0000-4000-8000-00000000000c/me.jpg')$$,
  '42501', null, 'non-adult cannot upload photos');
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('wardrobe-photos', '5c000000-0000-4000-8000-00000000000c/top.jpg')$$,
  '42501', null, 'non-adult cannot upload wardrobe photos');

-- Partner visibility of a wardrobe photo follows the shared outfit.
select pg_temp.as_user('5b000000-0000-4000-8000-00000000000b');
select is_empty($$select 1 from storage.objects where bucket_id = 'wardrobe-photos'$$, 'B cannot see A wardrobe photo before sharing a room');

select pg_temp.as_admin();
insert into public.date_rooms (id, user_a, user_b, occasion, status) values
  ('5e000000-0000-4000-8000-00000000000e', '5a000000-0000-4000-8000-00000000000a', '5b000000-0000-4000-8000-00000000000b', 'brunch', 'active');
insert into public.outfits (id, owner_id, wardrobe_item_ids) values
  ('5f000000-0000-4000-8000-00000000000f', '5a000000-0000-4000-8000-00000000000a', array['5d000000-0000-4000-8000-00000000000d']::uuid[]);
insert into public.room_pairs (room_id, outfit_a_id) values ('5e000000-0000-4000-8000-00000000000e', '5f000000-0000-4000-8000-00000000000f');

select pg_temp.as_user('5b000000-0000-4000-8000-00000000000b');
select isnt_empty($$select 1 from storage.objects where bucket_id = 'wardrobe-photos'$$, 'B can read A wardrobe photo once it is in a shared pair');
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('wardrobe-photos', '5a000000-0000-4000-8000-00000000000a/sneaky.jpg')$$,
  '42501', null, 'partner still cannot write into A wardrobe folder');

select pg_temp.as_admin();
select * from finish();
rollback;
