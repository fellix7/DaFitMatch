-- ════════════════════════════════════════════════════════════════════════════
-- DaFitMatch schema v1
-- Human review required before merge (RLS, storage, cost limits).
-- Never edit this file after it has been applied anywhere: add a new migration.
-- Conventions:
--   * every table has RLS enabled; catalog tables are public-read, service-role write
--   * SECURITY DEFINER functions use `set search_path = ''` and fully qualified names
--   * policy predicates use `(select auth.uid())` so it is evaluated once per statement
--   * embeddings are extensions.halfvec(768) (Marqo-FashionSigLIP, one shared space)
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Extensions & schemas ───────────────────────────────────────────────────
create extension if not exists vector with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- Helpers that RLS policies call. Not exposed through the Data API.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- ─── Enums (mirrored in packages/shared/src/enums.ts) ───────────────────────
create type public.product_source as enum ('myntra', 'ajio', 'flipkart', 'amazon', 'other');
create type public.slot as enum ('top', 'bottom', 'footwear', 'layer', 'accessory', 'full');
create type public.product_gender as enum ('men', 'women', 'unisex');
create type public.gender_presentation as enum ('masculine', 'feminine', 'androgynous');
create type public.coordination_mode as enum ('matching', 'complementary', 'one_leads');
create type public.occasion as enum ('brunch', 'dinner', 'gallery', 'rooftop', 'movie', 'festive');
create type public.room_status as enum ('open', 'active', 'locked', 'closed');
create type public.vote as enum ('up', 'down');
create type public.interaction_action as enum ('like', 'skip', 'love', 'save', 'click', 'tryon', 'swap');
create type public.interaction_target as enum ('product', 'outfit', 'room_pair', 'venue', 'archetype', 'wardrobe_item');
create type public.tryon_status as enum ('queued', 'running', 'succeeded', 'failed');

-- ─── Generic helpers ────────────────────────────────────────────────────────
create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- 8 chars from an unambiguous alphabet (no 0/O/1/I), crypto-random.
-- SECURITY DEFINER: it runs as a column default under the inserting user's role.
create function private.gen_invite_code()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea := extensions.gen_random_bytes(8);
  code text := '';
begin
  for i in 0..7 loop
    code := code || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  return code;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- Tables
-- ════════════════════════════════════════════════════════════════════════════

-- ─── profiles ───────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 60),
  gender_presentation public.gender_presentation,
  height_cm smallint check (height_cm between 100 and 250),
  city text default 'Delhi NCR',
  default_budget_inr integer check (default_budget_inr >= 0),
  -- Set only via public.confirm_age(); never directly by the client.
  is_adult boolean not null default false,
  age_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column public.profiles.is_adult is 'From the signup age gate (confirm_age RPC). Gates photo upload and date rooms.';

-- ─── taste_profiles ─────────────────────────────────────────────────────────
create table public.taste_profiles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  archetype_weights jsonb not null default '{}'::jsonb check (jsonb_typeof(archetype_weights) = 'object'),
  colors_like text[] not null default '{}',
  colors_avoid text[] not null default '{}',
  never_wear text[] not null default '{}',
  comfort_vs_statement smallint not null default 3 check (comfort_vs_statement between 1 and 5),
  fit_prefs jsonb not null default '{}'::jsonb check (jsonb_typeof(fit_prefs) = 'object'),
  taste_vector extensions.halfvec(768),
  interaction_count integer not null default 0 check (interaction_count >= 0),
  version integer not null default 0 check (version >= 0),
  updated_at timestamptz not null default now()
);

-- ─── archetypes ─────────────────────────────────────────────────────────────
create table public.archetypes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  -- Style references only ("inspired by <brand>"). Never a partnership or catalog.
  benchmark_brands text[] not null default '{}',
  description text not null default '',
  centroid extensions.halfvec(768),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── reference_looks (embeddings only, no images stored) ────────────────────
