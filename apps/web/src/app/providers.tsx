import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export function createWebQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, networkMode: 'online', staleTime: 0 },
      mutations: { retry: false, networkMode: 'online' },
    },
  });
}

export function Providers({
  client,
  children,
}: {
  client: QueryClient;
  children: ReactNode;
}) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
