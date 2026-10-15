import type { FastifyPluginAsync } from 'fastify';
import { notImplemented } from '../register';

/** Stub: contracts live in packages/shared (endpoints.*); answers 501 until Phase 5. */
export const venueRoutes: FastifyPluginAsync = async (app) => {
  notImplemented(app, 'listVenues', 5);
};