create table public.reference_looks (
  id uuid primary key default gen_random_uuid(),
  archetype_id uuid not null references public.archetypes (id) on delete cascade,
  source_brand text not null,
  source_url text,
  gender public.product_gender not null,
  embedding extensions.halfvec(768),
  created_at timestamptz not null default now()
);
create index reference_looks_archetype_id_idx on public.reference_looks (archetype_id);

-- ─── products (the shopping catalog) ────────────────────────────────────────
create table public.products (
  id uuid primary key default gen_random_uuid(),
  source public.product_source not null,
  external_id text not null,
  brand text not null,
  title text not null,
  category text not null,
  slot public.slot not null,
  gender public.product_gender not null,
  colors text[] not null default '{}',
  formality smallint not null check (formality between 1 and 5),
  occasions text[] not null default '{}',
  price_inr integer not null check (price_inr >= 0),
  image_url text not null check (image_url ~ '^https?://'),
  affiliate_url text not null check (affiliate_url ~ '^https?://'),
  in_stock boolean not null default true,
  last_seen_at timestamptz,
  last_shown_at timestamptz,
  embedding extensions.halfvec(768),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, external_id)
);
create index products_slot_gender_price_idx on public.products (slot, gender, price_inr) where in_stock;

-- ─── wardrobe_items (garments the user already owns) ────────────────────────
create table public.wardrobe_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  slot public.slot not null,
  category text not null check (char_length(category) between 1 and 60),
  title text check (char_length(title) <= 120),
  colors text[] not null default '{}',
  formality smallint check (formality between 1 and 5),
  occasions text[] not null default '{}',
  tags text[] not null default '{}',
  -- Object name inside the private `wardrobe-photos` bucket; must live under the owner's folder.
  image_path text check (image_path is null or split_part(image_path, '/', 1) = user_id::text),
  -- Filled by the offline batch embedder (no embedding model at request time).
  embedding extensions.halfvec(768),
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index wardrobe_items_user_slot_idx on public.wardrobe_items (user_id, slot) where not is_archived;

-- ─── outfits ────────────────────────────────────────────────────────────────
create table public.outfits (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  archetype_id uuid references public.archetypes (id) on delete set null,
  item_ids uuid[] not null default '{}',
  wardrobe_item_ids uuid[] not null default '{}',
  total_price_inr integer not null default 0 check (total_price_inr >= 0),
  score real,
  rationale text,
  styling_tip text,
  occasion public.occasion,
  created_at timestamptz not null default now(),
  constraint outfits_has_items check (cardinality(item_ids) + cardinality(wardrobe_item_ids) >= 1)
);
create index outfits_owner_id_idx on public.outfits (owner_id, created_at desc);

-- ─── date_rooms ─────────────────────────────────────────────────────────────
create table public.date_rooms (
  id uuid primary key default gen_random_uuid(),
  -- Both seats are nullable: a member who leaves frees their seat.
  user_a uuid references public.profiles (id) on delete set null,
  user_b uuid references public.profiles (id) on delete set null,
  invite_code text not null unique default private.gen_invite_code() check (invite_code ~ '^[A-Z0-9]{8}$'),
  coordination_mode public.coordination_mode not null default 'complementary',
  occasion public.occasion not null,
  budget_a_inr integer check (budget_a_inr >= 0),
  budget_b_inr integer check (budget_b_inr >= 0),
  status public.room_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint date_rooms_distinct_members check (user_a is null or user_b is null or user_a <> user_b)
);
create index date_rooms_user_a_idx on public.date_rooms (user_a);
create index date_rooms_user_b_idx on public.date_rooms (user_b);

-- ─── room_pairs ─────────────────────────────────────────────────────────────
create table public.room_pairs (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.date_rooms (id) on delete cascade,
  outfit_a_id uuid references public.outfits (id) on delete set null,
  outfit_b_id uuid references public.outfits (id) on delete set null,
  palette text[] not null default '{}',
  pair_score real,
  vote_a public.vote,
  vote_b public.vote,
  is_locked boolean not null default false,
  venue_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
create index room_pairs_room_id_idx on public.room_pairs (room_id);
create index room_pairs_outfit_a_idx on public.room_pairs (outfit_a_id);
create index room_pairs_outfit_b_idx on public.room_pairs (outfit_b_id);

-- ─── interactions (append-only event log feeding the taste profile) ─────────
create table public.interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  target_type public.interaction_target not null,
  target_id uuid not null,
  action public.interaction_action not null,
  created_at timestamptz not null default now()
);
create index interactions_user_created_idx on public.interactions (user_id, created_at desc);

