import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as authModule from '@/lib/auth';
import { useDraft, type DraftAnswers } from '@/lib/draft';
import { useSession } from '@/lib/session';
import { AuthCallbackPage } from './AuthCallbackPage';
import { TryPage } from './TryPage';

// ── mocks ──────────────────────────────────────────────────────────────────────
const mutate = vi.fn();
vi.mock('@/lib/queries', () => ({
  useArchetypes: () => ({
    isPending: false,
    isError: false,
    data: {
      archetypes: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          slug: 'minimal',
          name: 'Minimal',
          benchmark_brands: ['COS'],
          description: '',
        },
      ],
    },
  }),
  useSaveTaste: () => ({ mutate }),
}));
vi.mock('@/lib/auth', async (orig) => ({
  ...(await orig<typeof authModule>()),
  signInWithGoogle: vi.fn(),
}));

const complete: DraftAnswers = {
  gender_presentation: 'feminine',
  shop_gender: 'women',
  occasion: 'rooftop',
  budget_inr: 6000,
  archetypes: ['minimal'],
  colors_like: ['ivory'],
  colors_avoid: [],
  never_wear: [],
  comfort_vs_statement: 3,
  fit_prefs: {},
  wardrobe_mode: 'mix',
};

const signedIn = { user: { id: 'u1' }, access_token: 't' } as unknown as Session;

function renderRoutes(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/try', element: <TryPage /> },
      { path: '/auth/callback', element: <AuthCallbackPage /> },
      { path: '/app/feed', element: <p>feed page</p> },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  mutate.mockReset();
  localStorage.clear();
  useDraft.getState().clear();
  useSession.setState({ ready: true, session: null });
});

describe('guest style builder', () => {
  it('keeps answers in localStorage as the user goes (survives the OAuth redirect)', () => {
    renderRoutes('/try');
    fireEvent.click(screen.getByRole('button', { name: /^Rooftop/ }));
    expect(useDraft.getState().answers.occasion).toBe('rooftop');
    const stored = JSON.parse(localStorage.getItem('dafitmatch.style-draft.v1')!);
    expect(stored.state.answers.occasion).toBe('rooftop');
  });

  it('shows what is missing instead of asking a guest to sign in too early', () => {
    renderRoutes('/try');
    fireEvent.click(screen.getByRole('button', { name: 'Generate fit' }));
    expect(screen.getByText('Pick the kind of date.')).toBeInTheDocument();
    expect(screen.queryByText('Sign in to generate your fit')).not.toBeInTheDocument();
    expect(useDraft.getState().pendingSave).toBe(false);
  });

  it('opens the Google sign-in popup on "Generate fit" once answers are complete', async () => {
    useDraft.getState().set(complete);
    renderRoutes('/try');
    fireEvent.click(screen.getByRole('button', { name: 'Generate fit' }));
    expect(await screen.findByText('Sign in to generate your fit')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Continue with Google/ })).toBeInTheDocument();
    expect(useDraft.getState().pendingSave).toBe(true);
  });

  it('skips the popup for signed-in users and goes straight to saving', async () => {
    useSession.setState({ ready: true, session: signedIn });
    useDraft.getState().set(complete);
    renderRoutes('/try');
    fireEvent.click(screen.getByRole('button', { name: 'Generate fit' }));
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
  });
});

describe('/auth/callback', () => {
  it('saves pending answers to the profile, then clears the draft and continues', async () => {
    useDraft.getState().set(complete);
    useDraft.getState().markPendingSave();
    useSession.setState({ ready: true, session: signedIn });
    mutate.mockImplementation((_answers, { onSuccess }) => onSuccess());

    const router = renderRoutes('/auth/callback?next=/app/feed');
    expect(await screen.findByText('feed page')).toBeInTheDocument();
    expect(mutate.mock.calls[0]![0]).toMatchObject({
      occasion: 'rooftop',
      archetypes: ['minimal'],
    });
    expect(useDraft.getState().pendingSave).toBe(false);
    expect(router.state.location.pathname).toBe('/app/feed');
  });

  it('keeps the answers and offers a retry if saving fails', async () => {
    useDraft.getState().set(complete);
    useDraft.getState().markPendingSave();
    useSession.setState({ ready: true, session: signedIn });
    mutate.mockImplementation((_answers, { onError }) => onError(new Error('500')));

    renderRoutes('/auth/callback');
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(useDraft.getState().pendingSave).toBe(true);
    expect(useDraft.getState().answers.occasion).toBe('rooftop');

    mutate.mockImplementation((_answers, { onSuccess }) => onSuccess());
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('feed page')).toBeInTheDocument();
  });

  it('does not save anything when there is no pending draft', async () => {
    useSession.setState({ ready: true, session: signedIn });
    renderRoutes('/auth/callback?next=/app/feed');
    expect(await screen.findByText('feed page')).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
  });

  it('never redirects off-site via ?next', async () => {
    useSession.setState({ ready: true, session: signedIn });
    const router = renderRoutes('/auth/callback?next=//evil.example');
    await screen.findByText('feed page');
    expect(router.state.location.pathname).toBe('/app/feed');
  });

  it('tells the user if sign-in did not complete, without losing answers', () => {
    useDraft.getState().set(complete);
    useDraft.getState().markPendingSave();
    renderRoutes('/auth/callback');
    expect(screen.getByText(/Sign-in did not complete/)).toBeInTheDocument();
    expect(useDraft.getState().pendingSave).toBe(true);
  });
});
