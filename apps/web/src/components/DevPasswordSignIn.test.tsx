import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

const flag = vi.hoisted(() => ({ on: false }));
vi.mock('@/lib/env', async (orig) => {
  const mod = await orig<{ env: Record<string, unknown> }>();
  return {
    env: new Proxy(mod.env, {
      get: (t, k) => (k === 'VITE_DEV_PASSWORD_LOGIN' ? flag.on : t[k as string]),
    }),
  };
});

const { DevPasswordSignIn } = await import('./DevPasswordSignIn');

function renderIt() {
  const router = createMemoryRouter([{ path: '/', element: <DevPasswordSignIn /> }]);
  render(<RouterProvider router={router} />);
}

describe('developer password sign-in', () => {
  it('is hidden unless VITE_DEV_PASSWORD_LOGIN=true (the default)', () => {
    flag.on = false;
    renderIt();
    expect(screen.queryByText(/Developer sign-in/)).not.toBeInTheDocument();
  });

  it('shows an email + password form when the dev flag is on', () => {
    flag.on = true;
    renderIt();
    expect(screen.getByLabelText('Developer email')).toBeInTheDocument();
    expect(screen.getByLabelText('Developer password')).toHaveAttribute('type', 'password');
  });
});
