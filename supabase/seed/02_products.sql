-- ⚠ TEST DATA ONLY. Fake products for local dev and tests: brand 'Test Brand', titles prefixed
-- '[TEST]', external_id 'TEST-…', placeholder images and example.com links. Embeddings are null
-- until the embedder runs. Never load this file into production.
insert into public.products
  (source, external_id, brand, title, category, slot, gender, colors, formality, occasions, price_inr, image_url, affiliate_url, in_stock, last_seen_at)
select 'other'::public.product_source, 'TEST-' || lpad(n::text, 3, '0'), 'Test Brand', '[TEST] ' || title, category,
       slot::public.slot, gender::public.product_gender, colors, formality, occasions, price_inr,
       'https://placehold.co/600x800/png?text=TEST-' || lpad(n::text, 3, '0'),
       'https://example.com/test-product/' || lpad(n::text, 3, '0'),
       in_stock, now()
from (values
  -- tops
  ( 1, 'White linen shirt',            'shirt',     'top',       'men',    array['white'],          3, array['brunch','dinner','rooftop'],  1899, true),
  ( 2, 'Navy knit polo',               'polo',      'top',       'men',    array['navy'],           3, array['dinner','gallery'],           2499, true),
  ( 3, 'Black graphic oversized tee',  'tshirt',    'top',       'men',    array['black'],          1, array['movie','brunch'],              999, true),
  ( 4, 'Ivory satin camisole',         'camisole',  'top',       'women',  array['ivory'],          3, array['dinner','rooftop'],           1599, true),
  ( 5, 'Floral puff-sleeve blouse',    'blouse',    'top',       'women',  array['pink','green'],   2, array['brunch','gallery'],           1799, true),
  ( 6, 'Ribbed baby tee',              'tshirt',    'top',       'women',  array['lilac'],          1, array['movie','brunch'],              699, true),
  ( 7, 'Grey crewneck sweatshirt',     'sweatshirt','top',       'unisex', array['grey'],           1, array['movie'],                      1499, true),
  -- bottoms
  ( 8, 'Beige pleated chinos',         'chinos',    'bottom',    'men',    array['beige'],          3, array['dinner','gallery','brunch'],  2199, true),
  ( 9, 'Black slim jeans',             'jeans',     'bottom',    'men',    array['black'],          2, array['movie','rooftop'],            1999, true),
  (10, 'Olive cargo trousers',         'cargo',     'bottom',    'men',    array['olive'],          1, array['movie','brunch'],             1799, true),
  (11, 'High-rise wide-leg jeans',     'jeans',     'bottom',    'women',  array['blue'],           2, array['brunch','movie'],             2299, true),
  (12, 'Black satin midi skirt',       'skirt',     'bottom',    'women',  array['black'],          4, array['dinner','rooftop'],           1999, true),
  (13, 'Cream linen trousers',         'trousers',  'bottom',    'women',  array['cream'],          3, array['brunch','gallery'],           2099, true),
  -- full (dresses, sets)
  (14, 'Emerald slip dress',           'dress',     'full',      'women',  array['green'],          4, array['dinner','rooftop'],           3299, true),
  (15, 'Block-print cotton kurta set', 'kurta-set', 'full',      'women',  array['indigo','white'], 3, array['brunch','festive'],           2799, true),
  (16, 'Maroon embroidered kurta set', 'kurta-set', 'full',      'men',    array['maroon','gold'],  5, array['festive'],                    4999, true),
  (17, 'Pastel organza saree',         'saree',     'full',      'women',  array['peach'],          5, array['festive'],                    6499, true),
  (18, 'Denim jumpsuit',               'jumpsuit',  'full',      'women',  array['blue'],           2, array['brunch','gallery'],           2899, false),
  -- footwear
  (19, 'White leather sneakers',       'sneakers',  'footwear',  'unisex', array['white'],          2, array['brunch','movie','gallery'],   2999, true),
  (20, 'Tan suede loafers',            'loafers',   'footwear',  'men',    array['tan'],            4, array['dinner','gallery'],           3499, true),
  (21, 'Black chelsea boots',          'boots',     'footwear',  'men',    array['black'],          3, array['rooftop','dinner'],           3999, true),
  (22, 'Nude block heels',             'heels',     'footwear',  'women',  array['beige'],          4, array['dinner','rooftop'],           2499, true),
  (23, 'Embellished juttis',           'juttis',    'footwear',  'women',  array['gold'],           4, array['festive'],                    1499, true),
  -- layers
  (24, 'Unstructured navy blazer',     'blazer',    'layer',     'men',    array['navy'],           4, array['dinner','gallery'],           4499, true),
  (25, 'Black faux-leather jacket',    'jacket',    'layer',     'unisex', array['black'],          3, array['rooftop','movie'],            3999, true),
  (26, 'Camel cardigan',               'cardigan',  'layer',     'women',  array['camel'],          3, array['brunch','gallery'],           2199, true),
  (27, 'Ivory nehru jacket',           'nehru',     'layer',     'men',    array['ivory'],          5, array['festive','dinner'],           3299, true),
  -- accessories
  (28, 'Silver chain necklace',        'necklace',  'accessory', 'unisex', array['silver'],         3, array['dinner','rooftop'],            799, true),
  (29, 'Woven straw tote',             'bag',       'accessory', 'women',  array['sand'],           2, array['brunch'],                     1299, true),
  (30, 'Brown leather belt',           'belt',      'accessory', 'men',    array['brown'],          3, array['dinner','gallery','brunch'],   999, true)
) as t(n, title, category, slot, gender, colors, formality, occasions, price_inr, in_stock)
on conflict (source, external_id) do nothing;
