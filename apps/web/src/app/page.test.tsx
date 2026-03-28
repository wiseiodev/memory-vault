import { render, screen } from '@testing-library/react';
import { createElement } from 'react';

import Home from './page';

describe('Home', () => {
  it('renders the memory vault foundation heading', () => {
    render(createElement(Home));

    expect(
      screen.getByRole('heading', {
        name: /memory vault foundations are ready/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /the repo is configured for web, extension, and mcp workspaces/i,
      ),
    ).toBeInTheDocument();
  });
});
