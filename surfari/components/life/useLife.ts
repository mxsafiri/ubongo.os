'use client';

import { useEffect, useState } from 'react';
import { useGameStore } from '@/store/game';
import { distanceM, placeById } from '@/lib/game/places';

/** Re-render every `ms` and return the server's idea of now. */
export function useServerNow(ms = 500) {
  const skew = useGameStore((s) => s.life.clockSkewMs);
  const [now, setNow] = useState(() => Date.now() + skew);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() + skew), ms);
    return () => clearInterval(t);
  }, [ms, skew]);
  return now;
}

/** Meters from your character to a place (null until you're placed). */
export function useDistanceTo(placeId: string | null) {
  const pos = useGameStore((s) => s.life.pos);
  if (!pos || !placeId || !placeById[placeId]) return null;
  return distanceM(pos, placeById[placeId]);
}

export const fmtDistance = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);
