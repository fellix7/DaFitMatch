import type { GenderPresentation, Occasion, ProductGender, WardrobeMode } from '@dafitmatch/shared';

export const GENDER_PRESENTATION: { value: GenderPresentation; label: string }[] = [
  { value: 'feminine', label: 'Feminine' },
  { value: 'masculine', label: 'Masculine' },
  { value: 'androgynous', label: 'Androgynous / mixed' },
];

export const SHOP_GENDER: { value: ProductGender; label: string }[] = [
  { value: 'women', label: "Women's" },
  { value: 'men', label: "Men's" },
  { value: 'unisex', label: 'Unisex' },
];

export const OCCASIONS: { value: Occasion; label: string; hint: string }[] = [
  { value: 'brunch', label: 'Brunch', hint: 'Daytime, relaxed, café' },
  { value: 'dinner', label: 'Dinner', hint: 'Restaurant, dressier' },
  { value: 'gallery', label: 'Gallery', hint: 'Arty, a little curated' },
  { value: 'rooftop', label: 'Rooftop', hint: 'Evening drinks, city views' },
  { value: 'movie', label: 'Movie', hint: 'Casual and comfy' },
  { value: 'festive', label: 'Festive', hint: 'Weddings, Diwali, celebrations' },
];

export const BUDGET_PRESETS = [2000, 4000, 6000, 10000, 15000];

export const COLORS: { name: string; hex: string }[] = [
  { name: 'black', hex: '#111111' },
  { name: 'white', hex: '#ffffff' },
  { name: 'ivory', hex: '#f6f0e1' },
  { name: 'beige', hex: '#d9c7a7' },
  { name: 'camel', hex: '#b58a57' },
  { name: 'brown', hex: '#6b4423' },
  { name: 'grey', hex: '#8a8a8a' },
  { name: 'navy', hex: '#1d2a4d' },
  { name: 'blue', hex: '#2f6fd6' },
  { name: 'sky blue', hex: '#8cc5ec' },
  { name: 'green', hex: '#2f8a4c' },
  { name: 'olive', hex: '#6b6b2e' },
  { name: 'emerald', hex: '#0f6b4f' },
  { name: 'red', hex: '#c92a2a' },
  { name: 'maroon', hex: '#6d1b2b' },
  { name: 'pink', hex: '#f2a0b8' },
  { name: 'lilac', hex: '#c8a8e0' },
  { name: 'yellow', hex: '#f2d14b' },
  { name: 'mustard', hex: '#c99a1e' },
  { name: 'orange', hex: '#ec7a2c' },
  { name: 'rust', hex: '#a8471f' },
  { name: 'gold', hex: '#c9a54a' },
  { name: 'silver', hex: '#c0c4c8' },
  { name: 'neon', hex: '#b6ff2e' },
];

export const NEVER_WEAR = [
  'crop tops',
  'shorts',
  'mini skirts',
  'sleeveless',
  'bodycon',
  'heels',
  'sneakers',
  'graphic tees',
  'ripped jeans',
  'sheer fabrics',
  'loud prints',
  'florals',
];

export const COMFORT_LABELS: Record<number, string> = {
  1: 'Comfort first',
  2: 'Mostly comfy',
  3: 'Balanced',
  4: 'Dressed up',
  5: 'Turn heads',
};

export const TOP_FITS = ['slim', 'regular', 'relaxed', 'oversized'] as const;
export const BOTTOM_FITS = ['skinny', 'slim', 'straight', 'relaxed', 'wide'] as const;

export const WARDROBE_MODES: { value: WardrobeMode; label: string; hint: string }[] = [
  { value: 'mix', label: 'Mix it in', hint: 'Reuse pieces I own, buy what is missing' },
  { value: 'off', label: 'All new', hint: 'Only show pieces I can buy' },
  { value: 'only', label: 'Only my wardrobe', hint: 'Style me from what I already have' },
];