-- ─── tryons ─────────────────────────────────────────────────────────────────
create table public.tryons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  outfit_id uuid references public.outfits (id) on delete set null,
  product_id uuid not null references public.products (id) on delete cascade,
  input_photo_path text not null,
  result_path text,
  -- sha256(user_id || photo bytes): per-user cache key (see ADR 0005).
  input_hash text not null,
  provider text not null,
  cost_usd numeric(10, 4) not null default 0 check (cost_usd >= 0),
  status public.tryon_status not null default 'queued',
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (input_hash, product_id)
);
create index tryons_user_created_idx on public.tryons (user_id, created_at desc);
create index tryons_created_idx on public.tryons (created_at);

-- ─── venues ─────────────────────────────────────────────────────────────────
create table public.venues (
  id uuid primary key default gen_random_uuid(),
  city text not null,
  name text not null,
  place_id text not null unique,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  category text not null,
  price_level smallint check (price_level between 0 and 4),
  vibe_tags text[] not null default '{}',
  vibe_embedding extensions.halfvec(768),
  archetype_affinity jsonb not null default '{}'::jsonb check (jsonb_typeof(archetype_affinity) = 'object'),
  maps_url text check (maps_url is null or maps_url ~ '^https?://'),
  is_open boolean not null default true,
  refreshed_at timestamptz,
  created_at timestamptz not null default now()
);
create index venues_city_idx on public.venues (city) where is_open;

-- ─── usage_limits ───────────────────────────────────────────────────────────
create table public.usage_limits (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  tryon_count integer not null default 0 check (tryon_count >= 0),
  primary key (user_id, day)
);

-- ─── app_settings (service role only) ───────────────────────────────────────
create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- Cost controls. Human review required to change. Try-on ships disabled.
insert into public.app_settings (key, value) values
  ('tryon_enabled', 'false'::jsonb),
  ('tryon_daily_cap', '3'::jsonb),
  ('tryon_spend_limits', '{"daily_usd": 5, "monthly_usd": 50}'::jsonb);

-- ─── HNSW vector indexes (cosine) ───────────────────────────────────────────
create index products_embedding_hnsw on public.products
  using hnsw (embedding extensions.halfvec_cosine_ops);
create index reference_looks_embedding_hnsw on public.reference_looks
  using hnsw (embedding extensions.halfvec_cosine_ops);
create index archetypes_centroid_hnsw on public.archetypes
  using hnsw (centroid extensions.halfvec_cosine_ops);
create index venues_vibe_embedding_hnsw on public.venues
  using hnsw (vibe_embedding extensions.halfvec_cosine_ops);

-- ─── updated_at triggers ────────────────────────────────────────────────────
create trigger set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.taste_profiles
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.archetypes
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.products
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.wardrobe_items
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.date_rooms
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.tryons
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.app_settings
  for each row execute function private.set_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- Integrity triggers
-- ════════════════════════════════════════════════════════════════════════════

