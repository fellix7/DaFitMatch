import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse, delay } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSession } from '@/lib/session';
import { API_URL, USER_ID, feedProduct, interactionResponse } from '@/test/msw/handlers';
import { server } from '@/test/msw/server';
import { FeedPage } from './FeedPage';

// The API client asks Supabase for the access token; the tests never talk to Supabase.
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { access_token: 'test-token' } } }),
    },
  },
}));

function renderFeed() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      { path: '/app/feed', element: <FeedPage /> },
      { path: '/app/quiz', element: <p>quiz page</p> },
    ],
    { initialEntries: ['/app/feed'] },
  );
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { queryClient };
}

beforeEach(() => {
  useSession.setState({
    ready: true,
    session: { user: { id: USER_ID } } as unknown as ReturnType<
      typeof useSession.getState
    >['session'],
  });
});

describe('feed against the mock API', () => {
  it('renders the ranked products the API returned', async () => {
    renderFeed();
    expect(await screen.findByText('Item 1')).toBeInTheDocument();
    expect(screen.getByText('Item 2')).toBeInTheDocument();
  });

  it('marks a product as loved straight away and records the interaction', async () => {
    const calls: unknown[] = [];
    server.use(
      http.post(`${API_URL}/interactions`, async ({ request }) => {
        calls.push(await request.json());
        return HttpResponse.json(interactionResponse);
      }),
    );
    renderFeed();
    await screen.findByText('Item 1');
    fireEvent.click(screen.getAllByRole('button', { name: 'Love' })[0]!);
    expect(await screen.findByText('Loved')).toBeInTheDocument();
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({
      target_type: 'product',
      target_id: feedProduct(1).id,
      action: 'love',
    });
  });

  it('rolls the optimistic update back when the API rejects it', async () => {
    server.use(
      http.post(`${API_URL}/interactions`, async () => {
        await delay(300);
        return HttpResponse.json({ error: { code: 'internal', message: 'nope' } }, { status: 500 });
      }),
    );
    renderFeed();
    await screen.findByText('Item 1');
    fireEvent.click(screen.getAllByRole('button', { name: 'Love' })[0]!);
    expect(await screen.findByText('Loved')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Loved')).not.toBeInTheDocument());
  });

  it('asks for the next page when the feed has more', async () => {
    const cursors: (string | null)[] = [];
    server.use(
      http.get(`${API_URL}/feed/products`, ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor');
        cursors.push(cursor);
        if (!cursor) {
          return HttpResponse.json({
            products: [{ product: feedProduct(1), score: 0.8, reason_tags: [] }],
            next_cursor: '0.5|44444444-4444-4444-8444-444444444444',
          });
        }
        return HttpResponse.json({
          products: [{ product: feedProduct(2), score: 0.4, reason_tags: [] }],
          next_cursor: null,
        });
      }),
    );
    renderFeed();
    await screen.findByText('Item 1');
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('Item 2')).toBeInTheDocument();
    expect(cursors).toContain('0.5|44444444-4444-4444-8444-444444444444');
  });
});
