import type { FastifyPluginAsync } from 'fastify';
import { notImplemented } from '../register';

/** Stub: contracts live in packages/shared (endpoints.*); answers 501 until Phase 5. */
export const tryonRoutes: FastifyPluginAsync = async (app) => {
  notImplemented(app, 'requestTryOn', 5);
  notImplemented(app, 'getTryOn', 5);
};
