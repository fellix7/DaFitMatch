import { act, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSession } from '@/lib/session';
import { SiteHeader } from './SiteHeader';

vi.mock('@/lib/auth', async (orig) => ({
  ...(await orig<typeof authModule>()),
  signInWithGoogle: vi.fn(),
}));
import type * as authModule from '@/lib/auth';

function renderHeader(props: Parameters<typeof SiteHeader>[0] = {}) {
  const router = createMemoryRouter([{ path: '/', element: <SiteHeader {...props} /> }]);
  render(<RouterProvider router={router} />);
  return screen.getByTestId('header-auth');
}

function scrollTo(y: number) {
  act(() => {
    Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
    window.dispatchEvent(new Event('scroll'));
  });
}

beforeEach(() => {
  scrollTo(0);
  useSession.setState({ ready: true, session: null });
});

describe('SiteHeader sign-in button', () => {
  it('on the landing page: hidden at the top, slides in on the first scroll, then stays', () => {
    const auth = renderHeader({ revealOnScroll: true });
    expect(auth).toHaveAttribute('data-revealed', 'false');
    expect(auth).toHaveAttribute('aria-hidden', 'true');

    scrollTo(120);
    expect(auth).toHaveAttribute('data-revealed', 'true');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeVisible();

    scrollTo(0); // scrolling back up does not hide it again
    expect(auth).toHaveAttribute('data-revealed', 'true');
  });

  it('on other public pages: always visible', () => {
    const auth = renderHeader();
    expect(auth).toHaveAttribute('data-revealed', 'true');
  });

  it('opens the Google sign-in popup', async () => {
    renderHeader();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('button', { name: /Continue with Google/ })).toBeInTheDocument();
  });

  it('shows "Open app" instead when already signed in', () => {
    useSession.setState({
      ready: true,
      session: { user: { id: 'u1' } } as never,
    });
    renderHeader();
    expect(screen.getByRole('link', { name: 'Open app' })).toBeInTheDocument();
  });
});
