import type { FastifyPluginAsync } from 'fastify';
import { notImplemented } from '../register';

/** Stub: contracts live in packages/shared (endpoints.*); answers 501 until Phase 3. */
export const outfitRoutes: FastifyPluginAsync = async (app) => {
  notImplemented(app, 'composeOutfits', 3);
  notImplemented(app, 'getOutfit', 3);
};
