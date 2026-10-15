import type { FastifyPluginAsync } from 'fastify';
import { notImplemented } from '../register';

/** Stub: contracts live in packages/shared (endpoints.*); answers 501 until Phase 3. */
export const shopRoutes: FastifyPluginAsync = async (app) => {
  notImplemented(app, 'shopOutfit', 3);
};
