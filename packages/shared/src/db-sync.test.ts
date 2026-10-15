import { describe, expect, expectTypeOf, it } from 'vitest';
import { Constants, type Tables } from './db.types';
import {
  CoordinationMode,
  GenderPresentation,
  InteractionAction,
  InteractionTarget,
  Occasion,
  ProductGender,
  ProductSource,
  RoomStatus,
  Slot,
  TryOnStatus,
  Vote,
} from './enums';
import type { DateRoom, Outfit, Product, Profile, RoomPair } from './index';

// Fails when a migration changes an enum without the matching zod change (or vice versa).
describe('zod enums mirror Postgres enums', () => {
  const pairs = {
    coordination_mode: CoordinationMode,
    gender_presentation: GenderPresentation,
    interaction_action: InteractionAction,
    interaction_target: InteractionTarget,
    occasion: Occasion,
    product_gender: ProductGender,
    product_source: ProductSource,
    room_status: RoomStatus,
    slot: Slot,
    tryon_status: TryOnStatus,
    vote: Vote,
  } as const;

  it('covers every DB enum', () => {
    expect(Object.keys(pairs).sort()).toEqual(Object.keys(Constants.public.Enums).sort());
  });

  for (const [name, schema] of Object.entries(pairs)) {
    it(name, () => {
      expect([...schema.options]).toEqual([
        ...Constants.public.Enums[name as keyof typeof Constants.public.Enums],
      ]);
    });
  }
});

// API shapes may omit DB columns (vectors, internal fields) but must not invent ones.
describe('API schemas only use real DB columns', () => {
  it('compile-time checks', () => {
    expectTypeOf<keyof Profile>().toExtend<keyof Tables<'profiles'>>();
    expectTypeOf<keyof Product>().toExtend<keyof Tables<'products'>>();
    expectTypeOf<keyof Outfit>().toExtend<keyof Tables<'outfits'>>();
    expectTypeOf<keyof DateRoom>().toExtend<keyof Tables<'date_rooms'>>();
    expectTypeOf<keyof RoomPair>().toExtend<keyof Tables<'room_pairs'>>();
  });
});
