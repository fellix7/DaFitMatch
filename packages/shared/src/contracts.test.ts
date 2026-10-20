import { describe, expect, it } from 'vitest';
import {
  COLOR_VOCAB,
  ComposeOutfitsRequest,
  DEFAULT_BUDGET_SPLIT,
  DateRoom,
  EMBEDDING_DIM,
  FEED_PAGE_SIZE,
  FeedProductRow,
  Id,
  InviteCode,
  ListFeedProductsQuery,
  ListVenuesQuery,
  OCCASIONS,
  Occasion,
  Product,
  ProductTags,
  QUIZ_CARD_COUNT,
  QuizHardRules,
  QuizSubmission,
  SEPARATES_SLOTS,
  TryOnRequest,
  CreateWardrobeItemRequest,
  UpdateWardrobeItemRequest,
  WardrobeImagePath,
  StyleQuizAnswers,
  archetypeWeightsFromPicks,
  comfortFromSlider,
  endpoints,
} from './index';

const uid = '11111111-1111-1111-1111-111111111111';

describe('constants', () => {
  it('embedding dim matches Marqo-FashionSigLIP', () => {
    expect(EMBEDDING_DIM).toBe(768);
  });

  it('occasion list matches the Occasion enum', () => {
    expect([...OCCASIONS].sort()).toEqual([...Occasion.options].sort());
  });

  it('separates budget split sums to 1 and full = top + bottom', () => {
    const sum = SEPARATES_SLOTS.reduce((acc, s) => acc + DEFAULT_BUDGET_SPLIT[s], 0);
    expect(sum).toBeCloseTo(1, 10);
    expect(DEFAULT_BUDGET_SPLIT.full).toBeCloseTo(
      DEFAULT_BUDGET_SPLIT.top + DEFAULT_BUDGET_SPLIT.bottom,
      10,
    );
  });
});

