import { z } from 'zod';
import {
  CoordinationMode,
  InteractionAction,
  InteractionTarget,
  Occasion,
  ProductGender,
  Slot,
  Vote,
  WardrobeMode,
} from '../enums';
import { Archetype, Product, Venue } from './catalog';
import { Id, Inr } from './common';
import { Outfit } from './outfit';
import { ConfirmAgeRequest, ConfirmAgeResponse, Profile } from './profile';
import { DateRoom, InviteCode, RoomMember, RoomPair } from './room';
import { QuizCard, QuizSubmission, StyleQuizAnswers } from './quiz';
import { TasteProfile } from './taste';
import { Interaction, TryOn } from './interaction';
import { RankedProduct, FEED_MAX_PAGE_SIZE, FEED_PAGE_SIZE, FeedCursor } from './feed';
import { CreateWardrobeItemRequest, UpdateWardrobeItemRequest, WardrobeItem } from './wardrobe';

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
  /** off = catalog only; mix = reuse owned pieces where they fit; only = wardrobe only. */
  wardrobe_mode: WardrobeMode.default('mix'),
});
export type ComposeOutfitsRequest = z.infer<typeof ComposeOutfitsRequest>;

export const OutfitWithItems = Outfit.extend({
  items: z.array(Product),
  wardrobe_items: z.array(WardrobeItem),
});
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
  /** Only the catalog items still to buy; wardrobe pieces are excluded. */
  items: z.array(Product),
  total_price_inr: Inr,
  /** Must be rendered on every shop panel. */
  disclosure: z.string(),
});
export type ShopOutfitResponse = z.infer<typeof ShopOutfitResponse>;

// wardrobe
export const ListWardrobeResponse = z.object({ items: z.array(WardrobeItem) });
export type ListWardrobeResponse = z.infer<typeof ListWardrobeResponse>;

export const WardrobeItemResponse = z.object({ item: WardrobeItem });
export type WardrobeItemResponse = z.infer<typeof WardrobeItemResponse>;

// archetypes (public catalog read, used by onboarding)
export const ListArchetypesResponse = z.object({ archetypes: z.array(Archetype) });
export type ListArchetypesResponse = z.infer<typeof ListArchetypesResponse>;

// ─── Phase 2: onboarding quiz ───────────────────────────────────────────────────────────
/** GET /quiz/cards: optional gender filter; omit for a balanced mix across both catalogs. */
export const ListQuizCardsQuery = z.object({
  gender: ProductGender.optional(),
});
export type ListQuizCardsQuery = z.infer<typeof ListQuizCardsQuery>;

export const ListQuizCardsResponse = z.object({
  cards: z.array(QuizCard),
});
export type ListQuizCardsResponse = z.infer<typeof ListQuizCardsResponse>;

/** One matched archetype in the quiz result ("Your style: …"). */
export const ArchetypeMatch = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  weight: z.number().min(0).max(1),
  description: z.string(),
  benchmark_brands: z.array(z.string()),
});
export type ArchetypeMatch = z.infer<typeof ArchetypeMatch>;

/** POST /quiz/submit response: the saved profile summary + the caller's top archetypes. */
export const SubmitQuizResponse = z.object({
  taste_profile: TasteProfile,
  top_archetypes: z.array(ArchetypeMatch).max(3),
  budget_inr: Inr,
});
export type SubmitQuizResponse = z.infer<typeof SubmitQuizResponse>;

// ─── Phase 2: taste-ranked feed ─────────────────────────────────────────────────────────
export const ListFeedProductsQuery = z.object({
  slot: Slot.optional(),
  gender: ProductGender.optional(),
  max_price: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(FEED_MAX_PAGE_SIZE).default(FEED_PAGE_SIZE),
  cursor: FeedCursor.optional(),
});
export type ListFeedProductsQuery = z.infer<typeof ListFeedProductsQuery>;

export const ListFeedProductsResponse = z.object({
  products: z.array(RankedProduct),
  /** Pass back as `cursor` for the next page; null when exhausted. */
  next_cursor: z.string().nullable(),
});
export type ListFeedProductsResponse = z.infer<typeof ListFeedProductsResponse>;

// ─── Phase 2: interactions ──────────────────────────────────────────────────────────────
export const RecordInteractionRequest = z.object({
  target_type: InteractionTarget,
  target_id: Id,
  action: InteractionAction,
});
export type RecordInteractionRequest = z.infer<typeof RecordInteractionRequest>;

export const RecordInteractionResponse = z.object({
  interaction: Interaction,
  taste: z.object({
    interaction_count: z.number().int().nonnegative(),
    version: z.number().int().nonnegative(),
  }),
});
export type RecordInteractionResponse = z.infer<typeof RecordInteractionResponse>;

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
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
  saveTaste: {
    method: 'PUT',
    path: '/me/taste',
    auth: true,
    body: StyleQuizAnswers,
    response: MeResponse,
  },
  listArchetypes: {
    method: 'GET',
    path: '/archetypes',
    auth: false,
    response: ListArchetypesResponse,
  },
  confirmAge: {
    method: 'POST',
    path: '/me/age',
    auth: true,
    body: ConfirmAgeRequest,
    response: ConfirmAgeResponse,
  },

  listQuizCards: {
    method: 'GET',
    path: '/quiz/cards',
    auth: true,
    query: ListQuizCardsQuery,
    response: ListQuizCardsResponse,
  },
  submitQuiz: {
    method: 'POST',
    path: '/quiz/submit',
    auth: true,
    body: QuizSubmission,
    response: SubmitQuizResponse,
  },
  listFeedProducts: {
    method: 'GET',
    path: '/feed/products',
    auth: true,
    query: ListFeedProductsQuery,
    response: ListFeedProductsResponse,
  },
  recordInteraction: {
    method: 'POST',
    path: '/interactions',
    auth: true,
    body: RecordInteractionRequest,
    response: RecordInteractionResponse,
  },

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

  listWardrobe: {
    method: 'GET',
    path: '/wardrobe',
    auth: true,
    response: ListWardrobeResponse,
  },
  addWardrobeItem: {
    method: 'POST',
    path: '/wardrobe',
    auth: true,
    body: CreateWardrobeItemRequest,
    response: WardrobeItemResponse,
  },
  updateWardrobeItem: {
    method: 'PATCH',
    path: '/wardrobe/:id',
    auth: true,
    params: IdParams,
    body: UpdateWardrobeItemRequest,
    response: WardrobeItemResponse,
  },
  deleteWardrobeItem: {
    method: 'DELETE',
    path: '/wardrobe/:id',
    auth: true,
    params: IdParams,
    response: OkResponse,
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
