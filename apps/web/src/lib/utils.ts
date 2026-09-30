import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Width of a column of Space keys set in a monospace font: as wide as the longest key (keys
 * run up to 10 characters), so a long key never runs into the name beside it.
 */
export const keyColumnWidth = (keys: string[]) => `${Math.max(3, ...keys.map((k) => k.length))}ch`;
