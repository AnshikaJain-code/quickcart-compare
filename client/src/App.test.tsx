import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

afterEach(() => vi.unstubAllGlobals());

describe('App', () => {
  it('shows the heading, the demo data note and the server status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: 'ok', version: '1.2.3' }),
      }),
    );

    render(<App />);

    expect(screen.getByRole('heading', { name: 'QuickCart Compare' })).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent(/demo data/i);
    expect(await screen.findByText(/server connected \(version 1\.2\.3\)/i)).toBeInTheDocument();
  });

  it('shows a readable message when the server is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('failed')));

    render(<App />);

    expect(await screen.findByText(/server not reachable/i)).toBeInTheDocument();
  });
});