-- Create a profile row for every new auth user.
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(left(new.raw_user_meta_data ->> 'display_name', 60), ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Outfits may only reference the owner's own wardrobe items.
create function private.check_outfit_wardrobe_items()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if cardinality(new.wardrobe_item_ids) > 0 and exists (
    select 1
    from unnest(new.wardrobe_item_ids) as w(id)
    left join public.wardrobe_items wi on wi.id = w.id
    where wi.id is null or wi.user_id <> new.owner_id
  ) then
    raise exception 'outfit references wardrobe items not owned by its owner'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger check_wardrobe_items before insert or update of wardrobe_item_ids, owner_id on public.outfits
  for each row execute function private.check_outfit_wardrobe_items();

-- Room pairs: outfit_a must belong to the seat-A member, outfit_b to seat B.
create function private.check_room_pair_outfits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.date_rooms;
begin
  select * into r from public.date_rooms where id = new.room_id;
  if new.outfit_a_id is not null and not exists (
    select 1 from public.outfits o where o.id = new.outfit_a_id and o.owner_id = r.user_a
  ) then
    raise exception 'outfit_a must belong to user_a' using errcode = '42501';
  end if;
  if new.outfit_b_id is not null and not exists (
    select 1 from public.outfits o where o.id = new.outfit_b_id and o.owner_id = r.user_b
  ) then
    raise exception 'outfit_b must belong to user_b' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger check_outfits before insert or update of outfit_a_id, outfit_b_id, room_id on public.room_pairs
  for each row execute function private.check_room_pair_outfits();

-- Abuse guard on wardrobe size (mirrors MAX_WARDROBE_ITEMS in packages/shared).
create function private.check_wardrobe_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.wardrobe_items where user_id = new.user_id) >= 300 then
    raise exception 'wardrobe limit reached (300 items)' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger check_wardrobe_limit before insert on public.wardrobe_items
  for each row execute function private.check_wardrobe_limit();

-- ════════════════════════════════════════════════════════════════════════════
-- RLS helper functions (SECURITY DEFINER to avoid policy recursion)
-- ════════════════════════════════════════════════════════════════════════════

create function private.is_adult()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.is_adult from public.profiles p where p.id = (select auth.uid())), false);
$$;

create function private.is_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.date_rooms r
    where r.id = p_room_id
      and (select auth.uid()) in (r.user_a, r.user_b)
  );
$$;

-- Everyone the caller currently shares a room with. Cheap pre-filter for partner-visibility policies.
create function private.partner_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case when r.user_a = (select auth.uid()) then r.user_b else r.user_a end
  from public.date_rooms r
  where (select auth.uid()) in (r.user_a, r.user_b)
    and r.user_a is not null and r.user_b is not null;
$$;

-- An outfit is visible to the caller's partner while it sits in a pair of a room they share.
create function private.can_view_outfit(p_outfit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.room_pairs rp
    join public.date_rooms r on r.id = rp.room_id
    where (rp.outfit_a_id = p_outfit_id or rp.outfit_b_id = p_outfit_id)
      and (select auth.uid()) in (r.user_a, r.user_b)
  );
$$;

-- A wardrobe item is visible to a partner only while it is part of an outfit shown in a shared room.
create function private.can_view_wardrobe_item(p_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.wardrobe_items wi
    join public.outfits o on o.owner_id = wi.user_id and wi.id = any (o.wardrobe_item_ids)
    join public.room_pairs rp on o.id in (rp.outfit_a_id, rp.outfit_b_id)
    join public.date_rooms r on r.id = rp.room_id
    where wi.id = p_item_id
      and (select auth.uid()) in (r.user_a, r.user_b)
  );
$$;

create function private.can_view_wardrobe_object(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.wardrobe_items wi
    where wi.image_path = p_object_name
      and private.can_view_wardrobe_item(wi.id)
  );
$$;

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to service_role;
grant execute on function
  private.gen_invite_code(),
  private.partner_ids(),
  private.is_adult(),
  private.is_room_member(uuid),
  private.can_view_outfit(uuid),
  private.can_view_wardrobe_item(uuid),
  private.can_view_wardrobe_object(text)
to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- Row-level security
-- ════════════════════════════════════════════════════════════════════════════

alter table public.profiles enable row level security;
alter table public.taste_profiles enable row level security;
alter table public.archetypes enable row level security;
alter table public.reference_looks enable row level security;
alter table public.products enable row level security;
alter table public.wardrobe_items enable row level security;
alter table public.outfits enable row level security;
alter table public.date_rooms enable row level security;
alter table public.room_pairs enable row level security;
alter table public.interactions enable row level security;
alter table public.tryons enable row level security;
alter table public.venues enable row level security;
alter table public.usage_limits enable row level security;
alter table public.app_settings enable row level security;

