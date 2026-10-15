-- ⚠ LOCAL DEV / TEST DATA ONLY. Two confirmed adult test users, a shared date room, a few
-- wardrobe items and one outfit each. Sign in locally with a magic link (emails land in Mailpit,
-- http://127.0.0.1:54324) or with the dev-only password below. Never load into production.
--
--   asha.test@example.com   / dafitmatch-dev-only   (seat A)
--   bilal.test@example.com  / dafitmatch-dev-only   (seat B)

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-00000000000a', 'authenticated', 'authenticated',
   'asha.test@example.com', extensions.crypt('dafitmatch-dev-only', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Asha (test)"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-4000-8000-00000000000b', 'authenticated', 'authenticated',
   'bilal.test@example.com', extensions.crypt('dafitmatch-dev-only', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Bilal (test)"}', now(), now(), '', '', '', '')
on conflict (id) do nothing;

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users u
where u.id in ('a0000000-0000-4000-8000-00000000000a', 'b0000000-0000-4000-8000-00000000000b')
on conflict do nothing;

-- Profiles are created by the on_auth_user_created trigger; complete them as if onboarding ran.
update public.profiles set
  is_adult = true, age_confirmed_at = now(), city = 'Delhi NCR',
  gender_presentation = 'feminine', default_budget_inr = 6000
where id = 'a0000000-0000-4000-8000-00000000000a';
update public.profiles set
  is_adult = true, age_confirmed_at = now(), city = 'Delhi NCR',
  gender_presentation = 'masculine', default_budget_inr = 7000
where id = 'b0000000-0000-4000-8000-00000000000b';

insert into public.taste_profiles (user_id, archetype_weights, colors_like, colors_avoid, never_wear, comfort_vs_statement, fit_prefs) values
  ('a0000000-0000-4000-8000-00000000000a', '{"soft-romantic":0.6,"minimal":0.4}', array['ivory','green','pink'], array['neon'], array['crop tops'], 3, '{"bottom":"wide","rise":"high"}'),
  ('b0000000-0000-4000-8000-00000000000b', '{"smart-casual":0.7,"quiet-luxury":0.3}', array['navy','beige','white'], array['orange'], array['shorts'], 2, '{"top":"regular","bottom":"straight"}')
on conflict (user_id) do nothing;

-- Wardrobe: pieces Asha already owns (no photos/embeddings in seed).
insert into public.wardrobe_items (id, user_id, slot, category, title, colors, formality, occasions, tags) values
  ('a1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a', 'bottom', 'jeans', 'My blue straight jeans', array['blue'], 2, array['brunch','movie'], array['denim']),
  ('a1000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-00000000000a', 'footwear', 'sandals', 'Tan strappy sandals', array['tan'], 3, array['brunch','dinner'], array['leather'])
on conflict (id) do nothing;

-- A date room linking the two test users, with one composed pair.
insert into public.date_rooms (id, user_a, user_b, invite_code, coordination_mode, occasion, budget_a_inr, budget_b_inr, status) values
  ('d0000000-0000-4000-8000-0000000000d1', 'a0000000-0000-4000-8000-00000000000a', 'b0000000-0000-4000-8000-00000000000b',
   'TESTROOM', 'complementary', 'dinner', 6000, 7000, 'active')
on conflict (id) do nothing;

insert into public.outfits (id, owner_id, item_ids, wardrobe_item_ids, total_price_inr, rationale, styling_tip, occasion)
select 'a2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a',
       array(select id from public.products where external_id in ('TEST-004', 'TEST-028') order by external_id),
       array['a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002']::uuid[],
       (select sum(price_inr) from public.products where external_id in ('TEST-004', 'TEST-028')),
       '[TEST] Satin cami dresses up jeans you already own.', 'Tuck the cami and add the chain.', 'dinner'
on conflict (id) do nothing;

insert into public.outfits (id, owner_id, item_ids, total_price_inr, rationale, styling_tip, occasion)
select 'b2000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-00000000000b',
       array(select id from public.products where external_id in ('TEST-001', 'TEST-008', 'TEST-020') order by external_id),
       (select sum(price_inr) from public.products where external_id in ('TEST-001', 'TEST-008', 'TEST-020')),
       '[TEST] Ivory and beige complement her ivory cami.', 'Roll the sleeves twice.', 'dinner'
on conflict (id) do nothing;

insert into public.room_pairs (id, room_id, outfit_a_id, outfit_b_id, palette, pair_score) values
  ('e0000000-0000-4000-8000-0000000000e1', 'd0000000-0000-4000-8000-0000000000d1',
   'a2000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001',
   array['ivory','beige','blue'], 0.82)
on conflict (id) do nothing;
