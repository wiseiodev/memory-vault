import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';

vi.mock('@/lib/server/auth/session', () => ({
  getSession: vi.fn(async () => null),
}));

import Home from './page';

describe('Home', () => {
  it('renders the public home experience', async () => {
    render(await Home());

    expect(
      screen.getByRole('heading', {
        name: /memory vault is ready for its first real auth flow/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /the repo is configured for web, extension, and mcp workspaces/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', {
        name: /sign in with google/i,
      }),
    ).toHaveAttribute('href', '/login');
  });
});
