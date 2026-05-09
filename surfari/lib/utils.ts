import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTokens(amount: number): string {
  if (amount >= 1_000_000) {
    return `${(amount / 1_000_000).toFixed(1)}M`;
  }
  if (amount >= 1_000) {
    return `${Math.floor(amount / 1_000)}K`;
  }
  return amount.toString();
}

const PLAYER_COLORS = [
  '#00C2FF',
  '#FF7A35',
  '#00E096',
  '#FFB800',
  '#7C5CFC',
  '#FF4757',
];

const PATTERNS = ['circuit', 'wave', 'grid', 'hex', 'pulse', 'reef'];

export function randomPlayerColor(): string {
  return PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)];
}

export function randomPattern(): string {
  return PATTERNS[Math.floor(Math.random() * PATTERNS.length)];
}
