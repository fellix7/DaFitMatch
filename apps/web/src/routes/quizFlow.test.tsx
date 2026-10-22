import { fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QUIZ_CARD_COUNT } from '@dafitmatch/shared';
import { QuizPage } from './QuizPage';

// ── mocks ──────────────────────────────────────────────────────────────────────
const mutate = vi.fn();
vi.mock('@/lib/queries', () => ({
  useQuizCards: () => ({
    isPending: false,
    isError: false,
    data: {
      cards: Array.from({ length: QUIZ_CARD_COUNT }, (_, i) => ({
        id: `22222222-2222-4222-8222-2222222200${String(i).padStart(2, '0')}`,
        archetype_id: '33333333-3333-4333-8333-333333333333',
        item_ids: ['44444444-4444-4444-8444-444444444444'],
        image_urls: ['https://x.test/card.jpg'],
      })),
    },
    refetch: vi.fn(),
  }),
  useSubmitQuiz: () => ({ mutate, isPending: false, isError: false, data: undefined }),
}));

function renderQuiz() {
  const router = createMemoryRouter(
    [
      { path: '/app/quiz', element: <QuizPage /> },
      { path: '/app/feed', element: <p>feed page</p> },
    ],
    { initialEntries: ['/app/quiz'] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  mutate.mockReset();
  // The deck remembers its run in sessionStorage: start every test from a clean slate.
  window.sessionStorage.clear();
});

describe('onboarding quiz', () => {
  it('walks basics -> swipe -> rules and submits 24 swipes with hard rules', () => {
    renderQuiz();
    fireEvent.click(screen.getByRole('button', { name: 'Start swiping' }));

    for (let i = 0; i < QUIZ_CARD_COUNT; i += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Like' }));
    }

    // Now on the rules step.
    fireEvent.click(screen.getByRole('button', { name: 'navy: neutral' }));
    fireEvent.click(screen.getByRole('button', { name: 'heels' }));
    fireEvent.click(screen.getByRole('button', { name: 'See my style' }));

    expect(mutate).toHaveBeenCalledTimes(1);
    const payload = mutate.mock.calls[0]![0];
    expect(payload.swipes).toHaveLength(QUIZ_CARD_COUNT);
    expect(payload.swipes[0]).toMatchObject({ action: 'like' });
    expect(payload.hard_rules).toMatchObject({
      colors_like: ['navy'],
      never_wear: ['heels'],
      comfort_vs_statement: 50,
    });
    expect(payload.basics).toMatchObject({ catalog: 'both', budget_band: '2000-5000' });
  });

  it('progresses the card counter and only enables submit after all swipes', () => {
    renderQuiz();
    fireEvent.click(screen.getByRole('button', { name: 'Start swiping' }));
    expect(screen.getByText(`Card 1 of ${QUIZ_CARD_COUNT}`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(screen.getByText(`Card 2 of ${QUIZ_CARD_COUNT}`)).toBeInTheDocument();
  });

  it('undoes the last swipe', () => {
    renderQuiz();
    fireEvent.click(screen.getByRole('button', { name: 'Start swiping' }));
    fireEvent.click(screen.getByRole('button', { name: 'Like' }));
    expect(screen.getByText(`Card 2 of ${QUIZ_CARD_COUNT}`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByText(`Card 1 of ${QUIZ_CARD_COUNT}`)).toBeInTheDocument();
  });

  it('answers with the keyboard', () => {
    renderQuiz();
    fireEvent.click(screen.getByRole('button', { name: 'Start swiping' }));
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByText(`Card 2 of ${QUIZ_CARD_COUNT}`)).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    expect(screen.getByText(`Card 3 of ${QUIZ_CARD_COUNT}`)).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByText(`Card 4 of ${QUIZ_CARD_COUNT}`)).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Backspace' });
    expect(screen.getByText(`Card 3 of ${QUIZ_CARD_COUNT}`)).toBeInTheDocument();
  });

  it('joins colours from like -> avoid -> clear', () => {
    renderQuiz();
    fireEvent.click(screen.getByRole('button', { name: 'Start swiping' }));
    for (let i = 0; i < QUIZ_CARD_COUNT; i += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    }
    const navy = () => screen.getByRole('button', { name: /^navy:/ });
    fireEvent.click(navy());
    expect(navy()).toHaveAttribute('data-state', 'like');
    fireEvent.click(navy());
    expect(navy()).toHaveAttribute('data-state', 'avoid');
    fireEvent.click(navy());
    expect(navy()).toHaveAttribute('data-state', 'none');
  });
});
