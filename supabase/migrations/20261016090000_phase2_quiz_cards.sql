-- ════════════════════════════════════════════════════════════════════════════
-- Phase 2 / Step 0 — quiz cards + product tagging columns + catalog helper
-- Human review required before merge (new table ⇒ RLS + pgTAP in the same PR).
-- Never edit this file after it has been applied anywhere: add a new migration.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── products: tagging + embedding bookkeeping ──────────────────────────────
-- tags_version: PRODUCT_TAGS_VERSION the offline LLM tagger last wrote (0 = never tagged).
-- embedded_at:  when the offline batch embedder last wrote `embedding` (NULL = not embedded).
alter table public.products
  add column tags_version smallint not null default 0 check (tags_version >= 0),
  add column embedded_at timestamptz;

comment on column public.products.tags_version is
  'PRODUCT_TAGS_VERSION the offline LLM tagger last wrote; 0 = never tagged. See ADR 0001/0002.';
comment on column public.products.embedded_at is
  'When the offline batch embedder last wrote `embedding`. NULL = not embedded yet.';

-- Gender-first feed query support (the v1 index is slot-first; the feed filters gender first).
create index products_gender_slot_price_idx
  on public.products (gender, slot, price_inr) where in_stock;

-- ─── quiz_cards ─────────────────────────────────────────────────────────────
-- A swipe card = a mini outfit (2–4 catalog items) that stands in for an archetype during
-- onboarding. Built offline; the live quiz only reads them. `embedding` is intentionally
-- omitted: swipes are turned into a taste vector from each item's product embedding.
create table public.quiz_cards (
  id uuid primary key default gen_random_uuid(),
  archetype_id uuid not null references public.archetypes (id) on delete cascade,
  gender public.product_gender not null,
  item_ids uuid[] not null default '{}',
  image_urls text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quiz_cards_has_items check (cardinality(item_ids) between 1 and 4),
  constraint quiz_cards_has_images check (cardinality(image_urls) between 1 and 4)
);
create index quiz_cards_archetype_id_idx on public.quiz_cards (archetype_id);
create index quiz_cards_gender_idx on public.quiz_cards (gender) where active;

create trigger set_updated_at before update on public.quiz_cards
  for each row execute function private.set_updated_at();

-- ─── catalog helper: closest in-stock products to an archetype centroid ─────
-- Used by the offline quiz-card generator and the catalog quality report.
-- SECURITY INVOKER: products and archetypes are public-read anyway.
create function public.archetype_slot_products(
  p_archetype_id uuid,
  p_slot public.slot,
  p_gender public.product_gender,
  k integer default 10
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
    select p.*, (p.embedding operator(extensions.<=>) a.centroid) as distance
    from public.products p
    join public.archetypes a on a.id = p_archetype_id
    where a.centroid is not null
      and p.in_stock
      and p.embedding is not null
      and p.slot = p_slot
      and p.gender in (p_gender, 'unisex')
    order by p.embedding operator(extensions.<=>) a.centroid
    limit least(greatest(k, 1), 200)
  ) m
  order by m.distance;
$$;

-- ─── Row-level security: catalog table, public read, service-role write ─────
alter table public.quiz_cards enable row level security;

revoke insert, update, delete on public.quiz_cards from anon, authenticated;
create policy "quiz_cards: public read" on public.quiz_cards
  for select to anon, authenticated using (true);

revoke all on function public.archetype_slot_products(uuid, public.slot, public.product_gender, integer)
  from public, anon;
grant execute on function public.archetype_slot_products(uuid, public.slot, public.product_gender, integer)
  to authenticated, service_role;
