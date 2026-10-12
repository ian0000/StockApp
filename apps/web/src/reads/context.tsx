import { createContext, useContext } from 'react';
import type { ReadsClient } from './client.js';
export const ReadsContext = createContext<ReadsClient | null>(null);
export function useReads() {
  const client = useContext(ReadsContext);
  if (!client) throw new Error('Read client unavailable');
  return client;
}
