import { render, screen } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSession } from '@/lib/session';
import { RequireAdult, RequireAgeConfirmed, RequireAuth } from './guards';

type MeState = { isPending: boolean; isError: boolean; data?: unknown };
let me: MeState;
vi.mock('@/lib/queries', () => ({ useMe: () => me }));

const profile = (over: Record<string, unknown>) => ({
  isPending: false,
  isError: false,
  data: { profile: { is_adult: true, age_confirmed_at: '2026-10-15T10:00:00Z', ...over } },
});

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/login', element: <p>login page</p> },
      {
        path: '/app',
        element: <RequireAuth />,
        children: [
          {
            element: <RequireAgeConfirmed />,
            children: [
              { path: 'onboarding', element: <p>age gate</p> },
              { path: 'feed', element: <p>feed</p> },
              {
                element: <RequireAdult />,
                children: [{ path: 'rooms/:id', element: <p>room</p> }],
              },
            ],
          },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
}

const signedIn = { user: { id: 'u1' }, access_token: 't' } as unknown as Session;

beforeEach(() => {
  me = profile({});
  useSession.setState({ ready: true, session: signedIn });
});

describe('route guards', () => {
  it('sends signed-out users to /login', async () => {
    useSession.setState({ ready: true, session: null });
    renderAt('/app/feed');
    expect(await screen.findByText('login page')).toBeInTheDocument();
  });

  it('waits for the persisted session before deciding', () => {
    useSession.setState({ ready: false, session: null });
    renderAt('/app/feed');
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('sends users who have not passed the age gate to onboarding', async () => {
    me = profile({ age_confirmed_at: null, is_adult: false });
    renderAt('/app/feed');
    expect(await screen.findByText('age gate')).toBeInTheDocument();
  });

  it('lets confirmed users into the app', async () => {
    renderAt('/app/feed');
    expect(await screen.findByText('feed')).toBeInTheDocument();
  });

  it('blocks non-adults from date rooms', async () => {
    me = profile({ is_adult: false });
    renderAt('/app/rooms/abc');
    expect(await screen.findByText('Adults only')).toBeInTheDocument();
    expect(screen.queryByText('room')).not.toBeInTheDocument();
  });

  it('lets adults into date rooms', async () => {
    renderAt('/app/rooms/abc');
    expect(await screen.findByText('room')).toBeInTheDocument();
  });
});
