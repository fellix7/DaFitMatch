import type { Slot } from '@dafitmatch/shared';

/**
 * One rule of the category → slot table. The first rule whose keyword appears in the
 * (normalised) category or title wins, so the list is ordered from most to least specific.
 */
export interface SlotRule {
  readonly slot: Slot;
  readonly keywords: readonly string[];
}

/**
 * The category → slot rules table.
 *
 * Feed categories are vendor-specific ("Men's Casual Wear > T-Shirts", "Kurta Sets", ...), so we
 * match on keywords rather than on an exact list. Unknown categories are skipped and logged by
 * the ingest job (never guessed) - a wrong slot is worse than a missing product.
 */
export const SLOT_RULES: readonly SlotRule[] = [
  // ── tops (before the generic "shirt"/"top" rules so "dress shirt" stays a top) ──
  {
    slot: 'top',
    keywords: [
      'dress shirt',
      'formal shirt',
      'casual shirt',
      't shirt',
      'tshirt',
      'graphic tee',
      'polo shirt',
      'polo tshirt',
      'button down',
      'button-down',
      'turtleneck',
      'bodysuit',
      'blouse',
      'camisole',
      'tank top',
      'crop top',
      'henley',
      'shirt',
      'shirts',
      'blouse top',
      'top',
      'tops',
      'tee',
    ],
  },
  // ── one-piece outfits ──
  {
    slot: 'full',
    keywords: [
      'shirt dress',
      'kurta set',
      'co ord set',
      'coord set',
      'co-ord set',
      'salwar kameez',
      'anarkali',
      'bandhgala',
      'sherwani',
      'ghagra',
      'lehenga',
      'saree',
      'jumpsuit',
      'playsuit',
      'one piece',
      'dress',
      'gown',
      'kurti',
      'kurtas',
    ],
  },
  // ── footwear ──
  {
    slot: 'footwear',
    keywords: [
      'sneaker',
      'sneakers',
      'sports shoe',
      'running shoe',
      'ankle boot',
      'chelsea boot',
      'brogue',
      'derby',
      'court shoe',
      'kitten heel',
      'platform shoe',
      'espadrille',
      'loafer',
      'oxford',
      'mule',
      'sandal',
      'heel',
      'boot',
      'boots',
      'jutti',
      'juttis',
      'shoe',
      'shoes',
      'footwear',
      'slipper',
      'flip flop',
      'flipflop',
      'clog',
    ],
  },
  // ── accessories ──
  {
    slot: 'accessory',
    keywords: [
      'sunglass',
      'eyewear',
      'necklace',
      'earring',
      'bracelet',
      'anklet',
      'watch',
      'wallet',
      'handbag',
      'backpack',
      'tote',
      'clutch',
      'crossbody',
      'sling bag',
      'scarf',
      'beanie',
      'headband',
      'hairband',
      'muffler',
      'goggles',
      'belt',
      'belts',
      'tie',
      'pocket square',
      'hat',
      'cap',
      'socks',
    ],
  },
  // ── layers ──
  {
    slot: 'layer',
    keywords: [
      'nehru jacket',
      'bomber jacket',
      'denim jacket',
      'leather jacket',
      'overshirt',
      'shirt jacket',
      'blazer',
      'coat',
      'jacket',
      'jackets',
      'cardigan',
      'hoodie',
      'sweatshirt',
      'sweater',
      'jumper',
      'turtleneck sweater',
      'shrug',
      'parka',
      'windbreaker',
      'waistcoat',
      'vest',
    ],
  },
  // ── bottoms ──
  {
    slot: 'bottom',
    keywords: [
      'track pant',
      'trackpant',
      'jogger',
      'legging',
      'palazzo',
      'flare pant',
      'flare trousers',
      'cargo pant',
      'cargo',
      'chino',
      'trouser',
      'trousers',
      'pant',
      'pants',
      'jean',
      'jeans',
      'denim',
      'skirt',
      'skirts',
      'short',
      'shorts',
      'pyjama',
      'pyjama set',
      'salwar',
      'churidar',
      'dhoti',
    ],
  },
];

/** Lowercase, strip punctuation and collapse whitespace so keywords match reliably. */
export function normalizeText(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Whole-word/phrase match: "tee" must not match "steering". The last word of a phrase may be
 * plural ("kurta set" matches "kurta sets").
 */
export function containsPhrase(text: string, phrase: string): boolean {
  const words = phrase.split(' ').map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = words
    .map((word, index) => {
      const isLast = index === words.length - 1;
      return isLast && word.length > 2 ? `${word}(?:es|s)?` : word;
    })
    .join('\\s+');
  return new RegExp(`(^|\\s)${pattern}(\\s|$)`).test(text);
}

/**
 * Maps a vendor category (and the product title, which often carries the missing detail) to a
 * slot. Returns null when nothing matches - the caller skips the row and logs it.
 */
export function mapCategoryToSlot(categoryRaw: string, title = ''): Slot | null {
  const category = normalizeText(categoryRaw);
  const titleText = normalizeText(title);
  for (const rule of SLOT_RULES) {
    for (const keyword of rule.keywords) {
      if (containsPhrase(category, keyword)) return rule.slot;
    }
  }
  // The title is a weaker signal than the category: only use it for unambiguous garment words.
  for (const rule of SLOT_RULES) {
    for (const keyword of rule.keywords) {
      if (keyword.includes(' ') && containsPhrase(titleText, keyword)) return rule.slot;
    }
  }
  return null;
}
