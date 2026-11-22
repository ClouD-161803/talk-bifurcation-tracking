import { systemOf } from './systems.ts';

export const FILED = ['saddle'];

export const dataFileOf = (backdrop: string, system: string | null): string | null =>
  backdrop === 'poincare' ? `poincare-${systemOf(system)}` : backdrop === 'tori' || FILED.includes(backdrop) ? backdrop : null;
