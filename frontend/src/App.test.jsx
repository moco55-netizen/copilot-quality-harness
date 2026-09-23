import { render, screen } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import App from './App.jsx';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => [{ id: 1, name: 'API contract', status: 'pending' }]
  }));
});

test('renders checks returned by the API', async () => {
  render(<App />);
  expect(await screen.findByText('API contract')).toBeInTheDocument();
  expect(screen.getByText('pending')).toBeInTheDocument();
});
