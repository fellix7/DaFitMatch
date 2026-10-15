import type { ApiError } from '@dafitmatch/shared';

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const unauthorized = (message = 'Missing or invalid access token') =>
  new HttpError(401, 'unauthorized', message);
export const forbidden = (message = 'Not allowed') => new HttpError(403, 'forbidden', message);
export const notFound = (message = 'Not found') => new HttpError(404, 'not_found', message);

export function errorBody(code: string, message: string, details?: unknown): ApiError {
  return { error: details === undefined ? { code, message } : { code, message, details } };
}
