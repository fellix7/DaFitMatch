import { fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AFFILIATE_DISCLOSURE } from '@dafitmatch/shared';
import { FeedPage } from './FeedPage';

const h = vi.hoisted(() => ({
  feed: null as unknown,
  recordMutate: vi.fn(),
}));

vi.mock('@/lib/queries', () => ({
  useMe: () => ({
    data: { profile: { display_name: 'Asha', default_budget_inr: 6000 }, taste_profile: null },
  }),
  useFeedProducts: () => h.feed,
  useRecordInteraction: () => ({ mutate: h.recordMutate }),
}));

const product = (n: number, reason: string[]) => ({
  product: {
    id: `44444444-4444-4444-8444-4444444400${String(n).padStart(2, '0')}`,
    source: 'other',
    external_id: `SKU-${n}`,
    brand: 'Acme',
    title: `Item ${n}`,
    category: 'shirt',
    slot: 'top',
    gender: 'women',
    colors: ['navy'],
    formality: 2,
    occasions: ['dinner'],
    price_inr: 1999,
    image_url: 'https://x.test/a.jpg',
    affiliate_url: 'https://x.test/buy',
    in_stock: true,
    last_seen_at: '2026-10-15T10:00:00+00:00',
  },
  score: 0.8,
  reason_tags: reason,
});

function feedResult(products: ReturnType<typeof product>[]) {
  return {
    isPending: false,
    isError: false,
    data: { pages: [{ products, next_cursor: null }], pageParams: [null] },
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  };
}

function renderFeed() {
  const router = createMemoryRouter(
    [
      { path: '/app/feed', element: <FeedPage /> },
      { path: '/app/quiz', element: <p>quiz page</p> },
    ],
    { initialEntries: ['/app/feed'] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  h.recordMutate.mockReset();
  h.feed = feedResult([product(1, ['in your palette', 'matches your saved styles'])]);
});

describe('taste-ranked feed', () => {
  it('renders ranked products with reason tags and the affiliate disclosure', () => {
    renderFeed();
    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(screen.getByText('₹1,999')).toBeInTheDocument();
    expect(screen.getByText('in your palette · matches your saved styles')).toBeInTheDocument();
    expect(screen.getByText(AFFILIATE_DISCLOSURE)).toBeInTheDocument();
  });

  it('logs an interaction when a product action is pressed', () => {
    renderFeed();
    fireEvent.click(screen.getByRole('button', { name: 'Love' }));
    expect(h.recordMutate).toHaveBeenCalledWith({
      target_type: 'product',
      target_id: '44444444-4444-4444-8444-444444440001',
      action: 'love',
    });
  });

  it('prompts for the quiz when the feed is empty', () => {
    h.feed = feedResult([]);
    renderFeed();
    expect(screen.getByRole('link', { name: 'Take the style quiz' })).toHaveAttribute(
      'href',
      '/app/quiz',
    );
  });
});
