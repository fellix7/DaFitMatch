import type { FastifyInstance, FastifySchema } from 'fastify';
import { ApiError, endpoints, type EndpointName } from '@dafitmatch/shared';
import { errorBody } from '../lib/errors';

type EndpointDef = (typeof endpoints)[EndpointName];

/** Fastify route schema built from the shared contract (one source of truth). */
export function schemaFor(name: EndpointName): FastifySchema {
  const def: EndpointDef = endpoints[name];
  const schema: FastifySchema = {
    response: { 200: def.response, '4xx': ApiError, '5xx': ApiError },
  };
  if ('params' in def) schema.params = def.params;
  if ('query' in def) schema.querystring = def.query;
  if ('body' in def) schema.body = def.body;
  return schema;
}

/** Registers a contract-complete endpoint that answers 501 until its phase lands. */
export function notImplemented(app: FastifyInstance, name: EndpointName, phase: number): void {
  const def = endpoints[name];
  app.route({
    method: def.method,
    url: def.path,
    schema: schemaFor(name),
    handler: async (_request, reply) =>
      reply.code(501).send(errorBody('not_implemented', `${name} is coming in Phase ${phase}.`)),
  });
}