-- anon never touches user data; table privileges are the first gate, RLS the second.
revoke all on
  public.profiles, public.taste_profiles, public.wardrobe_items, public.outfits,
  public.date_rooms, public.room_pairs, public.interactions, public.tryons,
  public.usage_limits, public.app_settings
from anon;

-- ─── profiles: own row; only safe columns writable ──────────────────────────
revoke insert, update, delete on public.profiles from authenticated;
grant update (display_name, gender_presentation, height_cm, city, default_budget_inr)
  on public.profiles to authenticated;

create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles: update own" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- ─── taste_profiles: own row ────────────────────────────────────────────────
revoke delete on public.taste_profiles from authenticated;
create policy "taste_profiles: read own" on public.taste_profiles
  for select to authenticated using (user_id = (select auth.uid()));
create policy "taste_profiles: insert own" on public.taste_profiles
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "taste_profiles: update own" on public.taste_profiles
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ─── wardrobe_items: owner full access; partner read while shown in a shared room ──
create policy "wardrobe_items: read own or shared" on public.wardrobe_items
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (user_id in (select private.partner_ids()) and private.can_view_wardrobe_item(id))
  );
create policy "wardrobe_items: insert own" on public.wardrobe_items
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "wardrobe_items: update own" on public.wardrobe_items
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "wardrobe_items: delete own" on public.wardrobe_items
  for delete to authenticated using (user_id = (select auth.uid()));

-- ─── outfits: owner full access; partner read while in a shared room pair ───
create policy "outfits: read own or shared" on public.outfits
  for select to authenticated
  using (
    owner_id = (select auth.uid())
    or (owner_id in (select private.partner_ids()) and private.can_view_outfit(id))
  );
create policy "outfits: insert own" on public.outfits
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "outfits: update own" on public.outfits
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "outfits: delete own" on public.outfits
  for delete to authenticated using (owner_id = (select auth.uid()));

-- ─── date_rooms: members only; join/leave via RPCs ──────────────────────────
revoke update, delete on public.date_rooms from authenticated;
grant update (coordination_mode, occasion, budget_a_inr, budget_b_inr) on public.date_rooms to authenticated;

create policy "date_rooms: members read" on public.date_rooms
  for select to authenticated using ((select auth.uid()) in (user_a, user_b));
create policy "date_rooms: adults create as seat A" on public.date_rooms
  for insert to authenticated
  with check (user_a = (select auth.uid()) and user_b is null and status = 'open' and private.is_adult());
create policy "date_rooms: members update settings" on public.date_rooms
  for update to authenticated
  using ((select auth.uid()) in (user_a, user_b))
  with check ((select auth.uid()) in (user_a, user_b));

-- ─── room_pairs: members read/insert; votes and locks via RPCs ──────────────
revoke update, delete on public.room_pairs from authenticated;
create policy "room_pairs: members read" on public.room_pairs
  for select to authenticated using (private.is_room_member(room_id));
create policy "room_pairs: members insert" on public.room_pairs
  for insert to authenticated with check (private.is_room_member(room_id));

-- ─── interactions: own rows, append-only ────────────────────────────────────
revoke update, delete on public.interactions from authenticated;
create policy "interactions: read own" on public.interactions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "interactions: insert own" on public.interactions
  for insert to authenticated with check (user_id = (select auth.uid()));

-- ─── tryons & usage_limits: read own; written by the worker (service role) / RPC ──
revoke insert, update, delete on public.tryons, public.usage_limits from authenticated;
create policy "tryons: read own" on public.tryons
  for select to authenticated using (user_id = (select auth.uid()));
create policy "usage_limits: read own" on public.usage_limits
  for select to authenticated using (user_id = (select auth.uid()));

-- ─── catalog: public read; writes service role only ─────────────────────────
revoke insert, update, delete on public.products, public.archetypes, public.reference_looks, public.venues
  from anon, authenticated;
create policy "products: public read" on public.products for select to anon, authenticated using (true);
create policy "archetypes: public read" on public.archetypes for select to anon, authenticated using (true);
create policy "reference_looks: public read" on public.reference_looks for select to anon, authenticated using (true);
create policy "venues: public read" on public.venues for select to anon, authenticated using (true);

