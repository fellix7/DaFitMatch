import type { FastifyPluginAsync } from 'fastify';
import { notImplemented } from '../register';

/** Stub: contracts live in packages/shared (endpoints.*); answers 501 until Phase 3. */
export const wardrobeRoutes: FastifyPluginAsync = async (app) => {
  notImplemented(app, 'listWardrobe', 3);
  notImplemented(app, 'addWardrobeItem', 3);
  notImplemented(app, 'updateWardrobeItem', 3);
  notImplemented(app, 'deleteWardrobeItem', 3);
};
