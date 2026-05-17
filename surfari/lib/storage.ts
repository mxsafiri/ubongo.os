import type { PlayerCard } from '@/types';

const KEY = 'surfari-player';

export function savePlayer(p: PlayerCard) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify({
    id: p.id,
    handle: p.handle,
    avatar_color: p.avatar_color,
    avatar_pattern: p.avatar_pattern,
  }));
}

export function loadSavedPlayer(): { id: string; handle: string; avatar_color: string; avatar_pattern: string } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearSavedPlayer() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(KEY);
}
