import { useEffect, useState } from 'react';
import { api } from './services/api';

type ApiStatus =
  { state: 'checking' } | { state: 'ok'; version: string } | { state: 'down'; message: string };

export default function App() {
  const [status, setStatus] = useState<ApiStatus>({ state: 'checking' });

  useEffect(() => {
    const controller = new AbortController();
    api
      .health(controller.signal)
      .then((h) => setStatus({ state: 'ok', version: h.version }))
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setStatus({ state: 'down', message: e instanceof Error ? e.message : 'Unknown error' });
      });
    return () => controller.abort();
  }, []);

  return (
    <div className="min-h-screen">
      <header className="bg-amber-banner border-b border-amber-300 px-4 py-2 text-sm">
        <p role="note">
          <strong>Demo data.</strong> Every price and delivery time in this prototype is sample data
          for fictional providers.
        </p>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">QuickCart Compare</h1>
        <p className="mt-3 text-lg">
          Find out which provider gives you the lowest total for the same basket, and how fast it
          arrives.
        </p>
        <p className="mt-6 text-base">
          The app is being built in phases. Location, search and comparison arrive in later phases.
        </p>

        <p
          className="bg-leaf-50 mt-8 inline-block rounded-md px-3 py-2 text-sm"
          role="status"
          aria-live="polite"
        >
          {status.state === 'checking' && 'Checking server…'}
          {status.state === 'ok' && `Server connected (version ${status.version})`}
          {status.state === 'down' && `Server not reachable: ${status.message}`}
        </p>
      </main>
    </div>
  );
}
