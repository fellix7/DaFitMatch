import { CATALOG_SLOT_SHARE, PRODUCT_TAGS_VERSION, type Slot } from '@dafitmatch/shared';

/** The catalog is "ready" when every gender has this many embedded + tagged products. */
export const CATALOG_TARGET_PER_GENDER = 5000;

export interface CatalogRow {
  id: string;
  source: string;
  external_id: string;
  brand: string;
  title: string;
  slot: Slot;
  gender: string;
  price_inr: number;
  in_stock: boolean;
  has_embedding: boolean;
  tags_version: number;
}

export interface SlotMixRow {
  slot: Slot;
  count: number;
  targetShare: number;
  actualShare: number;
}

export interface PriceRow {
  slot: Slot;
  count: number;
  min: number;
  median: number;
  max: number;
}

export interface CatalogReport {
  products: number;
  embedded: number;
  tagged: number;
  ready: number;
  inStock: number;
  byGender: Record<string, number>;
  bySlot: Record<string, number>;
  slotMix: SlotMixRow[];
  prices: PriceRow[];
  duplicates: { title: string; count: number }[];
  gaps: string[];
  exitCriteriaMet: boolean;
}

/** Builds the catalog health report from a flat list of products. */
export function buildCatalogReport(rows: CatalogRow[]): CatalogReport {
  const byGender: Record<string, number> = {};
  const bySlot: Record<string, number> = {};
  const titles = new Map<string, number>();
  let embedded = 0;
  let tagged = 0;
  let ready = 0;
  let inStock = 0;

  for (const row of rows) {
    byGender[row.gender] = (byGender[row.gender] ?? 0) + 1;
    bySlot[row.slot] = (bySlot[row.slot] ?? 0) + 1;
    if (row.has_embedding) embedded += 1;
    if (row.tags_version >= PRODUCT_TAGS_VERSION) tagged += 1;
    if (row.has_embedding && row.tags_version >= PRODUCT_TAGS_VERSION) ready += 1;
    if (row.in_stock) inStock += 1;
    const key = `${row.brand}|${row.title}`.toLowerCase();
    titles.set(key, (titles.get(key) ?? 0) + 1);
  }

  const total = rows.length || 1;
  const slotMix: SlotMixRow[] = (
    Object.keys(CATALOG_SLOT_SHARE) as (keyof typeof CATALOG_SLOT_SHARE)[]
  )
    .map((slot) => ({
      slot: slot as Slot,
      count: bySlot[slot] ?? 0,
      targetShare: CATALOG_SLOT_SHARE[slot],
      actualShare: (bySlot[slot] ?? 0) / total,
    }))
    .sort((a, b) => b.count - a.count);

  const prices: PriceRow[] = (Object.keys(bySlot) as Slot[])
    .map((slot) => {
      const values = rows
        .filter((row) => row.slot === slot)
        .map((row) => row.price_inr)
        .sort((a, b) => a - b);
      if (values.length === 0) {
        return { slot, count: 0, min: 0, median: 0, max: 0 };
      }
      const middle = Math.floor(values.length / 2);
      const median =
        values.length % 2 === 0
          ? Math.round((values[middle - 1]! + values[middle]!) / 2)
          : values[middle]!;
      return {
        slot,
        count: values.length,
        min: values[0]!,
        median,
        max: values[values.length - 1]!,
      };
    })
    .sort((a, b) => b.count - a.count);

  const duplicates = [...titles.entries()]
    .filter(([, count]) => count > 1)
    .map(([title, count]) => ({ title, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  const gaps: string[] = [];
  for (const [gender, count] of Object.entries(byGender)) {
    if (count < CATALOG_TARGET_PER_GENDER) {
      gaps.push(`${gender}: ${count} products (need ${CATALOG_TARGET_PER_GENDER})`);
    }
  }
  for (const mix of slotMix) {
    if (mix.count === 0) gaps.push(`slot ${mix.slot}: empty`);
  }
  const withoutEmbedding = rows.length - embedded;
  if (withoutEmbedding > 0) gaps.push(`${withoutEmbedding} product(s) without an embedding`);

  return {
    products: rows.length,
    embedded,
    tagged,
    ready,
    inStock,
    byGender,
    bySlot,
    slotMix,
    prices,
    duplicates,
    gaps,
    exitCriteriaMet: gaps.length === 0,
  };
}

/** Renders the report as plain text (no dependencies). */
export function formatCatalogReport(report: CatalogReport): string {
  const lines: string[] = [];
  lines.push('DaFitMatch catalog report');
  lines.push('========================');
  lines.push(
    `products: ${report.products} | embedded: ${report.embedded} | tagged: ${report.tagged} | ` +
      `ready: ${report.ready} | in stock: ${report.inStock}`,
  );
  lines.push('');
  lines.push('by gender:');
  for (const [gender, count] of Object.entries(report.byGender)) {
    lines.push(`  ${gender.padEnd(8)} ${count}`);
  }
  lines.push('');
  lines.push('slot mix (target -> actual):');
  for (const mix of report.slotMix) {
    lines.push(
      `  ${mix.slot.padEnd(10)} ${String(mix.count).padStart(6)}  ` +
        `${(mix.targetShare * 100).toFixed(0)}% -> ${(mix.actualShare * 100).toFixed(0)}%`,
    );
  }
  lines.push('');
  lines.push('price (INR):');
  for (const price of report.prices) {
    lines.push(
      `  ${price.slot.padEnd(10)} n=${String(price.count).padStart(6)}  ` +
        `min ${price.min} | median ${price.median} | max ${price.max}`,
    );
  }
  if (report.duplicates.length > 0) {
    lines.push('');
    lines.push('duplicate titles:');
    for (const duplicate of report.duplicates) {
      lines.push(`  x${duplicate.count} ${duplicate.title}`);
    }
  }
  lines.push('');
  if (report.gaps.length === 0) {
    lines.push('exit criteria: MET');
  } else {
    lines.push('exit criteria: NOT met');
    for (const gap of report.gaps) lines.push(`  - ${gap}`);
  }
  return lines.join('\n');
}
