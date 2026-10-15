import type { FastifyPluginAsync } from 'fastify';
import { notImplemented } from '../register';

/** Stub: contracts live in packages/shared (endpoints.*); answers 501 until Phase 4. */
export const roomRoutes: FastifyPluginAsync = async (app) => {
  notImplemented(app, 'createRoom', 4);
  notImplemented(app, 'joinRoom', 4);
  notImplemented(app, 'getRoom', 4);
  notImplemented(app, 'leaveRoom', 4);
  notImplemented(app, 'votePair', 4);
  notImplemented(app, 'lockPair', 4);
};
