import { z } from 'zod';
import { CoordinationMode, Occasion, RoomStatus, Vote } from '../enums';
import { ColorName, Id, Inr, Timestamp } from './common';

export const InviteCode = z.string().regex(/^[A-Z0-9]{8}$/, 'Expected 8 uppercase letters/digits');

export const DateRoom = z.object({
  id: Id,
  user_a: Id.nullable(),
  user_b: Id.nullable(),
  invite_code: InviteCode,
  coordination_mode: CoordinationMode,
  occasion: Occasion,
  budget_a_inr: Inr.nullable(),
  budget_b_inr: Inr.nullable(),
  status: RoomStatus,
  created_at: Timestamp,
  updated_at: Timestamp,
});
export type DateRoom = z.infer<typeof DateRoom>;

export const RoomPair = z.object({
  id: Id,
  room_id: Id,
  outfit_a_id: Id.nullable(),
  outfit_b_id: Id.nullable(),
  palette: z.array(ColorName),
  pair_score: z.number().nullable(),
  vote_a: Vote.nullable(),
  vote_b: Vote.nullable(),
  is_locked: z.boolean(),
  venue_ids: z.array(Id),
  created_at: Timestamp,
});
export type RoomPair = z.infer<typeof RoomPair>;

/** What a member sees of their partner (via the room_members() RPC). Nothing else of the profile. */
export const RoomMember = z.object({
  user_id: Id,
  display_name: z.string().nullable(),
  seat: z.enum(['a', 'b']),
});
export type RoomMember = z.infer<typeof RoomMember>;
