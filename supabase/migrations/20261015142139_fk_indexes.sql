-- Covering indexes for foreign keys flagged by the Supabase performance advisor
-- (speeds up joins and ON DELETE cascades / set-null on the referenced tables).
create index if not exists outfits_archetype_id_idx on public.outfits (archetype_id);
create index if not exists tryons_outfit_id_idx on public.tryons (outfit_id);
create index if not exists tryons_product_id_idx on public.tryons (product_id);