-- ─── app_settings: service role only (no policies => no access for anon/authenticated) ──
revoke all on public.app_settings from authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPCs (callable by signed-in users through the API's user-scoped client)
-- ════════════════════════════════════════════════════════════════════════════

-- Age gate. Stores only the boolean, never the birth date. One-shot.
create function public.confirm_age(birth_date date)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  adult boolean;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if birth_date > current_date or birth_date < date '1900-01-01' then
    raise exception 'invalid birth date' using errcode = '22023';
  end if;
  if exists (select 1 from public.profiles where id = uid and age_confirmed_at is not null) then
    raise exception 'age already confirmed' using errcode = 'P0001';
  end if;
  adult := birth_date <= (current_date - interval '18 years')::date;
  update public.profiles
     set is_adult = adult, age_confirmed_at = now()
   where id = uid;
  return adult;
end;
$$;

-- Join a room by invite code; fills the free seat. Returns the room id.
create function public.join_room(p_invite_code text, p_budget_inr integer default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  r public.date_rooms;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not private.is_adult() then
    raise exception 'date rooms are for adults only' using errcode = '42501';
  end if;

  select * into r from public.date_rooms
   where invite_code = upper(p_invite_code)
   for update;
  if not found or r.status not in ('open', 'active') then
    raise exception 'invalid or closed invite code' using errcode = 'P0002';
  end if;
  if uid in (r.user_a, r.user_b) then
    return r.id; -- already a member: idempotent
  end if;

  if r.user_b is null then
    update public.date_rooms
       set user_b = uid, budget_b_inr = coalesce(p_budget_inr, budget_b_inr),
           status = case when user_a is not null then 'active'::public.room_status else 'open' end
     where id = r.id;
  elsif r.user_a is null then
    update public.date_rooms
       set user_a = uid, budget_a_inr = coalesce(p_budget_inr, budget_a_inr),
           status = 'active'
     where id = r.id;
  else
    raise exception 'room is full' using errcode = 'P0001';
  end if;
  return r.id;
end;
$$;

-- Leave a room: frees the caller's seat and removes their outfits and votes from every pair.
create function public.leave_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  r public.date_rooms;
begin
  select * into r from public.date_rooms where id = p_room_id for update;
  if not found or not coalesce(uid in (r.user_a, r.user_b), false) then
    raise exception 'not a member of this room' using errcode = '42501';
  end if;

  if uid = r.user_a then
    update public.room_pairs
       set outfit_a_id = null, vote_a = null, is_locked = false
     where room_id = p_room_id;
    update public.date_rooms
       set user_a = null, budget_a_inr = null,
           status = case when user_b is null then 'closed'::public.room_status else 'open' end
     where id = p_room_id;
  else
    update public.room_pairs
       set outfit_b_id = null, vote_b = null, is_locked = false
     where room_id = p_room_id;
    update public.date_rooms
       set user_b = null, budget_b_inr = null,
           status = case when user_a is null then 'closed'::public.room_status else 'open' end
     where id = p_room_id;
  end if;
end;
$$;

-- Partner info for a room: id, display name and seat only.
create function public.room_members(p_room_id uuid)
returns table (user_id uuid, display_name text, seat text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name, s.seat
  from public.date_rooms r
  cross join lateral (values (r.user_a, 'a'), (r.user_b, 'b')) as s(uid, seat)
  join public.profiles p on p.id = s.uid
  where r.id = p_room_id
    and private.is_room_member(p_room_id)
  order by s.seat;
$$;

-- Cast the caller's vote on a pair (only their own seat's column).
create function public.vote_room_pair(p_pair_id uuid, p_vote public.vote)
returns public.room_pairs
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  r public.date_rooms;
  result public.room_pairs;
begin
  select dr.* into r
  from public.room_pairs rp join public.date_rooms dr on dr.id = rp.room_id
  where rp.id = p_pair_id;
  if not found or not coalesce(uid in (r.user_a, r.user_b), false) then
    raise exception 'not a member of this room' using errcode = '42501';
  end if;
  if r.status = 'closed' then
    raise exception 'room is closed' using errcode = 'P0001';
  end if;

  update public.room_pairs
     set vote_a = case when uid = r.user_a then p_vote else vote_a end,
         vote_b = case when uid = r.user_b then p_vote else vote_b end
   where id = p_pair_id
  returning * into result;
  return result;
end;
$$;

-- Lock a pair once both members voted up; unlocks the room's other pairs.
create function public.lock_room_pair(p_pair_id uuid)
returns public.room_pairs
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  rp public.room_pairs;
  r public.date_rooms;
begin
  select * into rp from public.room_pairs where id = p_pair_id for update;
  if not found then
    raise exception 'pair not found' using errcode = 'P0002';
  end if;
  select * into r from public.date_rooms where id = rp.room_id for update;
  if not coalesce(uid in (r.user_a, r.user_b), false) then
    raise exception 'not a member of this room' using errcode = '42501';
  end if;
  if r.user_a is null or r.user_b is null then
    raise exception 'both seats must be filled to lock' using errcode = 'P0001';
  end if;
  if rp.vote_a is distinct from 'up' or rp.vote_b is distinct from 'up' then
    raise exception 'both members must vote up before locking' using errcode = 'P0001';
  end if;

  update public.room_pairs set is_locked = false where room_id = rp.room_id and id <> p_pair_id;
  update public.room_pairs set is_locked = true where id = p_pair_id returning * into rp;
  update public.date_rooms set status = 'locked' where id = rp.room_id;
  return rp;
end;
$$;

-- Atomically reserve one try-on for the caller today (Asia/Kolkata), enforcing the kill switch,
-- the per-user daily cap and the global daily/monthly spend limits. Returns tries left today.
-- The worker refunds (decrements) via the service role if the provider call fails.
create function public.consume_tryon_quota()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  today date := (now() at time zone 'Asia/Kolkata')::date;
  cap integer;
  limits jsonb;
  spent_today numeric;
  spent_month numeric;
  used integer;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not private.is_adult() then
    raise exception 'try-on is for adults only' using errcode = '42501';
  end if;
  if coalesce((select value from public.app_settings where key = 'tryon_enabled'), 'false'::jsonb) <> 'true'::jsonb then
    raise exception 'try-on is disabled' using errcode = 'P0001', hint = 'tryon_disabled';
  end if;

  cap := coalesce((select (value #>> '{}')::integer from public.app_settings where key = 'tryon_daily_cap'), 3);
  limits := coalesce((select value from public.app_settings where key = 'tryon_spend_limits'), '{}'::jsonb);

  select coalesce(sum(cost_usd), 0) into spent_today
    from public.tryons where (created_at at time zone 'Asia/Kolkata')::date = today;
  select coalesce(sum(cost_usd), 0) into spent_month
    from public.tryons where created_at >= date_trunc('month', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
  if (limits ? 'daily_usd' and spent_today >= (limits ->> 'daily_usd')::numeric)
     or (limits ? 'monthly_usd' and spent_month >= (limits ->> 'monthly_usd')::numeric) then
    raise exception 'try-on spend limit reached' using errcode = 'P0001', hint = 'spend_limit';
  end if;

  insert into public.usage_limits as u (user_id, day, tryon_count)
  values (uid, today, 1)
  on conflict (user_id, day) do update
    set tryon_count = u.tryon_count + 1
    where u.tryon_count < cap
  returning u.tryon_count into used;

  if used is null then
    raise exception 'daily try-on limit reached' using errcode = 'P0001', hint = 'daily_cap';
  end if;
  return cap - used;
end;
$$;

-- Nearest in-stock catalog products for a query vector. First building block for the composer.
-- SECURITY INVOKER: products are public-read anyway.
create function public.match_products(
  query_vec extensions.halfvec(768),
  p_slot public.slot,
  p_gender public.product_gender,
  max_price integer default null,
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
language sql
stable
set search_path = ''
-- pgvector >= 0.8: keep scanning the HNSW graph until k rows survive the WHERE filters.
set hnsw.iterative_scan = 'relaxed_order'
as $$
  select m.id, m.source, m.external_id, m.brand, m.title, m.category, m.slot, m.gender, m.colors,
         m.formality, m.occasions, m.price_inr, m.image_url, m.affiliate_url, m.in_stock,
         m.last_seen_at, (1 - m.distance)::real as similarity
  from (
    select p.*, (p.embedding operator(extensions.<=>) query_vec) as distance
    from public.products p
    where p.in_stock
      and p.embedding is not null
      and p.slot = p_slot
      and p.gender in (p_gender, 'unisex')
      and (max_price is null or p.price_inr <= max_price)
    order by p.embedding operator(extensions.<=>) query_vec
    limit least(greatest(k, 1), 200)
  ) m
  order by m.distance;
$$;

-- Nearest pieces from the caller's own (non-archived, embedded) wardrobe.
create function public.match_wardrobe(
  query_vec extensions.halfvec(768),
  p_slot public.slot,
  k integer default 10
)
returns table (id uuid, slot public.slot, category text, title text, colors text[], similarity real)
language sql
stable
set search_path = ''
as $$
  select w.id, w.slot, w.category, w.title, w.colors,
         (1 - (w.embedding operator(extensions.<=>) query_vec))::real as similarity
  from public.wardrobe_items w
  where w.user_id = (select auth.uid())
    and not w.is_archived
    and w.embedding is not null
    and w.slot = p_slot
  order by w.embedding operator(extensions.<=>) query_vec
  limit least(greatest(k, 1), 50);
$$;

revoke all on function
  public.confirm_age(date),
  public.join_room(text, integer),
  public.leave_room(uuid),
  public.room_members(uuid),
  public.vote_room_pair(uuid, public.vote),
  public.lock_room_pair(uuid),
  public.consume_tryon_quota(),
  public.match_products(extensions.halfvec, public.slot, public.product_gender, integer, integer),
  public.match_wardrobe(extensions.halfvec, public.slot, integer)
from public, anon;
grant execute on function
  public.confirm_age(date),
  public.join_room(text, integer),
  public.leave_room(uuid),
  public.room_members(uuid),
  public.vote_room_pair(uuid, public.vote),
  public.lock_room_pair(uuid),
  public.consume_tryon_quota(),
  public.match_products(extensions.halfvec, public.slot, public.product_gender, integer, integer),
  public.match_wardrobe(extensions.halfvec, public.slot, integer)
to authenticated, service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- Storage: private buckets, owner-folder policies ({user_id}/...)
-- ════════════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('user-photos', 'user-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  ('tryon-results', 'tryon-results', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('wardrobe-photos', 'wardrobe-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;

-- user-photos: owner only; uploads require the age gate.
create policy "user-photos: owner read" on storage.objects
  for select to authenticated
  using (bucket_id = 'user-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "user-photos: adult owner upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'user-photos' and (storage.foldername(name))[1] = (select auth.uid())::text and private.is_adult());
create policy "user-photos: owner update" on storage.objects
  for update to authenticated
  using (bucket_id = 'user-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'user-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "user-photos: owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'user-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- tryon-results: owner read/delete; written by the worker (service role).
create policy "tryon-results: owner read" on storage.objects
  for select to authenticated
  using (bucket_id = 'tryon-results' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "tryon-results: owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'tryon-results' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- wardrobe-photos: owner full access (adult upload); partner read while the item is shown in a shared room.
create policy "wardrobe-photos: owner or partner read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'wardrobe-photos'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or private.can_view_wardrobe_object(name))
  );
create policy "wardrobe-photos: adult owner upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'wardrobe-photos' and (storage.foldername(name))[1] = (select auth.uid())::text and private.is_adult());
create policy "wardrobe-photos: owner update" on storage.objects
  for update to authenticated
  using (bucket_id = 'wardrobe-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'wardrobe-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "wardrobe-photos: owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'wardrobe-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
