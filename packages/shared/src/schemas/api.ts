import { z } from 'zod';
import { CoordinationMode, Occasion, ProductGender, Vote } from '../enums';
import { Archetype, Product, Venue } from './catalog';
import { Id, Inr } from './common';
import { Outfit } from './outfit';
import { Profile } from './profile';
import { DateRoom, InviteCode, RoomMember, RoomPair } from './room';
import { TasteProfile } from './taste';
import { TryOn } from './interaction';

// ─── Request/response contracts for every HTTP endpoint ─────────────────────────────────
// The API registers these as Fastify route schemas; the web client validates responses
// against them. Add an endpoint here first, then implement it on both sides.

export const IdParams = z.object({ id: Id });
export const RoomPairParams = z.object({ id: Id, pairId: Id });

// health / me
export const HealthResponse = z.object({
  status: z.enum(['ok', 'degraded']),
  api: z.literal('ok'),
  db: z.enum(['ok', 'down']),
  time: z.iso.datetime(),
});
export type HealthResponse = z.infer<typeof HealthResponse>;

export const MeResponse = z.object({
  profile: Profile,
  taste_profile: TasteProfile.nullable(),
});
export type MeResponse = z.infer<typeof MeResponse>;

// outfits
export const ComposeOutfitsRequest = z.object({
  occasion: Occasion,
  budget_inr: Inr.min(500),
  gender: ProductGender,
  archetype_id: Id.optional(),
  /** Compose for a date room (applies its coordination mode + shared palette). */
  room_id: Id.optional(),
  count: z.number().int().min(1).max(10).default(3),
});
export type ComposeOutfitsRequest = z.infer<typeof ComposeOutfitsRequest>;

export const OutfitWithItems = Outfit.extend({ items: z.array(Product) });
export type OutfitWithItems = z.infer<typeof OutfitWithItems>;

export const ComposeOutfitsResponse = z.object({ outfits: z.array(OutfitWithItems) });
export type ComposeOutfitsResponse = z.infer<typeof ComposeOutfitsResponse>;

export const OutfitResponse = z.object({ outfit: OutfitWithItems });
export type OutfitResponse = z.infer<typeof OutfitResponse>;

// rooms
export const CreateRoomRequest = z.object({
  coordination_mode: CoordinationMode,
  occasion: Occasion,
  budget_inr: Inr.min(500).optional(),
});
export type CreateRoomRequest = z.infer<typeof CreateRoomRequest>;

export const JoinRoomRequest = z.object({
  invite_code: InviteCode,
  budget_inr: Inr.min(500).optional(),
});
export type JoinRoomRequest = z.infer<typeof JoinRoomRequest>;

export const RoomResponse = z.object({
  room: DateRoom,
  members: z.array(RoomMember),
  pairs: z.array(RoomPair),
});
export type RoomResponse = z.infer<typeof RoomResponse>;

export const VoteRequest = z.object({ vote: Vote });
export type VoteRequest = z.infer<typeof VoteRequest>;

export const RoomPairResponse = z.object({ pair: RoomPair });
export type RoomPairResponse = z.infer<typeof RoomPairResponse>;

export const OkResponse = z.object({ ok: z.literal(true) });
export type OkResponse = z.infer<typeof OkResponse>;

// try-on
export const TryOnRequest = z.object({
  product_id: Id,
  outfit_id: Id.optional(),
  /** Path inside the private `user-photos` bucket; must start with the caller's user id. */
  photo_path: z.string().regex(/^[0-9a-fA-F-]{36}\/[^/].*$/, 'Expected {user_id}/<file>'),
});
export type TryOnRequest = z.infer<typeof TryOnRequest>;

export const TryOnResponse = z.object({ tryon: TryOn });
export type TryOnResponse = z.infer<typeof TryOnResponse>;

// venues
export const ListVenuesQuery = z.object({
  room_id: Id.optional(),
  occasion: Occasion.optional(),
  archetype_id: Id.optional(),
  city: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(20).default(5),
});
export type ListVenuesQuery = z.infer<typeof ListVenuesQuery>;

export const ListVenuesResponse = z.object({ venues: z.array(Venue) });
export type ListVenuesResponse = z.infer<typeof ListVenuesResponse>;

// shop
export const ShopOutfitResponse = z.object({
  items: z.array(Product),
  total_price_inr: Inr,
  /** Must be rendered on every shop panel. */
  disclosure: z.string(),
});
export type ShopOutfitResponse = z.infer<typeof ShopOutfitResponse>;

// archetypes (public catalog read, used by onboarding)
export const ListArchetypesResponse = z.object({ archetypes: z.array(Archetype) });
export type ListArchetypesResponse = z.infer<typeof ListArchetypesResponse>;

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';
interface EndpointDef {
  method: Method;
  path: string;
  auth: boolean;
  params?: z.ZodType;
  query?: z.ZodType;
  body?: z.ZodType;
  response: z.ZodType;
}

/** Single registry of endpoints. Paths use Fastify-style `:param` placeholders. */
export const endpoints = {
  health: { method: 'GET', path: '/health', auth: false, response: HealthResponse },
  me: { method: 'GET', path: '/me', auth: true, response: MeResponse },

  composeOutfits: {
    method: 'POST',
    path: '/outfits/compose',
    auth: true,
    body: ComposeOutfitsRequest,
    response: ComposeOutfitsResponse,
  },
  getOutfit: {
    method: 'GET',
    path: '/outfits/:id',
    auth: true,
    params: IdParams,
    response: OutfitResponse,
  },

  createRoom: {
    method: 'POST',
    path: '/rooms',
    auth: true,
    body: CreateRoomRequest,
    response: RoomResponse,
  },
  joinRoom: {
    method: 'POST',
    path: '/rooms/join',
    auth: true,
    body: JoinRoomRequest,
    response: RoomResponse,
  },
  getRoom: {
    method: 'GET',
    path: '/rooms/:id',
    auth: true,
    params: IdParams,
    response: RoomResponse,
  },
  leaveRoom: {
    method: 'POST',
    path: '/rooms/:id/leave',
    auth: true,
    params: IdParams,
    response: OkResponse,
  },
  votePair: {
    method: 'POST',
    path: '/rooms/:id/pairs/:pairId/vote',
    auth: true,
    params: RoomPairParams,
    body: VoteRequest,
    response: RoomPairResponse,
  },
  lockPair: {
    method: 'POST',
    path: '/rooms/:id/pairs/:pairId/lock',
    auth: true,
    params: RoomPairParams,
    response: RoomPairResponse,
  },

  requestTryOn: {
    method: 'POST',
    path: '/tryon',
    auth: true,
    body: TryOnRequest,
    response: TryOnResponse,
  },
  getTryOn: {
    method: 'GET',
    path: '/tryon/:id',
    auth: true,
    params: IdParams,
    response: TryOnResponse,
  },

  listVenues: {
    method: 'GET',
    path: '/venues',
    auth: true,
    query: ListVenuesQuery,
    response: ListVenuesResponse,
  },

  shopOutfit: {
    method: 'GET',
    path: '/shop/outfits/:id',
    auth: true,
    params: IdParams,
    response: ShopOutfitResponse,
  },
} as const satisfies Record<string, EndpointDef>;

export type Endpoints = typeof endpoints;
export type EndpointName = keyof Endpoints;
