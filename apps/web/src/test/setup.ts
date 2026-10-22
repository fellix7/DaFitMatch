import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeAll, afterAll } from 'vitest';
import { server } from './msw/server';

// Vitest globals are off, so Testing Library cannot register its auto-cleanup.
afterEach(() => cleanup());

// Every network call in a test goes through the mock API; an unmocked one is a bug.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
