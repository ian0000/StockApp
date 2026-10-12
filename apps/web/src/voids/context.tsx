import { createContext } from 'react';
import type { VoidController } from './controller.js';
export const VoidsContext = createContext<{
  sale: VoidController;
  purchase: VoidController;
} | null>(null);
