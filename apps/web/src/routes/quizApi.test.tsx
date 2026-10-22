import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QUIZ_CARD_COUNT } from '@dafitmatch/shared';
import { QuizPage } from './QuizPage';

// The API client asks Supabase for the access token; the tests never talk to Supabase.
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { access_token: 'test-token' } } }),
    },
  },
}));

function renderQuiz() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: '/app/quiz', element: <QuizPage /> },
      { path: '/app/feed', element: <p>feed page</p> },
    ],
    { initialEntries: ['/app/quiz'] },
  );
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.sessionStorage.clear();
});

describe('quiz against the mock API', () => {
  it('loads the cards and saves the result', async () => {
    renderQuiz();
    fireEvent.click(await screen.findByRole('button', { name: 'Start swiping' }));
    expect(await screen.findByText(`Card 1 of ${QUIZ_CARD_COUNT}`)).toBeInTheDocument();

    for (let i = 0; i < QUIZ_CARD_COUNT; i += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Like' }));
    }
    fireEvent.click(await screen.findByRole('button', { name: 'See my style' }));

    // The submit response is validated against the shared contract by the API client.
    expect(await screen.findByText('Your style is ready')).toBeInTheDocument();
    expect(screen.getByText('Budget set to ₹6,000.')).toBeInTheDocument();
  });
});