describe('schemas', () => {
  it('accepts seed-style ids and Postgres timestamps', () => {
    expect(Id.safeParse('00000000-0000-0000-0000-000000000001').success).toBe(true);
    const room = DateRoom.parse({
      id: uid,
      user_a: uid,
      user_b: null,
      invite_code: 'AB12CD34',
      coordination_mode: 'complementary',
      occasion: 'rooftop',
      budget_a_inr: 6000,
      budget_b_inr: null,
      status: 'open',
      created_at: '2026-10-15T10:00:00.123456+00:00',
      updated_at: '2026-10-15T10:00:00+00:00',
    });
    expect(room.status).toBe('open');
  });

  it('rejects malformed invite codes', () => {
    expect(InviteCode.safeParse('ab12cd34').success).toBe(false);
    expect(InviteCode.safeParse('AB12CD3').success).toBe(false);
  });

  it('product formality is bounded 1..5 and colours are normalised', () => {
    const base = {
      id: uid,
      source: 'myntra',
      external_id: 'x1',
      brand: 'Test',
      title: 'Test tee',
      category: 'tshirt',
      slot: 'top',
      gender: 'unisex',
      colors: ['  Navy '],
      formality: 2,
      occasions: ['brunch'],
      price_inr: 999,
      image_url: 'https://example.com/a.jpg',
      affiliate_url: 'https://example.com/a',
      in_stock: true,
      last_seen_at: null,
    };
    expect(Product.parse(base).colors).toEqual(['navy']);
    expect(Product.safeParse({ ...base, formality: 6 }).success).toBe(false);
    expect(Product.safeParse({ ...base, image_url: 'javascript:alert(1)' }).success).toBe(false);
  });

  it('compose request applies defaults', () => {
    const req = ComposeOutfitsRequest.parse({
      occasion: 'dinner',
      budget_inr: 5000,
      gender: 'men',
    });
    expect(req.count).toBe(3);
  });

  it('try-on photo path must be namespaced by a user id', () => {
    expect(TryOnRequest.safeParse({ product_id: uid, photo_path: `${uid}/me.jpg` }).success).toBe(
      true,
    );
    expect(TryOnRequest.safeParse({ product_id: uid, photo_path: '../etc/passwd' }).success).toBe(
      false,
    );
  });

  it('venue query coerces string numbers from the URL', () => {
    expect(ListVenuesQuery.parse({ limit: '7' }).limit).toBe(7);
  });

  it('every endpoint path is unique per method', () => {
    const keys = Object.values(endpoints).map((e) => `${e.method} ${e.path}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('wardrobe', () => {
  it('create request applies defaults; update request does not', () => {
    const created = CreateWardrobeItemRequest.parse({ slot: 'top', category: 'shirt' });
    expect(created.colors).toEqual([]);
    const patch = UpdateWardrobeItemRequest.parse({ title: 'White linen shirt' });
    expect(patch).toEqual({ title: 'White linen shirt' });
  });

  it('compose defaults to mixing in the wardrobe', () => {
    const req = ComposeOutfitsRequest.parse({
      occasion: 'brunch',
      budget_inr: 3000,
      gender: 'women',
    });
    expect(req.wardrobe_mode).toBe('mix');
  });

  it('wardrobe image path is a single file under a user id folder', () => {
    expect(WardrobeImagePath.safeParse(`${uid}/shirt.jpg`).success).toBe(true);
    expect(WardrobeImagePath.safeParse(`${uid}/a/b.jpg`).success).toBe(false);
  });
});

describe('style quiz', () => {
  const answers = {
    gender_presentation: 'feminine',
    shop_gender: 'women',
    occasion: 'rooftop',
    budget_inr: 6000,
    archetypes: ['soft-romantic', 'minimal'],
    colors_like: ['Ivory'],
    colors_avoid: [],
    never_wear: ['crop tops'],
    comfort_vs_statement: 3,
    fit_prefs: { bottom: 'wide' },
    wardrobe_mode: 'mix',
  };

  it('accepts a complete guest answer set', () => {
    expect(StyleQuizAnswers.parse(answers).colors_like).toEqual(['ivory']);
  });

  it('requires 1–3 archetypes', () => {
    expect(StyleQuizAnswers.safeParse({ ...answers, archetypes: [] }).success).toBe(false);
    expect(
      StyleQuizAnswers.safeParse({ ...answers, archetypes: ['a', 'b', 'c', 'd'] }).success,
    ).toBe(false);
  });

  it('weights archetype picks by order and normalises them', () => {
    expect(archetypeWeightsFromPicks(['a'])).toEqual({ a: 1 });
    expect(archetypeWeightsFromPicks(['a', 'b'])).toEqual({ a: 0.667, b: 0.333 });
    const w = archetypeWeightsFromPicks(['a', 'b', 'c']);
    expect(w.a! > w.b! && w.b! > w.c!).toBe(true);
  });
});

describe('phase 2 — onboarding quiz contracts', () => {
  const base = {
    catalog: 'both',
    city: 'Delhi NCR',
    budget_band: '2000-5000',
  };
  const swipe = { card_id: uid, action: 'like' };
  const submission = {
    basics: base,
    swipes: Array.from({ length: QUIZ_CARD_COUNT }, () => swipe),
    hard_rules: {
      colors_like: ['navy'],
      colors_avoid: [],
      never_wear: ['heels'],
      comfort_vs_statement: 60,
    },
  };

  it('accepts a full submission and defaults city', () => {
    const parsed = QuizSubmission.parse(submission);
    expect(parsed.swipes).toHaveLength(QUIZ_CARD_COUNT);
    expect(
      QuizSubmission.parse({
        ...submission,
        basics: { catalog: 'both', budget_band: 'under-2000' },
      }).basics.city,
    ).toBe('Delhi NCR');
  });

  it('requires exactly QUIZ_CARD_COUNT swipes', () => {
    expect(
      QuizSubmission.safeParse({ ...submission, swipes: submission.swipes.slice(0, 1) }).success,
    ).toBe(false);
    expect(
      QuizSubmission.safeParse({ ...submission, swipes: [...submission.swipes, swipe] }).success,
    ).toBe(false);
  });

  it('restricts hard-rule colours to the fixed vocabulary', () => {
    expect(QuizHardRules.safeParse(submission.hard_rules).success).toBe(true);
    expect(
      QuizHardRules.safeParse({ ...submission.hard_rules, colors_like: ['chartreuse'] }).success,
    ).toBe(false);
    expect(COLOR_VOCAB).toContain('navy');
  });

  it('maps the 0-100 comfort slider onto the 1-5 profile scale', () => {
    expect(comfortFromSlider(0)).toBe(1);
    expect(comfortFromSlider(50)).toBe(3);
    expect(comfortFromSlider(100)).toBe(5);
    expect(comfortFromSlider(-10)).toBe(1);
    expect(comfortFromSlider(999)).toBe(5);
  });
});

describe('phase 2 — catalog tagging contracts', () => {
  it('restricts tagged colours to COLOR_VOCAB and occasions to the enum', () => {
    const tags = {
      slot: 'top',
      formality: 3,
      colors: ['navy'],
      occasions: ['dinner'],
    };
    expect(ProductTags.parse(tags).colors).toEqual(['navy']);
    expect(ProductTags.safeParse({ ...tags, colors: ['Navy'] }).success).toBe(false);
    expect(ProductTags.safeParse({ ...tags, colors: ['chartreuse'] }).success).toBe(false);
    expect(ProductTags.safeParse({ ...tags, formality: 9 }).success).toBe(false);
  });
});

describe('phase 2 — feed contracts', () => {
  it('parses a normalised feed row and rejects unsafe urls', () => {
    const row = {
      source: 'myntra',
      external_id: 'sku-1',
      brand: 'Roadster',
      title: 'Slim chinos',
      category_raw: 'Casual Trousers',
      gender: 'men',
      price_inr: 1499,
      image_url: 'https://cdn.example.com/a.jpg',
      affiliate_url: 'https://example.com/p/sku-1',
      in_stock: true,
    };
    expect(FeedProductRow.parse(row).external_id).toBe('sku-1');
    expect(FeedProductRow.safeParse({ ...row, affiliate_url: 'ftp://example.com' }).success).toBe(
      false,
    );
  });

  it('applies the default feed page size and validates the cursor format', () => {
    expect(ListFeedProductsQuery.parse({}).limit).toBe(FEED_PAGE_SIZE);
    expect(ListFeedProductsQuery.safeParse({ limit: '10', cursor: `0.71|${uid}` }).success).toBe(
      true,
    );
    expect(ListFeedProductsQuery.safeParse({ cursor: 'not-a-cursor' }).success).toBe(false);
    expect(ListFeedProductsQuery.safeParse({ limit: '9999' }).success).toBe(false);
  });
});
